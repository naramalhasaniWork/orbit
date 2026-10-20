import { z } from "zod";
import { apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";
import { findLatestLiveScript } from "@/server/engine/replay/script-store";
import { renderPlaywrightSpec } from "@/server/engine/replay/export-spec";

// ============================================================
// GET /api/projects/[projectId]/test-cases/[testCaseId]/script.spec.ts
// The case's compiled replay script as a standalone Playwright test.
// ============================================================

const Params = z.object({ projectId: z.string().uuid(), testCaseId: z.string().uuid() });

export const GET = route(
  { permission: "plans.view", params: Params },
  async ({ params: { projectId, testCaseId }, db }) => {
    const project = await db.project(projectId);
    const testCase = await project.testCase.findUnique({
      where: { id: testCaseId },
      select: { name: true, steps: true },
    });
    if (!testCase) {
      return apiError("Test case not found", "NOT_FOUND", 404);
    }

    const script = await findLatestLiveScript(testCaseId);
    if (!script) {
      return apiError("This test case has no compiled script yet", "NOT_FOUND", 404);
    }

    const environment = await project.environment.findFirst({
      where: { id: script.envKey.split(":")[0] },
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
  }
);
