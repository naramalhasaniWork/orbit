// Call-time spend control. Each workspace has a Redis counter spend:{ws}:{yyyymm} in
// micro-dollars. A call reserves its worst-case cost up front (rejecting it if that would
// cross Workspace.tokenBudgetMonthly) and reconciles to the actual cost afterwards.

import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { BudgetExceededError } from "@/server/ai/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MICROS = 1_000_000;
const KEY_TTL_SECONDS = 40 * 24 * 3600;
const LIMIT_CACHE_MS = 60_000;

// Atomic reserve: add the amount, and undo it if the total would exceed the limit.
// ARGV: amount, limit (-1 = unlimited). Returns the new total, or -1 when rejected.
const RESERVE_SCRIPT = `
local total = redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
local limit = tonumber(ARGV[2])
if limit >= 0 and total > limit then
  redis.call('DECRBY', KEYS[1], ARGV[1])
  return -1
end
return total`;

const limitCache = new Map<string, { limitUsd: number | null; expiresAt: number }>();

export function spendKey(workspaceId: string, now: Date = new Date()): string {
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `spend:${workspaceId}:${month}`;
}

async function monthlyLimitUsd(workspaceId: string): Promise<number | null> {
  const cached = limitCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.limitUsd;
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { tokenBudgetMonthly: true },
  });
  const limitUsd = ws?.tokenBudgetMonthly ?? null;
  limitCache.set(workspaceId, { limitUsd, expiresAt: Date.now() + LIMIT_CACHE_MS });
  return limitUsd;
}

/** Seed the month's counter from recorded usage the first time this process touches it. */
async function seedIfMissing(key: string, workspaceId: string, now: Date): Promise<void> {
  const redis = getRedis();
  if (await redis.exists(key)) return;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.tokenUsage.aggregate({
    where: { workspaceId, createdAt: { gte: monthStart } },
    _sum: { cost: true },
  });
  const micros = Math.round(Number(agg._sum.cost ?? 0) * MICROS);
  await redis.set(key, String(micros), "EX", KEY_TTL_SECONDS, "NX");
}

export interface Reservation {
  key: string;
  micros: number;
}

/**
 * Reserve estimatedUsd against the workspace's monthly limit.
 * Returns null for pseudo-workspaces (internal calls) that are never billed.
 */
export async function reserveSpend(workspaceId: string, estimatedUsd: number): Promise<Reservation | null> {
  if (!UUID_RE.test(workspaceId)) return null;
  const now = new Date();
  const key = spendKey(workspaceId, now);
  const limitUsd = await monthlyLimitUsd(workspaceId);
  await seedIfMissing(key, workspaceId, now);

  const micros = Math.max(0, Math.ceil(estimatedUsd * MICROS));
  const limitMicros = limitUsd === null ? -1 : Math.round(limitUsd * MICROS);
  const total = Number(await getRedis().eval(RESERVE_SCRIPT, 1, key, micros, limitMicros, KEY_TTL_SECONDS));

  if (total < 0) {
    const spent = Number((await getRedis().get(key)) ?? 0) / MICROS;
    throw new BudgetExceededError(
      "workspace",
      `AI budget exceeded: this workspace has used $${spent.toFixed(2)} of its $${(limitUsd ?? 0).toFixed(2)} monthly AI budget, ` +
        `and the next call needs up to $${estimatedUsd.toFixed(4)}. Raise the budget in Settings > Usage or wait until next month.`
    );
  }
  return { key, micros };
}

/** Replace a reservation with the actual cost (0 when the call failed). */
export async function settleSpend(reservation: Reservation | null, actualUsd: number): Promise<void> {
  if (!reservation) return;
  const delta = Math.round(actualUsd * MICROS) - reservation.micros;
  if (delta !== 0) await getRedis().incrby(reservation.key, delta);
}

