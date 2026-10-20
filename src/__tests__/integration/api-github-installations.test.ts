import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sync = vi.hoisted(() => ({ syncInstallations: vi.fn() }));
const dbMock = vi.hoisted(() => ({
  gitHubInstallation: { findMany: vi.fn(async () => []), deleteMany: vi.fn() },
}));

vi.mock("@/services/github-installation-sync", () => sync);
vi.mock("@/lib/db", () => ({ prisma: dbMock }));
vi.mock("@/lib/github/app", () => ({ isGitHubAppConfigured: () => true }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { GET, POST, DELETE } from "@/app/api/github/installations/route";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";

const request = (method = "GET", body?: unknown) =>
  new NextRequest("http://localhost/api/github/installations", {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  routeAuth.role = "member"; // holds integrations.view, not integrations.manage
});

describe("github installations routes for a role without integrations.manage", () => {
  it("can list (integrations.view) and is pointed at the signed install route", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).data.installUrl).toBe("/api/github/install");
  });

  it("cannot sync", async () => {
    expect((await POST(request("POST"))).status).toBe(403);
    expect(sync.syncInstallations).not.toHaveBeenCalled();
  });

  it("cannot delete", async () => {
    const res = await DELETE(request("DELETE", { installationId: "i" }));
    expect(res.status).toBe(403);
    expect(dbMock.gitHubInstallation.deleteMany).not.toHaveBeenCalled();
  });
});
