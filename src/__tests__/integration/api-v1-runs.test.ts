import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    environment: { findFirst: vi.fn() },
    project: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/auth/api-key", () => ({
  requireApiKey: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }),
  verifyProjectAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/services/execution/environment-validator", () => ({
  getDefaultEnvironment: vi.fn().mockResolvedValue("env-staging"),
}));
vi.mock("@/services/orchestrator/run-launcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/orchestrator/run-launcher")>();
  return { ...actual, launchPipelineRun: vi.fn() };
});

import { prisma } from "@/lib/db";
import { launchPipelineRun } from "@/services/orchestrator/run-launcher";
import { POST } from "@/app/api/v1/projects/[projectId]/runs/route";
import { triggerRun } from "@/services/mcp/tool-handlers";

const db = prisma as unknown as {
  environment: { findFirst: ReturnType<typeof vi.fn> };
  project: { findUnique: ReturnType<typeof vi.fn> };
};
const launch = launchPipelineRun as ReturnType<typeof vi.fn>;

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/projects/p1/runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId: "p1" }) }
  );
}

describe("POST /api/v1/projects/[projectId]/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.environment.findFirst.mockResolvedValue({ id: "env-staging", type: "staging", url: "https://s" });
  });

  it("starts a pipeline run on the default environment", async () => {
    launch.mockResolvedValue({ ok: true, runId: "run-1" });

    const response = await post({ mode: "smoke", branch: "main" });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "run-1", status: "queued", mode: "smoke" });
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "p1", mode: "smoke", trigger: "api", branch: "main", environmentId: "env-staging",
    }));
  });

  it("returns the canConsume reason when the workspace is out of credits", async () => {
    launch.mockResolvedValue({ ok: false, code: "INSUFFICIENT_CREDITS", reason: "Credit balance is 0." });

    const response = await post({});

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_CREDITS", error: "Credit balance is 0." });
  });

  it("refuses production before launching", async () => {
    db.environment.findFirst.mockResolvedValue({ id: "env-prod", type: "production", url: "https://p" });

    const response = await post({ environment: "env-prod" });

    expect(response.status).toBe(403);
    expect(launch).not.toHaveBeenCalled();
  });
});

describe("MCP orbit_trigger_run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.project.findUnique.mockResolvedValue({ id: "p1", name: "Acme" });
  });

  it("launches a real run through the shared launcher", async () => {
    launch.mockResolvedValue({ ok: true, runId: "run-9" });

    const result = await triggerRun("p1", "regression");

    expect(launch).toHaveBeenCalledWith({ projectId: "p1", mode: "regression", trigger: "api" });
    expect(result).toMatchObject({ runId: "run-9", status: "queued" });
  });

  it("surfaces a blocked launch and coerces unknown modes to smoke", async () => {
    launch.mockResolvedValue({ ok: false, code: "LIMIT_REACHED", reason: "Monthly run limit reached (100)." });

    const result = await triggerRun("p1", "everything");

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ mode: "smoke" }));
    expect(result).toEqual({ error: "Monthly run limit reached (100).", code: "LIMIT_REACHED" });
  });
});
