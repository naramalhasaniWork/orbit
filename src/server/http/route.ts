import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-key";
import { consumeRateLimit, getClientIp, tooManyRequests } from "@/lib/auth/rate-limit";
import { apiSuccess } from "@/lib/utils/api";
import type { OrbitSession } from "@/lib/utils/types";
import type { MemberRole } from "@/lib/auth/permissions";
import { forWorkspace, type WorkspaceScope } from "@/server/data/scope";
import { logger, runWithLogContext, getLogContext } from "@/server/observability/logger";
import { assertPermission, loadMembership } from "./auth";
import { AuthError, HttpError } from "./errors";
import { withIdempotency } from "./idempotency";
import { mapError } from "./map-error";
import { requireAuth } from "./session";
import type { RouteContext, RouteHandler, RouteSegment, RouteSpec } from "./route-types";

export type { RouteContext, RouteSpec, RouteHandler } from "./route-types";

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

interface Identity {
  workspaceId: string | null;
  session: OrbitSession | null;
  userId: string | null;
  role: MemberRole | null;
  memberId: string | null;
  via: "session" | "apiKey" | null;
}

const ANONYMOUS: Identity = { workspaceId: null, session: null, userId: null, role: null, memberId: null, via: null };

function assertSpec(spec: RouteSpec): void {
  const auth = spec.auth ?? "session";
  if (spec.permission && (auth === "apiKey" || auth === "public" || typeof auth === "object")) {
    throw new Error(`route(): permission needs a session, but auth is ${typeof auth === "object" ? "webhook" : auth}`);
  }
  if (spec.workspace === "param" && (auth === "public" || typeof auth === "object")) {
    throw new Error("route(): workspace 'param' needs an authenticated route");
  }
}

function queryOf(req: NextRequest): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of Array.from(new Set(req.nextUrl.searchParams.keys()))) {
    const values = req.nextUrl.searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}

function parseJson(raw: string): unknown {
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

/** The session user's membership: one database read, shared by the workspace check and the permission check. */
async function sessionIdentity(spec: RouteSpec, rawParams: Record<string, string>): Promise<Identity> {
  const session = await requireAuth();
  const workspaceId =
    spec.workspace === "param" ? rawParams[spec.workspaceParam ?? "workspaceId"] : session.workspaceId;
  if (!workspaceId) throw new AuthError("No workspace found", "NO_WORKSPACE", 403);

  const { role, memberId } = await loadMembership(session.user.id, workspaceId);
  if (spec.permission) assertPermission(role, spec.permission);

  return { workspaceId, session: { ...session, role }, userId: session.user.id, role, memberId, via: "session" };
}

/** Resolves who is calling, or the response to send instead (a bad API key keeps its existing 401/429 shape). */
async function authenticate(
  spec: RouteSpec,
  req: NextRequest,
  rawParams: Record<string, string>
): Promise<Identity | NextResponse> {
  const auth = spec.auth ?? "session";
  if (auth === "public" || typeof auth === "object") return ANONYMOUS;

  const useApiKey = auth === "apiKey" || (auth === "sessionOrApiKey" && req.headers.has("authorization"));
  if (!useApiKey) return sessionIdentity(spec, rawParams);

  const key = await requireApiKey(req);
  if (key instanceof NextResponse) return key;
  if (spec.workspace === "param" && rawParams[spec.workspaceParam ?? "workspaceId"] !== key.workspaceId) {
    throw new AuthError("API key does not belong to this workspace", "FORBIDDEN", 403);
  }
  return { workspaceId: key.workspaceId, session: null, userId: null, role: null, memberId: null, via: "apiKey" };
}

async function execute<S extends RouteSpec>(
  spec: S,
  handler: RouteHandler<S>,
  req: NextRequest,
  segment: unknown,
  requestId: string
): Promise<Response> {
  const rawParams = (await (segment as Partial<RouteSegment> | undefined)?.params) ?? {};

  let rawBody: string | null = null;
  if (typeof spec.auth === "object") {
    rawBody = await req.text();
    await spec.auth.webhook(req, rawBody);
  }

  const identity = await authenticate(spec, req, rawParams);
  if (identity instanceof NextResponse) return identity;

  const store = getLogContext();
  if (store && identity.workspaceId) store.workspaceId = identity.workspaceId;

  if (spec.rateLimit) {
    const { scope, limit, windowSec } = spec.rateLimit;
    const result = await consumeRateLimit(`${scope}:${identity.workspaceId ?? getClientIp(req.headers)}`, limit, windowSec);
    if (!result.allowed) return tooManyRequests(result, "Rate limit exceeded. Try again shortly.");
  }

  const params = spec.params ? spec.params.parse(rawParams) : rawParams;
  const query = spec.query ? spec.query.parse(queryOf(req)) : queryOf(req);
  let body: unknown;
  if (spec.body) {
    const raw = rawBody ?? (await req.text());
    body = spec.body.parse(parseJson(raw));
  }

  const run = async (): Promise<Response> => {
    let scope: WorkspaceScope | undefined;
    const { workspaceId } = identity;
    const ctx = {
      req, params, query, body, rawBody, requestId, log: logger,
      // Built on first use, so handlers that never touch the database never build a scope.
      get db() {
        if (!workspaceId) return null;
        scope ??= forWorkspace({ workspaceId, memberUserId: identity.memberId ? identity.userId ?? undefined : undefined });
        return scope;
      },
      workspaceId,
      session: identity.session,
      auth: identity.via
        ? { userId: identity.userId, role: identity.role, memberId: identity.memberId, via: identity.via }
        : null,
    } as unknown as RouteContext<S>;
    const result = await handler(ctx);
    return result instanceof Response ? result : apiSuccess(result);
  };

  if (!spec.idempotent) return run();
  const scope = `${identity.workspaceId ?? "anon"}:${req.method}:${req.nextUrl.pathname}`;
  return withIdempotency(req, { scope, body }, run);
}

/**
 * The one way to write an API route: authenticates, resolves the workspace (one membership
 * read), checks the permission, validates params/query/body with zod, optionally rate limits
 * and de-duplicates, then runs the handler. Anything it throws becomes the standard
 * `{success, error}` response (see map-error.ts), so handlers hold no try/catch.
 *
 *   export const POST = route({ permission: "secrets.manage", body: Schema }, async (ctx) => { ... });
 */
export function route<const S extends RouteSpec>(spec: S, handler: RouteHandler<S>) {
  assertSpec(spec);

  // `segment` is typed unknown on purpose: Next's build-time route check accepts an optional
  // second argument only when it is any/unknown, and no-param routes are called without one.
  return async function handle(input: Request, segment?: unknown): Promise<Response> {
    const req = input instanceof NextRequest ? input : new NextRequest(input);
    const inbound = req.headers.get("x-request-id");
    const requestId = inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();

    return runWithLogContext({ requestId }, async () => {
      let res: Response;
      try {
        res = await execute(spec, handler, req, segment, requestId);
      } catch (err) {
        res = spec.onError?.(err) ?? mapError(err, requestId, logger);
      }
      try {
        res.headers.set("X-Request-Id", requestId);
      } catch {
        // an immutable Response (fetch result) keeps its headers
      }
      return res;
    });
  };
}
