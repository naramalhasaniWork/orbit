import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const repo = vi.hoisted(() => ({
  getTourCompletedAt: vi.fn(),
  setTourCompletedAt: vi.fn(),
  loadTourContext: vi.fn(),
}));
const db = vi.hoisted(() => ({ workspace: { findUnique: vi.fn() } }));

vi.mock("@/server/data/tour-repo", () => repo);
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { DELETE, GET, POST } from "@/app/api/user/onboarding-tour/route";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";

const req = (method: string, query = "") => new NextRequest(`http://localhost/api/user/onboarding-tour${query}`, { method });
const noParams = { params: {} };
const PROJECT = "d0000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  db.workspace.findUnique.mockResolvedValue({ settings: { github: { connected: true } } });
  repo.getTourCompletedAt.mockResolvedValue(null);
  repo.loadTourContext.mockResolvedValue({ projectId: PROJECT });
  repo.setTourCompletedAt.mockImplementation(async (_u: string, at: Date | null) => at);
});

describe("GET /api/user/onboarding-tour", () => {
  it("returns the caller's completion and the project's tour facts", async () => {
    repo.getTourCompletedAt.mockResolvedValue(new Date("2026-10-20T10:00:00.000Z"));
    const res = await GET(req("GET", `?project=${PROJECT}`), noParams);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ completedAt: "2026-10-20T10:00:00.000Z", context: { projectId: PROJECT } });
    expect(repo.getTourCompletedAt).toHaveBeenCalledWith("user-1");
    expect(repo.loadTourContext.mock.calls[0].slice(1)).toEqual([PROJECT, true]);
  });

  it("rejects a project id that is not a uuid", async () => {
    expect((await GET(req("GET", "?project=../x"), noParams)).status).toBe(400);
  });

  it("needs a workspace member", async () => {
    routeAuth.member = false;
    expect((await GET(req("GET"), noParams)).status).toBe(403);
  });
});

describe("POST /api/user/onboarding-tour (finished or skipped)", () => {
  it("persists completion for the calling user only", async () => {
    routeAuth.userId = "user-9";
    const res = await POST(req("POST"), noParams);
    const { completedAt } = (await res.json()).data;
    expect(repo.setTourCompletedAt).toHaveBeenCalledWith("user-9", expect.any(Date));
    expect(Number.isNaN(Date.parse(completedAt))).toBe(false);
  });
});

describe("DELETE /api/user/onboarding-tour (replay)", () => {
  it("clears completion so the tour is due again", async () => {
    const res = await DELETE(req("DELETE"), noParams);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ completedAt: null });
    expect(repo.setTourCompletedAt).toHaveBeenCalledWith("user-1", null);
  });
});
