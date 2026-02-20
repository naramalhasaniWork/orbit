import type { RunSummary, FailureSummary } from "@/agents/schemas/run-summary";

interface SlackNotificationResult {
  success: boolean;
  channelId: string;
  messageTs: string;
}

interface SlackAlertResult {
  success: boolean;
  channelId: string;
  messageTs: string;
  severity: string;
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

function formatRunSummaryAsBlocks(summary: RunSummary): SlackBlock[] {
  const statusEmoji = summary.failed > 0 ? ":x:" : ":white_check_mark:";
  const passRate =
    summary.totalTests > 0
      ? ((summary.passed / summary.totalTests) * 100).toFixed(1)
      : "0.0";
  const durationSec = (summary.durationMs / 1000).toFixed(1);

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${statusEmoji} Orbit Test Run ${summary.failed > 0 ? "Failed" : "Passed"}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Total Tests:*\n${summary.totalTests}` },
        { type: "mrkdwn", text: `*Pass Rate:*\n${passRate}%` },
        { type: "mrkdwn", text: `*Passed:*\n${summary.passed}` },
        { type: "mrkdwn", text: `*Failed:*\n${summary.failed}` },
        { type: "mrkdwn", text: `*Duration:*\n${durationSec}s` },
        { type: "mrkdwn", text: `*Credits:*\n${summary.creditsConsumed}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> ${summary.summary}`,
      },
    },
  ];

  if (summary.failures.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top Failures:*\n${summary.failures
          .slice(0, 3)
          .map(
            (f) =>
              `- [${f.severity.toUpperCase()}] *${f.testName}*: ${f.explanation}`
          )
          .join("\n")}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Run ID: ${summary.runId} | Mode: ${summary.mode} | Trigger: ${summary.trigger}`,
      },
    ],
  });

  return blocks;
}

function formatFailureAlertAsBlocks(
  failure: FailureSummary
): SlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `:rotating_light: Critical Test Failure`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${failure.testName}*\nSeverity: *${failure.severity.toUpperCase()}*`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*What happened:*\n${failure.explanation}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Suggested fix:*\n${failure.suggestedFix}`,
      },
    },
  ];
}

async function postSlackWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; ts: string }> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Slack webhook error (${response.status}): ${errorText}`);
  }

  // Incoming webhooks return "ok" as text, not JSON
  const responseText = await response.text();
  return {
    ok: responseText === "ok" || response.ok,
    ts: String(Date.now()),
  };
}

export async function sendRunNotification(
  webhookUrl: string,
  summary: RunSummary
): Promise<SlackNotificationResult> {
  const blocks = formatRunSummaryAsBlocks(summary);

  if (!webhookUrl) {
    console.warn("[slack] No webhook URL provided, skipping notification");
    return { success: false, channelId: "", messageTs: "" };
  }

  try {
    const result = await postSlackWebhook(webhookUrl, { blocks });
    return {
      success: result.ok,
      channelId: webhookUrl,
      messageTs: result.ts,
    };
  } catch (error) {
    console.warn("[slack] Run notification failed:", error);
    return { success: false, channelId: webhookUrl, messageTs: "" };
  }
}

export async function sendFailureAlert(
  webhookUrl: string,
  failure: FailureSummary
): Promise<SlackAlertResult> {
  const blocks = formatFailureAlertAsBlocks(failure);

  if (!webhookUrl) {
    console.warn("[slack] No webhook URL provided, skipping failure alert");
    return {
      success: false,
      channelId: "",
      messageTs: "",
      severity: failure.severity,
    };
  }

  try {
    const result = await postSlackWebhook(webhookUrl, { blocks });
    return {
      success: result.ok,
      channelId: webhookUrl,
      messageTs: result.ts,
      severity: failure.severity,
    };
  } catch (error) {
    console.warn("[slack] Failure alert failed:", error);
    return {
      success: false,
      channelId: webhookUrl,
      messageTs: "",
      severity: failure.severity,
    };
  }
}

export { formatRunSummaryAsBlocks, formatFailureAlertAsBlocks };
export type { SlackNotificationResult, SlackAlertResult, SlackBlock };
