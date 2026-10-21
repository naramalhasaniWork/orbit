import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/server/http/errors";

const h = vi.hoisted(() => ({
  caller: { signedIn: true, userRole: "user" as "user" | "super_admin" },
  hits: new Map<string, number>(),
  createBugReport: vi.fn(async (_input: unknown) => undefined),
  listBugReports: vi.fn(async (_filter: string) => [] as unknown[]),
  getBugReport: vi.fn(async (_id: string) => null as unknown),
  getBugReportScreenshotKey: vi.fn(async (_id: string) => null as string | null),
  setBugReportStatus: vi.fn(async (_id: string, _s: string, _a: string) => null as unknown),
  writeAuditLog: vi.fn(async (_input: unknown) => undefined),
  upload: vi.fn(async (_key: string, _data: Buffer, _type: string) => undefined),
  download: vi.fn(async (_key: string) => Buffer.alloc(0)),
  notify: vi.fn(async (_n: unknown) => undefined),
}));

vi.mock("@/server/http/session", () => {
  const session = () => ({
    user: { id: "user-1", name: "Ada" },
    workspaceId: "ws-1",
    role: "owner",
    userRole: h.caller.userRole,
  });
  const requireAuth = vi.fn(async () => {
    if (!h.caller.signedIn) throw new AuthError("Authentication required", "UNAUTHORIZED", 401);
    return session();
  });
  return { requireAuth, getServerSession: vi.fn(async () => (h.caller.signedIn ? session() : null)) };
});
vi.mock("@/server/http/auth", async (orig) => ({
  ...(await orig<typeof import("@/server/http/auth")>()),
  loadMembership: vi.fn(async () => ({ memberId: "member-1", role: "owner" })),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  consumeRateLimit: vi.fn(async (key: string, limit: number) => {
    const count = (h.hits.get(key) ?? 0) + 1;
    h.hits.set(key, count);
    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), retryAfterSec: 3600 };
  }),
}));
vi.mock("@/server/data/bug-report-repo", () => ({
  createBugReport: h.createBugReport,
  listBugReports: h.listBugReports,
  getBugReport: h.getBugReport,
  getBugReportScreenshotKey: h.getBugReportScreenshotKey,
  setBugReportStatus: h.setBugReportStatus,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: h.writeAuditLog }));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ upload: h.upload, download: h.download }) }));
vi.mock("@/lib/bug-reports/notify", () => ({ notifyNewBugReport: h.notify }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const REPORT_ID = "6f1c1e1a-1b2c-4d3e-8f90-123456789abc";

/** Encodes the form the way a browser sends it: multipart bytes with a Content-Length. */
async function submit(fields: Record<string, string | Blob>): Promise<NextRequest> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const encoded = new Response(form);
  const body = new Uint8Array(await encoded.arrayBuffer());
  return new NextRequest("http://localhost/api/bug-reports", {
    method: "POST",
    body,
    headers: { "content-type": encoded.headers.get("content-type") ?? "", "content-length": String(body.byteLength) },
  });
}

async function post(fields: Record<string, string | Blob>) {
  const { POST } = await import("@/app/api/bug-reports/route");
  return POST(await submit(fields));
}

/** A 7 MB multipart body streamed with whatever Content-Length the caller claims (or none). */
function oversized(contentLength?: string): NextRequest {
  const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= 7 * 1024 * 1024) return controller.close();
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const headers: Record<string, string> = { "content-type": "multipart/form-data; boundary=b" };
  if (contentLength !== undefined) headers["content-length"] = contentLength;
  const init = { method: "POST", body, headers, duplex: "half" } as RequestInit;
  return new NextRequest(new Request("http://localhost/api/bug-reports", init));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.hits.clear();
  Object.assign(h.caller, { signedIn: true, userRole: "user" });
});

