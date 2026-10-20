/**
 * Redis-backed fixed-window rate limiter (INCR + EXPIRE), shared across instances.
 * Degrades open with a warning when Redis is unreachable so an outage never locks users out.
 */

import { getRedis } from "@/lib/redis";
import { TIER_LIMITS, type WorkspaceTier } from "./tenant";
import { apiError } from "@/lib/utils/api";
import type { NextResponse } from "next/server";

const WINDOW_SEC = 60;
const REDIS_TIMEOUT_MS = 500;
const WARN_INTERVAL_MS = 30_000;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

let lastWarnAt = 0;

function warnRedisDown(err: unknown): void {
  const now = Date.now();
  if (now - lastWarnAt < WARN_INTERVAL_MS) return;
  lastWarnAt = now;
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(`[RateLimit] Redis unavailable, allowing request (${reason})`);
}

/** ioredis queues commands while disconnected, so bound every call with a timeout. */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis timeout")), REDIS_TIMEOUT_MS);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** Count one hit against `key` in the current window. */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSec = WINDOW_SEC
): Promise<RateLimitResult> {
  if (limit === Infinity) {
    return { allowed: true, limit, remaining: Infinity, retryAfterSec: 0 };
  }

  const redisKey = `ratelimit:${key}`;
  try {
    const redis = getRedis();
    const results = await withTimeout(redis.multi().incr(redisKey).ttl(redisKey).exec());
    const count = Number(results?.[0]?.[1] ?? 0);
    let ttl = Number(results?.[1]?.[1] ?? -1);

    // First hit, or a key that lost its TTL: (re)start the window.
    if (ttl < 0) {
      await withTimeout(redis.expire(redisKey, windowSec));
      ttl = windowSec;
    }

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSec: ttl,
    };
  } catch (err) {
    warnRedisDown(err);
    return { allowed: true, limit, remaining: limit, retryAfterSec: 0 };
  }
}

function tooManyRequests(result: RateLimitResult, message: string): NextResponse {
  const res = apiError(message, "RATE_LIMITED", 429);
  res.headers.set("Retry-After", String(Math.max(1, result.retryAfterSec)));
  return res;
}

/**
 * Per-workspace limit from the tier table. Returns null if allowed,
 * or a 429 NextResponse if rate limited.
 */
export async function checkRateLimit(
  workspaceId: string,
  tier: WorkspaceTier
): Promise<NextResponse | null> {
  const limit = TIER_LIMITS[tier].rateLimit;
  const result = await consumeRateLimit(`ws:${workspaceId}`, limit);
  if (result.allowed) return null;
  return tooManyRequests(
    result,
    `Rate limit exceeded (${limit} requests/minute). Upgrade your plan for higher limits.`
  );
}

/** Per-client limit for unauthenticated endpoints (sign-in). */
export async function checkIpRateLimit(
  scope: string,
  ip: string,
  limit: number
): Promise<NextResponse | null> {
  const result = await consumeRateLimit(`${scope}:${ip}`, limit);
  if (result.allowed) return null;
  return tooManyRequests(result, "Too many requests. Try again shortly.");
}

/** Best-effort client IP behind a proxy (Railway sets x-forwarded-for). */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
