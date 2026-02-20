import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// POST /api/projects/[projectId]/linear-issue
// Create a Linear issue from a test failure
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { testResultId, testCaseName, failureExplanation, suggestedFix, runId } =
      body as {
        testResultId: string;
        testCaseName: string;
        failureExplanation: string | null;
        suggestedFix: string | null;
        runId?: string;
      };

    if (!testResultId || !testCaseName) {
      return apiError(
        "testResultId and testCaseName are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Find Linear integration config
    const integration = await prisma.integrationConfig.findFirst({
      where: { workspaceId, provider: "linear", isEnabled: true },
      select: { id: true, config: true },
    });

    if (!integration) {
      return apiError(
        "Linear integration not connected",
        "INTEGRATION_NOT_FOUND",
        400
      );
    }

    const config = integration.config as Record<string, unknown>;
    const apiKey = config.apiKey as string | undefined;
    const teamId = config.teamId as string | undefined;

    if (!apiKey || !teamId) {
      return apiError(
        "Linear integration not fully configured",
        "INTEGRATION_ERROR",
        400
      );
    }

    // Build issue title and description
    const title = `[Orbit] Test Failure: ${testCaseName}`;
    const descriptionParts = [
      `**Project:** ${project.name}`,
      runId ? `**Run ID:** \`${runId}\`` : null,
      `**Test Result:** \`${testResultId}\``,
      "",
      "## Failure Analysis",
      failureExplanation ?? "No analysis available.",
      "",
    ];

    if (suggestedFix) {
      descriptionParts.push("## Suggested Fix", "```", suggestedFix, "```", "");
    }

    descriptionParts.push("---", "*Created automatically by Orbit*");

    const description = descriptionParts.filter(Boolean).join("\n");

    // Create issue via Linear API
    const linearResponse = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: `
          mutation CreateIssue($title: String!, $description: String!, $teamId: String!) {
            issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
              success
              issue {
                id
                identifier
                url
              }
            }
          }
        `,
        variables: { title, description, teamId },
      }),
    });

    if (!linearResponse.ok) {
      return apiError("Failed to create Linear issue", "LINEAR_ERROR", 502);
    }

    const linearData = (await linearResponse.json()) as {
      data?: {
        issueCreate?: {
          success: boolean;
          issue?: { id: string; identifier: string; url: string };
        };
      };
    };

    const issue = linearData.data?.issueCreate?.issue;
    if (!issue) {
      return apiError("Linear did not return issue data", "LINEAR_ERROR", 502);
    }

    return apiSuccess({
      issueId: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
