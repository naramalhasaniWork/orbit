// Guards that keep queue-driven runs from ending anywhere but a terminal
// status (completed / failed / cancelled) when a worker throws.

/** Drive an event-triggered run through the orchestrator pipeline. */
export async function runPipelineForJob(runId: string, changedFiles?: string[]): Promise<void> {
  try {
    const { executePipelineForRun } = await import("@/services/orchestrator/pipeline");
    await executePipelineForRun(runId, { changedFiles });
  } catch (err) {
    console.error(`[Worker:indexing] Pipeline crashed for run ${runId}:`, err);
    await markRunFailed(runId, `Run could not complete: ${errorMessage(err)}`);
  }
}

export async function markRunFailed(runId: string, reason: string): Promise<void> {
  try {
    const { failRunIfActive } = await import("@/services/orchestrator/run-manager");
    await failRunIfActive(runId, reason);
  } catch (err) {
    console.error(`[Worker] Could not mark run ${runId} failed:`, err);
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
