/**
 * Process-wide shutdown flag. SIGTERM flips it; long-running job code checks
 * it between units of work (test cases) and throws ShutdownError, so BullMQ
 * can retry the job on the next worker instead of losing it.
 */
let shuttingDown = false;

export class ShutdownError extends Error {
  readonly retryable = true;
  constructor() {
    super("Worker is shutting down; job will be retried");
    this.name = "ShutdownError";
  }
}

export function requestShutdown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function throwIfShuttingDown(): void {
  if (shuttingDown) throw new ShutdownError();
}

/** Test hook. */
export function resetShutdownForTests(): void {
  shuttingDown = false;
}

const FORCE_EXIT_MS = 85_000;

/**
 * Install SIGTERM/SIGINT handlers: raise the flag, wait for workers to drain
 * their active jobs, then exit. A hard exit fires just inside the platform's
 * kill window so the process never hangs.
 */
export function installShutdownHandlers(
  drain: () => Promise<void>,
  label: string
): void {
  let started = false;
  const handle = (signal: string) => {
    if (started) return;
    started = true;
    console.log(`[${label}] Received ${signal}, draining workers...`);
    requestShutdown();
    const force = setTimeout(() => {
      console.error(`[${label}] Drain exceeded ${FORCE_EXIT_MS}ms, forcing exit`);
      process.exit(1);
    }, FORCE_EXIT_MS);
    force.unref();
    drain()
      .then(() => {
        console.log(`[${label}] Drain complete`);
        process.exit(0);
      })
      .catch((err) => {
        console.error(`[${label}] Drain error:`, err);
        process.exit(1);
      });
  };
  process.on("SIGTERM", () => handle("SIGTERM"));
  process.on("SIGINT", () => handle("SIGINT"));
}
