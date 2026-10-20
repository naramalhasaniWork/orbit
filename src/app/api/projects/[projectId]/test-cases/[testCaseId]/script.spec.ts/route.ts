import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace, apiError, handleApiError } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { findLatestLiveScript } from "@/server/engine/replay/script-store";
import { renderPlaywrightSpec } from "@/server/engine/replay/export-spec";

// ============================================================
// GET /api/projects/[projectId]/test-cases/[testCaseId]/script.spec.ts
// The case's compiled replay script as a standalone Playwright test.
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; testCaseId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "plans.view");
    const { projectId, testCaseId } = await params;

    const testCase = await prisma.testCase.findFirst({
      where: { id: testCaseId, projectId, project: { workspaceId } },
      select: { name: true, steps: true },
    });
    if (!testCase) {
      return apiError("Test case not found", "NOT_FOUND", 404);
    }

    const script = await findLatestLiveScript(testCaseId);
    if (!script) {
      return apiError("This test case has no compiled script yet", "NOT_FOUND", 404);
    }

    const environment = await prisma.environment.findFirst({
      where: { id: script.envKey.split(":")[0], projectId },
      select: { url: true },
    });

    const spec = renderPlaywrightSpec({
      testCaseName: testCase.name,
      steps: testCase.steps as Array<{ action: string; expected: string }>,
      version: script.version,
      startUrl: environment?.url ?? "/",
      actions: script.actions,
    });
    const filename = `${testCase.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "test"}.spec.ts`;
    return new Response(spec, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
