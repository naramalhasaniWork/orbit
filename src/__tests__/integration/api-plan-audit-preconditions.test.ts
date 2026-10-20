import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: { project: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireWorkspace: vi.fn().mockResolvedValue({ workspaceId: "ws-1", session: { user: { id: "u1" } } }),
    apiSuccess: (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status }),
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: () =>
      NextResponse.json({ success: false, error: { message: "Internal server error" } }, { status: 500 }),
  };
});
vi.mock("@/lib/auth/rbac", () => ({ requirePermission: vi.fn().mockResolvedValue({}) }));
// The plan route runs through route(); the audit POST still uses requireWorkspace (mocked above)
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/services/indexing/index-status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/indexing/index-status")>();
  return { ...actual, isProjectIndexed: vi.fn() };
});
vi.mock("@/services/planning/plan-jobs", () => ({ enqueuePlanGeneration: vi.fn() }));
vi.mock("@/services/auditing/auditor", async () => {
  class AuditUnavailableError extends Error {
    constructor(message: string, readonly status = 409) { super(message); }
  }
  return { AuditUnavailableError, runCodeAudit: vi.fn() };
});

import { prisma } from "@/lib/db";
import { resetRouteAuth } from "../helpers/route-auth";
import { isProjectIndexed } from "@/services/indexing/index-status";
import { enqueuePlanGeneration } from "@/services/planning/plan-jobs";
import { runCodeAudit, AuditUnavailableError } from "@/services/auditing/auditor";
import { POST as postPlan } from "@/app/api/projects/[projectId]/plan/route";
import { POST as postAudit } from "@/app/api/projects/[projectId]/audit/route";

const indexed = isProjectIndexed as ReturnType<typeof vi.fn>;
const params = { params: Promise.resolve({ projectId: "p1" }) };
const req = (path: string) =>
  new NextRequest(`http://localhost/api/projects/p1/${path}`, { method: "POST", body: "{}" });

describe("plan/audit preconditions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRouteAuth();
    (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "p1" });
  });

  it("POST /plan refuses an unindexed project with 409 and starts nothing", async () => {
    indexed.mockResolvedValue(false);

    const res = await postPlan(req("plan"), params);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "INDEX_REQUIRED", message: expect.stringContaining("Index the repository first") });
    expect(enqueuePlanGeneration).not.toHaveBeenCalled();
  });

  it("POST /audit refuses an unindexed project with 409", async () => {
    indexed.mockResolvedValue(false);

    const res = await postAudit(req("audit"), params);

    expect(res.status).toBe(409);
    expect(runCodeAudit).not.toHaveBeenCalled();
  });

  it("POST /audit returns the auditor's fixable reason as 409, not a 500", async () => {
    indexed.mockResolvedValue(true);
    (runCodeAudit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AuditUnavailableError("The repository files aren't available and Orbit has no GitHub access for this project.")
    );

    const res = await postAudit(req("audit"), params);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "AUDIT_UNAVAILABLE",
      message: expect.stringContaining("no GitHub access"),
    });
  });
});
