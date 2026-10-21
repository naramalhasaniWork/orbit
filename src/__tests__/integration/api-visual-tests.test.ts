import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => {
  const prisma = {
    project: { findFirst: vi.fn() },
    environment: { findFirst: vi.fn() },
    testRun: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return prisma;
});
const canConsume = vi.hoisted(() => vi.fn());
const runVisualTest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/tenant", () => ({ canConsume }));
vi.mock("@/services/visual-qa/visual-test-runner", () => ({ runVisualTest }));
vi.mock("@/services/execution/environment-validator", () => ({ getDefaultEnvironment: vi.fn(async () => "env-1") }));
vi.mock("@/lib/queue/queues", () => ({}));
vi.mock("@/lib/websocket", () => ({ emitRunStarted: vi.fn() }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { POST } from "@/app/api/projects/[projectId]/visual-tests/route";
import { resetRouteAuth } from "../helpers/route-auth";

const call = (body: unknown) =>
  POST(new NextRequest("http://x/api/projects/p1/visual-tests", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ projectId: "p1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetRouteAuth();
  canConsume.mockResolvedValue({ allowed: true });
  db.project.findFirst.mockResolvedValue({ id: "p1" });
  db.environment.findFirst.mockResolvedValue({ id: "env-1", url: "https://staging.example.com", type: "staging" });
  db.testRun.create.mockResolvedValue({ id: "run-1" });
  runVisualTest.mockResolvedValue({ passed: true });
});

describe("POST /api/projects/[projectId]/visual-tests", () => {
  it("creates its run under the workspace allowance and completes it", async () => {
    const res = await call({ routePath: "/pricing" });
    expect(res.status).toBe(201);
    expect(canConsume).toHaveBeenCalledWith("ws-1", "run", expect.anything());
    expect(db.testRun.create).toHaveBeenCalledTimes(1);
    expect(db.testRun.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run-1", AND: [{ projectId: "p1" }] } }));
  });

  it("refuses with the allowance reason and runs nothing when the limit is reached", async () => {
    canConsume.mockResolvedValue({ allowed: false, code: "LIMIT_REACHED", reason: "Run limit reached." });
    const res = await call({ routePath: "/pricing" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
    expect(db.testRun.create).not.toHaveBeenCalled();
    expect(runVisualTest).not.toHaveBeenCalled();
  });

  it("attaches to an existing run without consuming allowance, if it belongs to the project", async () => {
    db.testRun.findFirst.mockResolvedValue({ id: "run-9" });
    expect((await call({ routePath: "/pricing", runId: "run-9" })).status).toBe(201);
    expect(canConsume).not.toHaveBeenCalled();
    expect(db.testRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run-9", projectId: "p1", AND: [{ projectId: "p1" }] } }));
  });

  it("404s a runId from another project", async () => {
    db.testRun.findFirst.mockResolvedValue(null);
    const res = await call({ routePath: "/pricing", runId: "foreign" });
    expect(res.status).toBe(404);
    expect(runVisualTest).not.toHaveBeenCalled();
  });
});
