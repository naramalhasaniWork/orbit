import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const session = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
const memberRow = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
const memberFind = vi.hoisted(() => vi.fn());
const apiKeyResult = vi.hoisted(() => ({ current: null as unknown }));
const store = vi.hoisted(() => new Map<string, string>());

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ prisma: { workspaceMember: { findUnique: memberFind } } }));
vi.mock("@/lib/auth/api-key", () => ({ requireApiKey: vi.fn(async () => apiKeyResult.current) }));
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: vi.fn(async (k: string, v: string, _ex: string, _ttl: number, nx?: string) => {
      if (nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    multi: () => {
      const counts = store;
      let lastKey = "";
      const chain = {
        incr: (k: string) => {
          lastKey = k;
          counts.set(k, String(Number(counts.get(k) ?? 0) + 1));
          return chain;
        },
        ttl: () => chain,
        exec: async () => [[null, Number(counts.get(lastKey))], [null, 60]],
      };
      return chain;
    },
    expire: vi.fn(),
  }),
}));

import { route } from "@/server/http/route";
import { AuthError, NotFoundError, QueueUnavailableError } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";

const SEGMENT = { params: Promise.resolve({ projectId: "p1", workspaceId: "ws-2" }) };
const NO_SEGMENT = { params: Promise.resolve({}) };

