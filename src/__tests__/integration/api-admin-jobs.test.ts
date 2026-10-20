import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { findMany, count, retry, discard, requireSuperAdmin } = vi.hoisted(() => ({
  findMany: vi.fn(async (_args: unknown) => [{ id: "f1", queue: "indexing", jobId: "run-1", status: "open" }]),
  count: vi.fn(async () => 1),
  retry: vi.fn(),
  discard: vi.fn(),
  requireSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { jobFailure: { findMany, count } } }));
vi.mock("@/lib/queue/dead-letter", () => ({ retryJobFailure: retry, discardJobFailure: discard }));
vi.mock("@/lib/utils/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/api")>()),
  requireSuperAdmin,
}));

import { AuthError } from "@/lib/utils/api";
const ctx = { params: Promise.resolve({ id: "f1" }) };
const req = (url = "http://localhost/api/admin/jobs") => new NextRequest(url, { method: "POST" });

describe("/api/admin/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSuperAdmin.mockResolvedValue({ user: { id: "sa" } });
  });

  it("lists open failures by default", async () => {
    const { GET } = await import("@/app/api/admin/jobs/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/jobs"));
    const { data } = await res.json();
    expect(data.total).toBe(1);
    expect((findMany.mock.calls[0] as unknown[])[0]).toMatchObject({ where: { status: "open" } });
  });

  it("rejects non-super-admins on every verb", async () => {
    requireSuperAdmin.mockRejectedValue(new AuthError("Super admin access required", "FORBIDDEN", 403));
    const { GET } = await import("@/app/api/admin/jobs/route");
    const { POST: retryPost } = await import("@/app/api/admin/jobs/[id]/retry/route");
    const { POST: discardPost } = await import("@/app/api/admin/jobs/[id]/discard/route");

    expect((await GET(new NextRequest("http://localhost/api/admin/jobs"))).status).toBe(403);
    expect((await retryPost(req(), ctx)).status).toBe(403);
    expect((await discardPost(req(), ctx)).status).toBe(403);
    expect(retry).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it("retry returns the new job id; a lost claim is a 409", async () => {
    const { POST } = await import("@/app/api/admin/jobs/[id]/retry/route");
    retry.mockResolvedValueOnce({ ok: true, jobId: "run-1:retry:abc" });
    expect((await (await POST(req(), ctx)).json()).data.jobId).toBe("run-1:retry:abc");
    expect(retry).toHaveBeenCalledWith("f1", "sa");

    retry.mockResolvedValueOnce({ ok: false, code: "NOT_OPEN", reason: "already retried" });
    expect((await POST(req(), ctx)).status).toBe(409);
  });

  it("discard 409s when nothing was open", async () => {
    const { POST } = await import("@/app/api/admin/jobs/[id]/discard/route");
    discard.mockResolvedValueOnce(true);
    expect((await POST(req(), ctx)).status).toBe(200);
    discard.mockResolvedValueOnce(false);
    expect((await POST(req(), ctx)).status).toBe(409);
  });
});
