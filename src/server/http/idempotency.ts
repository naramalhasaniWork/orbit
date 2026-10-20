import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { withTimeout } from "@/lib/auth/rate-limit";
import { HttpError, ServiceUnavailableError } from "./errors";

const TTL_SEC = 24 * 60 * 60;
/** A claimed key whose request never finished (crash) frees itself after this long. */
const PENDING_TTL_SEC = 300;
const KEY_PATTERN = /^[\w:.-]{1,255}$/;

type Stored =
  | { state: "pending"; fingerprint: string }
  | { state: "done"; fingerprint: string; status: number; body: string };

export interface IdempotencyScope {
  /** Workspace (or "anon") + method + path, so one key cannot collide across endpoints. */
  scope: string;
  /** The parsed request body; a replay with a different body is rejected. */
  body: unknown;
}

function fingerprintOf(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

function replay(stored: Extract<Stored, { state: "done" }>): NextResponse {
  return new NextResponse(stored.body, {
    status: stored.status,
    headers: { "Content-Type": "application/json", "Idempotent-Replay": "true" },
  });
}

/**
 * Run `execute` at most once per Idempotency-Key (24h, Redis). Without the header the
 * request just runs. A retry of a finished request gets the stored 2xx response back;
 * a retry while the first is still running gets 409. Failures (non-2xx, thrown) release
 * the key so the client can retry. If Redis is down a keyed request is refused with 503
 * rather than run unprotected.
 */
export async function withIdempotency(
  req: Request,
  { scope, body }: IdempotencyScope,
  execute: () => Promise<Response>
): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!key) return execute();

  if (!KEY_PATTERN.test(key)) {
    throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 1-255 characters of [A-Za-z0-9_:.-]");
  }

  const redisKey = `idem:${scope}:${key}`;
  const fingerprint = fingerprintOf(body);

  try {
    const redis = getRedis();
    const claimed = await withTimeout(
      redis.set(redisKey, JSON.stringify({ state: "pending", fingerprint } satisfies Stored), "EX", PENDING_TTL_SEC, "NX")
    );

    if (claimed !== "OK") {
      const raw = await withTimeout(redis.get(redisKey));
      const existing = raw ? (JSON.parse(raw) as Stored) : null;
      // Expired between SET NX and GET: let the client retry
      if (!existing) throw new HttpError(409, "IDEMPOTENCY_IN_PROGRESS", "Retry the request");
      if (existing.fingerprint !== fingerprint) {
        throw new HttpError(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used with a different request body");
      }
      if (existing.state === "pending") {
        throw new HttpError(409, "IDEMPOTENCY_IN_PROGRESS", "A request with this Idempotency-Key is still running");
      }
      return replay(existing);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new ServiceUnavailableError("Idempotency store unavailable", "IDEMPOTENCY_UNAVAILABLE", 5);
  }

  const release = () => withTimeout(getRedis().del(redisKey)).catch(() => undefined);

  let res: Response;
  try {
    res = await execute();
  } catch (err) {
    await release();
    throw err;
  }

  if (res.status < 200 || res.status >= 300) {
    await release();
    return res;
  }

  const done: Stored = { state: "done", fingerprint, status: res.status, body: await res.clone().text() };
  await withTimeout(getRedis().set(redisKey, JSON.stringify(done), "EX", TTL_SEC)).catch(() => undefined);
  return res;
}
