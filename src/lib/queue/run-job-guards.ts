// Guards that keep queue-driven runs from ending anywhere but a terminal
// status (completed / failed / cancelled) when a worker throws.
import { ShutdownError } from "@/lib/queue/shutdown";
import { RunLockedError } from "@/lib/queue/run-locked";

/** Drive an event-triggered run through the orchestrator pipeline. */
export async function runPipelineForJob(runId: string, changedFiles?: string[]): Promise<void> {
  try {
    // A delayed retry can land after the run finished elsewhere: don't start it over.
    const { prisma } = await import("@/lib/db");
    const current = await prisma.testRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (current && ["completed", "failed", "cancelled"].includes(current.status)) {
      console.log(`[Worker:indexing] Run ${runId} already ${current.status}, nothing to do`);
      return;
    }

    const { executePipelineForRun } = await import("@/services/orchestrator/pipeline");
    await executePipelineForRun(runId, { changedFiles });
  } catch (err) {
    // Retryable: the run stays active and the retry resumes it
    if (err instanceof ShutdownError || err instanceof RunLockedError) throw err;
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
