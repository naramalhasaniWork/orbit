import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { launchPipelineRun } from "@/services/orchestrator/run-launcher";
import { slackWorkspace, verifiedSlackBody } from "@/services/integrations/slack-inbound";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string | undefined): value is string => !!value && UUID.test(value);

interface SlackAction {
  action_id: string;
  value: string;
  type: string;
}

interface SlackInteractionPayload {
  type: string;
  actions: SlackAction[];
  user: { id: string; username: string };
  team: { id: string };
  channel: { id: string };
  response_url: string;
  message: {
    ts: string;
    blocks: unknown[];
  };
}

async function sendSlackResponse(
  responseUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Every action's ids come from the button value, so each lookup is scoped to the workspace
// the signed team id is bound to: a value naming another workspace's run reads as not found.

async function handleRerunAction(
  workspaceId: string,
  action: SlackAction,
  payload: SlackInteractionPayload
): Promise<void> {
  const runId = action.value;

  const originalRun = !isUuid(runId) ? null : await prisma.testRun.findFirst({
    where: { id: runId, project: { workspaceId } },
    select: {
      projectId: true,
      mode: true,
      branch: true,
      project: { select: { defaultBranch: true } },
    },
  });

  if (!originalRun) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Original run not found.",
    });
    return;
  }

  const launched = await launchPipelineRun({
    projectId: originalRun.projectId,
    mode: originalRun.mode,
    trigger: "manual",
    branch: originalRun.branch ?? originalRun.project.defaultBranch,
    metadata: { rerunOf: runId },
  });

  if (!launched.ok) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: `Re-run not started: ${launched.reason}`,
    });
    return;
  }

  await sendSlackResponse(payload.response_url, {
    response_type: "in_channel",
    replace_original: false,
    text: ":arrows_counterclockwise: Re-run triggered by <@" + payload.user.id + ">. Run ID: `" + launched.runId + "`",
  });
}

async function handleMarkFlakyAction(
  workspaceId: string,
  action: SlackAction,
  payload: SlackInteractionPayload
): Promise<void> {
  const [testCaseId, projectId] = action.value.split("|");
  const testCase =
    isUuid(testCaseId) && isUuid(projectId)
      ? await prisma.testCase.findFirst({
          where: { id: testCaseId, projectId, project: { workspaceId } },
          select: { id: true },
        })
      : null;

  if (!testCase) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Invalid action data.",
    });
    return;
  }

  await prisma.flakyTest.upsert({
    where: {
      flaky_test_unique: {
        projectId,
        testCaseId,
      },
    },
    update: {
      occurrences: { increment: 1 },
      lastFlakyAt: new Date(),
    },
    create: {
      projectId,
      testCaseId,
      occurrences: 1,
      isQuarantined: true,
    },
  });

  await sendSlackResponse(payload.response_url, {
    response_type: "in_channel",
    replace_original: false,
    text: `:label: Test marked as flaky and quarantined by <@${payload.user.id}>.`,
  });
}

async function handleCreateIssueAction(
  workspaceId: string,
  action: SlackAction,
  payload: SlackInteractionPayload
): Promise<void> {
  const [testResultId, projectId] = action.value.split("|");

  if (!isUuid(testResultId) || !isUuid(projectId)) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Invalid action data.",
    });
    return;
  }

  const result = await prisma.testResult.findFirst({
    where: { id: testResultId, testRun: { projectId, project: { workspaceId } } },
    include: { testCase: { select: { name: true } } },
  });

  if (!result) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Test result not found.",
    });
    return;
  }

  const { createBugIssue } = await import(
    "@/services/reporting/integrations/linear"
  );

  const issueResult = await createBugIssue(
    {
      title: `Test Failure: ${result.testCase.name}`,
      description: result.failureExplanation ?? "Test failed during execution.",
      stepsToReproduce: ["Run the test suite", `Execute test: ${result.testCase.name}`],
      expectedBehavior: "Test should pass",
      actualBehavior: result.failureExplanation ?? "Test failed",
      severity: "medium",
      screenshotUrls: [],
      suggestedFix: result.suggestedFix ?? undefined,
    },
    projectId
  );

  if (issueResult.success) {
    await sendSlackResponse(payload.response_url, {
      response_type: "in_channel",
      replace_original: false,
      text: `:ticket: Linear issue created by <@${payload.user.id}>: <${issueResult.issueUrl}|${issueResult.issueId}>`,
    });
  } else {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Failed to create Linear issue. Check Linear integration settings.",
    });
  }
}

export async function POST(req: NextRequest) {
  const verified = await verifiedSlackBody(req);
  if (verified instanceof NextResponse) return verified;
  const body = verified.body;

  // Slack sends interaction payloads as form-encoded with a "payload" field
  const params = new URLSearchParams(body);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.type !== "block_actions" || !payload.actions?.length) {
    return NextResponse.json({ status: "ignored" });
  }

  const workspace = await slackWorkspace(payload.team?.id ?? "");
  if ("message" in workspace) {
    if (payload.response_url) {
      await sendSlackResponse(payload.response_url, { response_type: "ephemeral", replace_original: false, text: workspace.message });
    }
    return NextResponse.json({ status: "unlinked" });
  }

  const action = payload.actions[0];

  switch (action.action_id) {
    case "orbit_rerun":
      await handleRerunAction(workspace.workspaceId, action, payload);
      break;

    case "orbit_mark_flaky":
      await handleMarkFlakyAction(workspace.workspaceId, action, payload);
      break;

    case "orbit_create_issue":
      await handleCreateIssueAction(workspace.workspaceId, action, payload);
      break;

    default:
      return NextResponse.json({ status: "unknown_action" });
  }

  // Return 200 immediately; responses are sent via response_url
  return NextResponse.json({ status: "ok" });
}
