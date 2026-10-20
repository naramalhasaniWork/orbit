import type { Job } from "bullmq";
import { PlanningJobDataSchema, type PlanningJobData } from "@/lib/queue/queues";

/**
 * Plan generation (minutes of LLM work) and AI suggestion refreshes run
 * here, off the request path. Progress goes to Redis state + pub/sub so the
 * Test Plans page can stream it and resume it after a reload.
 */
export async function handlePlanningJob(job: Job<PlanningJobData>): Promise<void> {
  const data = PlanningJobDataSchema.parse(job.data);

  if (data.kind === "suggestions") {
    const { getFlag } = await import("@/lib/system-config");
    const { refreshLLMSuggestions } = await import("@/services/ai-suggestions/suggestion-cache");
    if (await getFlag("ai_suggestions")) {
      await refreshLLMSuggestions(data.projectId);
    }
    return;
  }

  const { generatePlan } = await import("@/services/planning/planner");
  const { writePlanJobState, sanitizePlanError } = await import("@/services/planning/plan-jobs");
  const { requestSuggestionRefresh } = await import("@/services/ai-suggestions/suggestion-cache");
  const { projectId, mode, focusAreas, excludePaths, maxTestCases } = data;
  const jobId = job.id ?? "unknown";
  const now = () => new Date().toISOString();

  await writePlanJobState(projectId, {
    jobId,
    status: "running",
    phase: "starting",
    message: "Starting plan generation...",
    progress: 5,
    updatedAt: now(),
  });

  try {
    const result = await generatePlan({
      projectId,
      mode,
      focusAreas,
      excludePaths,
      maxTestCases,
      onProgress: (p) =>
        writePlanJobState(projectId, { jobId, status: "running", ...p, updatedAt: now() }),
    });

    await writePlanJobState(projectId, {
      jobId,
      status: "completed",
      phase: "complete",
      message: `Plan v${result.plan.version} ready with ${result.testCases.length} test cases`,
      progress: 100,
      planId: result.plan.id,
      version: result.plan.version,
      testCaseCount: result.testCases.length,
      updatedAt: now(),
    });
  } catch (err) {
    console.error(`[Worker:planning] Plan generation failed for ${projectId}:`, err);
    await writePlanJobState(projectId, {
      jobId,
      status: "failed",
      phase: "failed",
      message: "Plan generation failed",
      progress: 0,
      error: sanitizePlanError(err),
      updatedAt: now(),
    });
    throw err;
  }

  // Warm the suggestions cache for the new plan so the page doesn't have to.
  await requestSuggestionRefresh(projectId).catch((err) => {
    console.error(`[Worker:planning] Could not queue suggestions for ${projectId}:`, err);
  });
}