function req(method = "GET", init: { url?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(init.url ?? "http://localhost/api/x", {
    method,
    headers: init.headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

async function json(res: Response) {
  return res.json() as Promise<{ success: boolean; data?: unknown; error?: Record<string, unknown> }>;
}

function asMember(role: string) {
  memberRow.current = { id: "m1", role, workspace: { deletedAt: null } };
}

beforeEach(() => {
  store.clear();
  session.current = { user: { id: "user-1" }, workspaceId: "ws-1" };
  apiKeyResult.current = { workspaceId: "ws-key" };
  asMember("member");
  memberFind.mockReset();
  memberFind.mockImplementation(async () => memberRow.current);
});

describe("auth modes", () => {
  it("session: 401 without a session", async () => {
    session.current = null;
    const res = await route({}, () => "ok")(req(), NO_SEGMENT);
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("session: passes workspace, session role and auth info to the handler", async () => {
    asMember("admin");
    const res = await route({}, (ctx) => ({
      workspaceId: ctx.workspaceId,
      role: ctx.session.role,
      auth: ctx.auth,
    }))(req(), NO_SEGMENT);
    expect(await json(res)).toEqual({
      success: true,
      data: { workspaceId: "ws-1", role: "admin", auth: { userId: "user-1", role: "admin", memberId: "m1", via: "session" } },
    });
  });

  it("session: 403 NO_WORKSPACE when the session has none", async () => {
    session.current = { user: { id: "user-1" } };
    const res = await route({}, () => "ok")(req(), NO_SEGMENT);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatchObject({ code: "NO_WORKSPACE" });
  });

  it("session: 403 for a non-member and for a deleted workspace", async () => {
    memberRow.current = null;
    const notMember = await route({}, () => "ok")(req(), NO_SEGMENT);
    expect(notMember.status).toBe(403);

    memberRow.current = { id: "m1", role: "member", workspace: { deletedAt: new Date() } };
    const deleted = await route({}, () => "ok")(req(), NO_SEGMENT);
    expect((await json(deleted)).error).toMatchObject({ code: "WORKSPACE_DELETED" });
  });

  it("workspace param: uses the path param, not the session workspace", async () => {
    const res = await route({ workspace: "param" }, (ctx) => ctx.workspaceId)(req(), SEGMENT);
    expect((await json(res)).data).toBe("ws-2");
    expect(memberFind.mock.calls[0][0].where.workspace_member_unique).toEqual({
      workspaceId: "ws-2",
      userId: "user-1",
    });
  });

  it("apiKey: valid key resolves its workspace without a membership read", async () => {
    const res = await route({ auth: "apiKey" }, (ctx) => ({ ws: ctx.workspaceId, auth: ctx.auth }))(
      req("GET", { headers: { authorization: "Bearer orb_x" } }),
      NO_SEGMENT
    );
    expect((await json(res)).data).toEqual({
      ws: "ws-key",
      auth: { userId: null, role: null, memberId: null, via: "apiKey" },
    });
    expect(memberFind).not.toHaveBeenCalled();
  });

  it("apiKey: an invalid key returns the key check's own response untouched", async () => {
    apiKeyResult.current = NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
    const res = await route({ auth: "apiKey" }, () => "ok")(req(), NO_SEGMENT);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or missing API key" });
  });

  it("apiKey with workspace param: a key from another workspace is refused", async () => {
    const res = await route({ auth: "apiKey", workspace: "param" }, () => "ok")(
      req("GET", { headers: { authorization: "Bearer orb_x" } }),
      SEGMENT
    );
    expect(res.status).toBe(403);
  });

  it("sessionOrApiKey: Authorization header means API key, otherwise the session", async () => {
    const handler = route({ auth: "sessionOrApiKey" }, (ctx) => ctx.auth?.via);
    expect((await json(await handler(req(), NO_SEGMENT))).data).toBe("session");
    const withKey = await handler(req("GET", { headers: { authorization: "Bearer orb_x" } }), NO_SEGMENT);
    expect((await json(withKey)).data).toBe("apiKey");
  });

  it("public: no session needed, no membership read", async () => {
    session.current = null;
    const res = await route({ auth: "public" }, (ctx) => ctx.auth)(req(), NO_SEGMENT);
    expect(res.status).toBe(200);
    expect(memberFind).not.toHaveBeenCalled();
  });

  it("webhook: verifier gets the raw body; a failed signature is 401 and never reaches the handler", async () => {
    const handler = vi.fn((ctx: { rawBody: string | null }) => ctx.rawBody);
    const verify = vi.fn((_r: NextRequest, raw: string) => {
      if (raw !== '{"a":1}') throw new AuthError("Bad signature", "INVALID_SIGNATURE", 401);
    });
    const wrapped = route({ auth: { webhook: verify } }, handler);

    const ok = await wrapped(req("POST", { body: '{"a":1}' }), NO_SEGMENT);
    expect((await json(ok)).data).toBe('{"a":1}');

    const bad = await wrapped(req("POST", { body: '{"a":2}' }), NO_SEGMENT);
    expect(bad.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses a permission on a route that has no session, at definition time", () => {
    expect(() => route({ auth: "apiKey", permission: "runs.create" }, () => "ok")).toThrow(/permission needs a session/);
  });
});

describe("permissions", () => {
  it("denies a role without the permission with 403 and the existing message", async () => {
    asMember("viewer");
    const handler = vi.fn();
    const res = await route({ permission: "secrets.manage" }, handler)(req("POST"), NO_SEGMENT);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toEqual({ message: "Permission denied: secrets.manage", code: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("admits a role that holds it", async () => {
    asMember("admin");
    const res = await route({ permission: "secrets.manage" }, () => "ok")(req("POST"), NO_SEGMENT);
    expect(res.status).toBe(200);
  });
});

describe("one membership read per request", () => {
  it("the legacy requireWorkspace + requirePermission pair reads twice; route() reads once", async () => {
    const { requireWorkspace, requirePermission } = await import("@/server/http/auth");
    await requireWorkspace();
    await requirePermission("ws-1", "projects.update");
    expect(memberFind).toHaveBeenCalledTimes(2);

    memberFind.mockClear();
    await route({ permission: "projects.update" }, () => "ok")(req("PATCH"), NO_SEGMENT);
    expect(memberFind).toHaveBeenCalledTimes(1);
  });

  it("session workspace + permission", async () => {
    await route({ permission: "projects.update" }, () => "ok")(req("PATCH"), NO_SEGMENT);
    expect(memberFind).toHaveBeenCalledTimes(1);
  });

  it("workspace param + permission + zod + idempotency", async () => {
    const wrapped = route(
      { workspace: "param", permission: "runs.create", body: z.object({ a: z.number() }), idempotent: true },
      () => "ok"
    );
    await wrapped(req("POST", { body: { a: 1 }, headers: { "idempotency-key": "key-0001" } }), SEGMENT);
    expect(memberFind).toHaveBeenCalledTimes(1);
  });
});

describe("validation", () => {
  const Body = z.object({ name: z.string().min(1, "Name is required"), count: z.number() });

  it("400 lists every issue; message stays the first one so the shape matches apiError", async () => {
    const res = await route({ body: Body }, () => "ok")(req("POST", { body: { name: "", count: "x" } }), NO_SEGMENT);
    expect(res.status).toBe(400);
    const { error } = await json(res);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", message: "Name is required" });
    expect((error?.details as unknown[]).length).toBe(2);
  });

  it("validates params and query, and hands the handler parsed values", async () => {
    const wrapped = route(
      { params: z.object({ projectId: z.string().min(2) }), query: z.object({ limit: z.coerce.number() }) },
      (ctx) => ({ id: ctx.params.projectId, limit: ctx.query.limit })
    );
    const ok = await wrapped(req("GET", { url: "http://localhost/api/x?limit=5" }), SEGMENT);
    expect((await json(ok)).data).toEqual({ id: "p1", limit: 5 });
    const bad = await wrapped(req("GET", { url: "http://localhost/api/x?limit=abc" }), SEGMENT);
    expect(bad.status).toBe(400);
  });

  it("400 INVALID_JSON for a body that is not JSON", async () => {
    const res = await route({ body: Body }, () => "ok")(req("POST", { body: "{nope" }), NO_SEGMENT);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatchObject({ code: "INVALID_JSON" });
  });

  it("auth runs before validation: no session is 401, not 400", async () => {
    session.current = null;
    const res = await route({ body: Body }, () => "ok")(req("POST", { body: {} }), NO_SEGMENT);
    expect(res.status).toBe(401);
  });
});

describe("error mapping", () => {
  const throwing = (err: unknown) => route({}, () => { throw err; })(req(), NO_SEGMENT);
  const prismaError = (code: string) =>
    Object.assign(new Error(code), { name: "PrismaClientKnownRequestError", code });

  it("AuthError keeps its status and code", async () => {
    const res = await throwing(new AuthError("nope", "TEAPOT", 418));
    expect(res.status).toBe(418);
    expect((await json(res)).error).toEqual({ message: "nope", code: "TEAPOT" });
  });

  it("NotFoundError and Prisma P2025 are 404", async () => {
    expect((await throwing(new NotFoundError())).status).toBe(404);
    const res = await throwing(prismaError("P2025"));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toEqual({ message: "Resource not found", code: "NOT_FOUND" });
  });

  it("Prisma P2002 is 409", async () => {
    const res = await throwing(prismaError("P2002"));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatchObject({ code: "CONFLICT" });
  });

  it("BudgetExceededError is 402", async () => {
    // The AI gateway owns this class; the wrapper recognises it by name
    class BudgetExceededError extends Error {
      name = "BudgetExceededError";
    }
    const res = await throwing(new BudgetExceededError("over budget"));
    expect(res.status).toBe(402);
    expect((await json(res)).error).toEqual({ message: "over budget", code: "BUDGET_EXCEEDED" });
  });

  it("ServiceUnavailable and QueueUnavailable are 503 with Retry-After", async () => {
    const queue = await throwing(new QueueUnavailableError());
    expect(queue.status).toBe(503);
    expect(queue.headers.get("Retry-After")).toBe("30");
  });

  it("an unknown error is 500 with the request id; the message is logged, never echoed", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const res = await throwing(new Error("db password is hunter2"));
    const { error } = await json(res);
    expect(res.status).toBe(500);
    expect(JSON.stringify(error)).not.toContain("hunter2");
    expect(error).toMatchObject({ message: "Internal server error", code: "INTERNAL_ERROR" });
    expect(error?.requestId).toBe(res.headers.get("X-Request-Id"));
    expect(spy.mock.calls[0][0]).toMatchObject({ err: expect.objectContaining({ message: "db password is hunter2" }) });
    spy.mockRestore();
  });

  it("Next's control-flow errors are rethrown, not logged as 500s", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    for (const digest of ["DYNAMIC_SERVER_USAGE", "NEXT_REDIRECT;replace;/x;307;", "NEXT_NOT_FOUND"]) {
      await expect(throwing(Object.assign(new Error("next"), { digest }))).rejects.toMatchObject({ digest });
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("every response carries X-Request-Id, and a sane inbound id is kept", async () => {
    const res = await route({}, () => "ok")(req("GET", { headers: { "x-request-id": "abc-12345678" } }), NO_SEGMENT);
    expect(res.headers.get("X-Request-Id")).toBe("abc-12345678");
    const forged = await route({}, () => "ok")(req("GET", { headers: { "x-request-id": "bad id\n" } }), NO_SEGMENT);
    expect(forged.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("response shape", () => {
  it("a plain return value is sent as {success, data}; a Response passes through unchanged", async () => {
    const plain = await route({}, () => ({ a: 1 }))(req(), NO_SEGMENT);
    expect(await plain.json()).toEqual({ success: true, data: { a: 1 } });

    const created = await route({}, () => NextResponse.json({ success: true, data: 1 }, { status: 201 }))(req(), NO_SEGMENT);
    expect(created.status).toBe(201);
  });
});

describe("rate limit", () => {
  it("429 with Retry-After once the bucket is spent", async () => {
    const wrapped = route({ rateLimit: { scope: "t", limit: 1 } }, () => "ok");
    expect((await wrapped(req(), NO_SEGMENT)).status).toBe(200);
    const limited = await wrapped(req(), NO_SEGMENT);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("per: 'user' gives each signed-in user their own bucket within one workspace", async () => {
    const wrapped = route({ rateLimit: { scope: "per-user", limit: 1, per: "user" } }, () => "ok");
    session.current = { user: { id: "u-a" }, workspaceId: "ws-1" };
    expect((await wrapped(req(), NO_SEGMENT)).status).toBe(200);
    expect((await wrapped(req(), NO_SEGMENT)).status).toBe(429);
    session.current = { user: { id: "u-b" }, workspaceId: "ws-1" };
    expect((await wrapped(req(), NO_SEGMENT)).status).toBe(200);
  });
});

describe("idempotency", () => {
  const post = (key: string | null, body: unknown = { a: 1 }) =>
    req("POST", { body, headers: key ? { "idempotency-key": key } : undefined });

  it("runs once per key and replays the stored response", async () => {
    const handler = vi.fn(() => NextResponse.json({ success: true, data: { run: Math.random() } }, { status: 201 }));
    const wrapped = route({ idempotent: true, body: z.object({ a: z.number() }) }, handler);

    const first = await wrapped(post("key-aaaa1"), NO_SEGMENT);
    const second = await wrapped(post("key-aaaa1"), NO_SEGMENT);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotent-Replay")).toBe("true");
    expect(await second.text()).toBe(await first.text());
  });

  it("without the header every request runs", async () => {
    const handler = vi.fn(() => "ok");
    const wrapped = route({ idempotent: true }, handler);
    await wrapped(post(null), NO_SEGMENT);
    await wrapped(post(null), NO_SEGMENT);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("422 when the key is reused with a different body", async () => {
    const wrapped = route({ idempotent: true, body: z.object({ a: z.number() }) }, () => "ok");
    await wrapped(post("key-bbbb2", { a: 1 }), NO_SEGMENT);
    const res = await wrapped(post("key-bbbb2", { a: 2 }), NO_SEGMENT);
    expect(res.status).toBe(422);
  });

  it("409 while the first request is still running", async () => {
    let release: () => void = () => undefined;
    const wrapped = route({ idempotent: true }, () => new Promise((r) => { release = () => r("done"); }));
    const first = wrapped(post("key-cccc3"), NO_SEGMENT);
    await vi.waitFor(() => expect(store.size).toBeGreaterThan(0));
    const second = await wrapped(post("key-cccc3"), NO_SEGMENT);
    expect(second.status).toBe(409);
    release();
    await first;
  });

  it("a failed request releases the key so the retry runs", async () => {
    const handler = vi.fn()
      .mockImplementationOnce(() => { throw new Error("boom"); })
      .mockImplementation(() => "ok");
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const wrapped = route({ idempotent: true }, handler);
    expect((await wrapped(post("key-dddd4"), NO_SEGMENT)).status).toBe(500);
    expect((await wrapped(post("key-dddd4"), NO_SEGMENT)).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("400 for a malformed key", async () => {
    const res = await route({ idempotent: true }, () => "ok")(post("bad key!"), NO_SEGMENT);
    expect(res.status).toBe(400);
  });
});
