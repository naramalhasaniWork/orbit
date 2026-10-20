export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast with a readable list instead of crashing later on the first request
    const { assertEnv } = await import("@/lib/env");
    assertEnv();

    const { ensureVectorSetup } = await import("@/lib/db/vector");
    const { ensureVectorIndexForStoredConfig } = await import("@/server/ai/embedding-config");
    ensureVectorSetup().then(ensureVectorIndexForStoredConfig).catch((err) => {
      console.error("[Instrumentation] pgvector setup failed:", err);
    });

    // ORBIT_ROLE=web serves HTTP only; workers run in a separate container.
    const { shouldStartWorkers } = await import("@/lib/queue/role");
    if (!shouldStartWorkers()) {
      console.log("[Instrumentation] ORBIT_ROLE=web, workers not started");
      return;
    }

    const { registerWorkers, shutdownWorkers } = await import("@/lib/queue/workers");
    try {
      registerWorkers();
      console.log("[Instrumentation] BullMQ workers started");
      // start.sh sets NEXT_MANUAL_SIG_HANDLE so Next doesn't exit before jobs drain
      const { installShutdownHandlers } = await import("@/lib/queue/shutdown");
      installShutdownHandlers(shutdownWorkers, "Instrumentation");
    } catch (err) {
      console.error("[Instrumentation] Failed to start workers:", err);
    }
  }
}
