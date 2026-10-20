/**
 * Another worker holds the run lock and the run is not finished. Retryable:
 * the job handler delays the job (see withRunSlot) and tries again, which
 * covers both a live holder and a stale lock left by a killed worker.
 */
export class RunLockedError extends Error {
  readonly retryable = true;
  constructor(readonly runId: string, readonly retryAfterMs: number) {
    super(`Run ${runId} is locked by another worker`);
    this.name = "RunLockedError";
  }
}
