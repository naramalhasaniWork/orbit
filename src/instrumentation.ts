export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast with a readable list instead of crashing later on the first request
    const { assertEnv } = await import("@/lib/env");
    assertEnv();

    const { ensureVectorSetup } = await import("@/lib/db/vector");
    ensureVectorSetup().catch((err) => {
      console.error("[Instrumentation] pgvector setup failed:", err);
    });

    const { registerWorkers } = await import("@/lib/queue/workers");
    try {
      registerWorkers();
      console.log("[Instrumentation] BullMQ workers started");
    } catch (err) {
      console.error("[Instrumentation] Failed to start workers:", err);
    }
  }
}
