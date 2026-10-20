import { registerWorkers, shutdownWorkers } from "@/lib/queue/workers";
import { installShutdownHandlers } from "@/lib/queue/shutdown";

console.log("[Orbit Workers] Starting...");

registerWorkers();
installShutdownHandlers(shutdownWorkers, "Orbit Workers");