describe("POST /api/bug-reports", () => {
  it("401s without a session and stores nothing", async () => {
    h.caller.signedIn = false;
    expect((await post({ message: "broken" })).status).toBe(401);
    expect(h.createBugReport).not.toHaveBeenCalled();
  });

  it("validates the message: required, at most 5000 characters", async () => {
    expect((await post({ message: "   " })).status).toBe(400);
    expect((await post({ context: "{}" })).status).toBe(400);
    expect((await post({ message: "x".repeat(5001) })).status).toBe(400);
    expect((await post({ message: "x".repeat(5000) })).status).toBe(201);
  });

  it("stores the report, writes an audit entry and notifies without waiting", async () => {
    const res = await post({ message: "  Run button does nothing  ", context: JSON.stringify({ path: "/dashboard/runs" }) });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(h.createBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: data.id, userId: "user-1", workspaceId: "ws-1", message: "Run button does nothing", screenshotKey: null })
    );
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "bug_report.created", resourceId: data.id, workspaceId: "ws-1" })
    );
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it("an email failure never fails the submit", async () => {
    h.notify.mockRejectedValueOnce(new Error("resend down"));
    expect((await post({ message: "still works" })).status).toBe(201);
  });

  it("rate limits at 10 reports per user per hour", async () => {
    for (let i = 0; i < 10; i++) expect((await post({ message: `report ${i}` })).status).toBe(201);
    const res = await post({ message: "one too many" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(h.createBugReport).toHaveBeenCalledTimes(10);
  });

  it("sanitises the context: no query strings, tokens, cookies or unknown keys", async () => {
    const context = {
      path: "/dashboard/runs?token=abc123&code=xyz#access_token=secret",
      userAgent: "Mozilla/5.0",
      viewport: { width: 1440, height: 900 },
      consoleErrors: [
        "fetch failed: Authorization: Bearer abcdef0123456789",
        "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl rejected",
        "set-cookie=next-auth.session-token%3Dabc; password=hunter2",
      ],
      cookies: "next-auth.session-token=abc",
      inputValues: { email: "a@b.c" },
      localStorage: { token: "t" },
    };
    await post({ message: "leak check", context: JSON.stringify(context) });
    const stored = (h.createBugReport.mock.calls[0][0] as { context: Record<string, unknown> }).context;
    expect(Object.keys(stored).sort()).toEqual(["appVersion", "consoleErrors", "path", "userAgent", "viewport"]);
    expect(stored.path).toBe("/dashboard/runs");
    const serialized = JSON.stringify(stored);
    for (const secret of ["abc123", "xyz", "abcdef0123456789", "eyJhbGciOiJIUzI1NiJ9", "hunter2", "session-token%3Dabc", "a@b.c"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("accepts a real PNG and stores it under a key derived from the report id", async () => {
    const res = await post({ message: "with image", screenshot: new File([PNG], "shot.png", { type: "image/png" }) });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(h.upload).toHaveBeenCalledWith(`bug-reports/${data.id}.png`, expect.any(Buffer), "image/png");
    expect(h.createBugReport).toHaveBeenCalledWith(expect.objectContaining({ screenshotKey: `bug-reports/${data.id}.png` }));
  });

  it("rejects screenshots by content, not name: wrong type, renamed file, too large", async () => {
    const gif = new File([new TextEncoder().encode("GIF89a....")], "shot.gif", { type: "image/gif" });
    expect((await post({ message: "m", screenshot: gif })).status).toBe(415);

    const disguised = new File([new TextEncoder().encode("<svg onload=alert(1)>")], "shot.png", { type: "image/png" });
    expect((await post({ message: "m", screenshot: disguised })).status).toBe(415);

    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await post({ message: "m", screenshot: new File([big], "big.png", { type: "image/png" }) })).status).toBe(413);

    expect(h.upload).not.toHaveBeenCalled();
    expect(h.createBugReport).not.toHaveBeenCalled();
  });

  it("413s an oversized body without a Content-Length, before parsing it", async () => {
    const { POST } = await import("@/app/api/bug-reports/route");
    const res = await POST(oversized());
    expect(res.status).toBe(413);
    expect(h.createBugReport).not.toHaveBeenCalled();
  });

  it("413s an oversized body whose Content-Length lies", async () => {
    const { POST } = await import("@/app/api/bug-reports/route");
    const res = await POST(oversized("1024"));
    expect(res.status).toBe(413);
    expect(h.createBugReport).not.toHaveBeenCalled();
  });
});

describe("/api/admin/bug-reports", () => {
  const segment = { params: Promise.resolve({ id: REPORT_ID }) };
  const url = `http://localhost/api/admin/bug-reports/${REPORT_ID}`;
  const patch = (status: string) =>
    new NextRequest(url, { method: "PATCH", body: JSON.stringify({ status }), headers: { "content-type": "application/json" } });

  it("a non-admin cannot list, read, resolve or fetch a screenshot", async () => {
    const { GET: list } = await import("@/app/api/admin/bug-reports/route");
    const { GET: read, PATCH } = await import("@/app/api/admin/bug-reports/[id]/route");
    const { GET: screenshot } = await import("@/app/api/admin/bug-reports/[id]/screenshot/route");

    expect((await list(new NextRequest("http://localhost/api/admin/bug-reports"))).status).toBe(403);
    expect((await read(new NextRequest(url), segment)).status).toBe(403);
    expect((await PATCH(patch("resolved"), segment)).status).toBe(403);
    expect((await screenshot(new NextRequest(`${url}/screenshot`), segment)).status).toBe(403);
    expect(h.listBugReports).not.toHaveBeenCalled();
    expect(h.getBugReport).not.toHaveBeenCalled();
    expect(h.setBugReportStatus).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
  });

  it("a signed-out caller gets 401 on list, read and screenshot", async () => {
    h.caller.signedIn = false;
    const { GET: list } = await import("@/app/api/admin/bug-reports/route");
    const { GET: read } = await import("@/app/api/admin/bug-reports/[id]/route");
    const { GET: screenshot } = await import("@/app/api/admin/bug-reports/[id]/screenshot/route");

    expect((await list(new NextRequest("http://localhost/api/admin/bug-reports"))).status).toBe(401);
    expect((await read(new NextRequest(url), segment)).status).toBe(401);
    expect((await screenshot(new NextRequest(`${url}/screenshot`), segment)).status).toBe(401);
    expect(h.listBugReports).not.toHaveBeenCalled();
    expect(h.getBugReport).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
  });

  it("an admin asking for an unknown or malformed id gets 404", async () => {
    h.caller.userRole = "super_admin";
    const { GET: read } = await import("@/app/api/admin/bug-reports/[id]/route");
    const { GET: screenshot } = await import("@/app/api/admin/bug-reports/[id]/screenshot/route");
    const bad = { params: Promise.resolve({ id: "../../etc/passwd" }) };

    expect((await read(new NextRequest(url), segment)).status).toBe(404);
    expect((await read(new NextRequest(url), bad)).status).toBe(404);
    expect((await screenshot(new NextRequest(`${url}/screenshot`), bad)).status).toBe(404);
    expect(h.getBugReport).toHaveBeenCalledTimes(1);
    expect(h.getBugReportScreenshotKey).not.toHaveBeenCalled();
  });

  it("lists open reports by default and honours the filter", async () => {
    h.caller.userRole = "super_admin";
    const { GET } = await import("@/app/api/admin/bug-reports/route");
    await GET(new NextRequest("http://localhost/api/admin/bug-reports"));
    await GET(new NextRequest("http://localhost/api/admin/bug-reports?status=all"));
    await GET(new NextRequest("http://localhost/api/admin/bug-reports?status=bogus"));
    expect(h.listBugReports.mock.calls.map((c) => c[0])).toEqual(["open", "all", "open"]);
  });

  it("resolves and reopens, recording who resolved it", async () => {
    h.caller.userRole = "super_admin";
    const { PATCH } = await import("@/app/api/admin/bug-reports/[id]/route");
    h.setBugReportStatus.mockResolvedValue({ id: REPORT_ID });

    expect((await PATCH(patch("resolved"), segment)).status).toBe(200);
    expect((await PATCH(patch("open"), segment)).status).toBe(200);
    expect(h.setBugReportStatus.mock.calls).toEqual([
      [REPORT_ID, "resolved", "user-1"],
      [REPORT_ID, "open", "user-1"],
    ]);
    expect((await PATCH(patch("closed"), segment)).status).toBe(400);

    h.setBugReportStatus.mockResolvedValue(null);
    expect((await PATCH(patch("resolved"), segment)).status).toBe(404);
  });

  it("serves the screenshot through the app with its sniffed type", async () => {
    h.caller.userRole = "super_admin";
    const { GET } = await import("@/app/api/admin/bug-reports/[id]/screenshot/route");
    h.getBugReportScreenshotKey.mockResolvedValueOnce(`bug-reports/${REPORT_ID}.png`);
    h.download.mockResolvedValueOnce(Buffer.from(PNG));
    const res = await GET(new NextRequest(`${url}/screenshot`), segment);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    expect((await GET(new NextRequest(`${url}/screenshot`), segment)).status).toBe(404);
  });
});
