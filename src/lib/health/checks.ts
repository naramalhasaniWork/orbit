import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

const CHECK_TIMEOUT_MS = 3000;

export type CheckStatus = "ok" | "fail";

export interface HealthReport {
  healthy: boolean;
  checks: { database: CheckStatus; redis: CheckStatus };
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), CHECK_TIMEOUT_MS)
    ),
  ]);
}

async function run(label: string, check: () => Promise<unknown>): Promise<CheckStatus> {
  try {
    await withTimeout(check(), label);
    return "ok";
  } catch (err) {
    console.error(`[health] ${label} check failed:`, err instanceof Error ? err.message : err);
    return "fail";
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const [database, redis] = await Promise.all([
    run("database", () => prisma.$queryRaw`SELECT 1`),
    run("redis", () => getRedis().ping()),
  ]);
  return { healthy: database === "ok" && redis === "ok", checks: { database, redis } };
}
