import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { testCase: { findFirst: vi.fn() }, environment: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireWorkspace: vi.fn(),
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: (error: unknown) => {
      const status = (error as { status?: number }).status ?? 500;
      return NextResponse.json({ success: false, error: { message: String(error) } }, { status });
    },
  };
});
vi.mock("@/lib/auth/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/server/engine/replay/script-store", () => ({ findLatestLiveScript: vi.fn() }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { findLatestLiveScript } from "@/server/engine/replay/script-store";
import { GET } from "@/app/api/projects/[projectId]/test-cases/[testCaseId]/script.spec.ts/route";

type Mocked = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { testCase: { findFirst: Mocked }; environment: { findFirst: Mocked } };
const params = Promise.resolve({ projectId: "p1", testCaseId: "tc1" });
const request = new NextRequest("http://localhost/api/projects/p1/test-cases/tc1/script.spec.ts");

describe("GET test-cases/[id]/script.spec.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireWorkspace as Mocked).mockResolvedValue({ workspaceId: "ws1" });
    (requirePermission as Mocked).mockResolvedValue({ role: "member" });
    db.testCase.findFirst.mockResolvedValue({ name: "Sign in works", steps: [{ action: "Click Sign in", expected: "Dashboard" }] });
    db.environment.findFirst.mockResolvedValue({ url: "https://staging.example.com/" });
    (findLatestLiveScript as Mocked).mockResolvedValue({
      version: 2, envKey: "env-1:DEFAULT:1280x720",
      actions: [{
        stepIndex: 0, action: "click", locators: { role: { role: "button", name: "Sign in" } },
        pre: { urlPattern: "/" }, post: { urlPattern: "/dashboard", assertion: { type: "url_matches", expected: "/dashboard" } },
      }],
    });
  });

  it("requires plans.view and scopes the case to the caller's workspace", async () => {
    await GET(request, { params });
    expect(requirePermission).toHaveBeenCalledWith("ws1", "plans.view");
    expect(db.testCase.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tc1", projectId: "p1", project: { workspaceId: "ws1" } },
    }));
    expect(db.environment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "env-1", projectId: "p1" },
    }));
  });

  it("returns the rendered spec as a download", async () => {
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="sign-in-works.spec.ts"');
    const body = await res.text();
    expect(body).toContain('page.getByRole("button", { name: "Sign in", exact: true }).click()');
    expect(body).toContain('const START_URL = process.env.ORBIT_START_URL ?? "https://staging.example.com/"');
  });

  it("404s when the case has no compiled script or is outside the workspace", async () => {
    (findLatestLiveScript as Mocked).mockResolvedValue(null);
    expect((await GET(request, { params })).status).toBe(404);

    db.testCase.findFirst.mockResolvedValue(null);
    expect((await GET(request, { params })).status).toBe(404);
  });

  it("refuses callers without permission", async () => {
    (requirePermission as Mocked).mockRejectedValue(Object.assign(new Error("Permission denied"), { status: 403 }));
    expect((await GET(request, { params })).status).toBe(403);
    expect(findLatestLiveScript).not.toHaveBeenCalled();
  });
});
