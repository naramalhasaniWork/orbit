/**
 * In-memory sliding-window rate limiter per workspace.
 * Uses a Map of timestamps; suitable for single-process deployments.
 * For multi-instance, swap to Redis-backed (ZRANGEBYSCORE).
 */

import { TIER_LIMITS, type WorkspaceTier } from "./tenant";
import { apiError } from "@/lib/utils/api";
import type { NextResponse } from "next/server";

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();
const WINDOW_MS = 60_000; // 1 minute

/** Clean expired timestamps from a window. */
function cleanWindow(entry: WindowEntry, now: number): void {
  const cutoff = now - WINDOW_MS;
  const idx = entry.timestamps.findIndex((t) => t > cutoff);
  if (idx > 0) {
    entry.timestamps = entry.timestamps.slice(idx);
  } else if (idx === -1) {
    entry.timestamps = [];
  }
}

/**
 * Check rate limit for a workspace. Returns null if allowed,
 * or a NextResponse with 429 if rate limited.
 */
export function checkRateLimit(
  workspaceId: string,
  tier: WorkspaceTier
): NextResponse | null {
  const limit = TIER_LIMITS[tier].rateLimit;
  if (limit === Infinity) return null;

  const now = Date.now();
  let entry = windows.get(workspaceId);

  if (!entry) {
    entry = { timestamps: [] };
    windows.set(workspaceId, entry);
  }

  cleanWindow(entry, now);

  if (entry.timestamps.length >= limit) {
    return apiError(
      `Rate limit exceeded (${limit} requests/minute). Upgrade your plan for higher limits.`,
      "RATE_LIMITED",
      429
    );
  }

  entry.timestamps.push(now);
  return null;
}

// Periodic cleanup of stale entries (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    const cutoff = now - WINDOW_MS * 2;
    for (const [key, entry] of Array.from(windows.entries())) {
      if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
        windows.delete(key);
      }
    }
  }, 300_000);
}
