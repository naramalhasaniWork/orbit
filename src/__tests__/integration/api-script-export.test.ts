import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: { project: { findFirst: vi.fn() }, testCase: { findUnique: vi.fn() }, environment: { findFirst: vi.fn() } },
}));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/server/engine/replay/script-store", () => ({ findLatestLiveScript: vi.fn() }));

import { prisma } from "@/lib/db";
import { findLatestLiveScript } from "@/server/engine/replay/script-store";
import { GET } from "@/app/api/projects/[projectId]/test-cases/[testCaseId]/script.spec.ts/route";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";

type Mocked = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  project: { findFirst: Mocked };
  testCase: { findUnique: Mocked };
  environment: { findFirst: Mocked };
};
const PROJECT = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-8222-222222222222";
const ENV = "33333333-3333-4333-8333-333333333333";

function call(params: Record<string, string> = { projectId: PROJECT, testCaseId: CASE }) {
  return GET(new NextRequest(`http://localhost/api/projects/${params.projectId}/test-cases/${params.testCaseId}/script.spec.ts`), {
    params: Promise.resolve(params),
  });
}

describe("GET test-cases/[testCaseId]/script.spec.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRouteAuth();
    db.project.findFirst.mockResolvedValue({ id: PROJECT });
    db.testCase.findUnique.mockResolvedValue({ name: "Sign in works", steps: [{ action: "Click Sign in", expected: "Dashboard" }] });
    db.environment.findFirst.mockResolvedValue({ url: "https://staging.example.com/" });
    (findLatestLiveScript as Mocked).mockResolvedValue({
      version: 2, envKey: `${ENV}:DEFAULT:1280x720`,
      actions: [{
        stepIndex: 0, action: "click", locators: { role: { role: "button", name: "Sign in" } },
        pre: { urlPattern: "/" }, post: { urlPattern: "/dashboard", assertion: { type: "url_matches", expected: "/dashboard" } },
      }],
    });
  });

  it("scopes the case to the caller's workspace and the environment to the project", async () => {
    await call();
    expect(db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PROJECT, AND: [{ workspaceId: "ws-1" }] },
    }));
    expect(db.testCase.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CASE, AND: [{ projectId: PROJECT }] },
    }));
    expect(db.environment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ENV, AND: [{ projectId: PROJECT }] },
    }));
  });

  it("returns the rendered spec as a download", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="sign-in-works.spec.ts"');
    const body = await res.text();
    expect(body).toContain('page.getByRole("button", { name: "Sign in", exact: true }).click()');
    expect(body).toContain('const START_URL = process.env.ORBIT_START_URL ?? "https://staging.example.com/"');
  });

  it("404s when the case has no compiled script or is outside the workspace", async () => {
    (findLatestLiveScript as Mocked).mockResolvedValue(null);
    expect((await call()).status).toBe(404);

    db.testCase.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);

    db.project.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("refuses non-members and rejects malformed ids", async () => {
    routeAuth.member = false;
    expect((await call()).status).toBe(403);
    expect(findLatestLiveScript).not.toHaveBeenCalled();

    resetRouteAuth();
    expect((await call({ projectId: "nope", testCaseId: CASE })).status).toBe(400);
  });
});
