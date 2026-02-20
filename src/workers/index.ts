import { registerWorkers, shutdownWorkers } from "@/lib/queue/workers";

console.log("[Orbit Workers] Starting...");

registerWorkers();

function handleShutdown(signal: string) {
  console.log(`[Orbit Workers] Received ${signal}, shutting down gracefully...`);
  shutdownWorkers()
    .then(() => {
      console.log("[Orbit Workers] Shutdown complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Orbit Workers] Shutdown error:", err);
      process.exit(1);
    });
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
