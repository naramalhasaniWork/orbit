import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, getDefaultEnvironment } = vi.hoisted(() => ({
  findMany: vi.fn(),
  getDefaultEnvironment: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { environment: { findMany } } }));
vi.mock("@/services/execution/environment-validator", () => ({ getDefaultEnvironment }));
vi.mock("@/services/orchestrator/agent-memory", () => ({ formatMemoryForPrompt: () => "" }));

import { executeTool, ORBIT_TOOLS } from "@/services/orbit-agent/tools";
import { describeEnvironments, listProjectEnvironments } from "@/services/orbit-agent/environments";
import { buildOrbitAgentPrompt } from "@/services/orbit-agent/prompt";
import type { AgentMemorySnapshot } from "@/services/orchestrator/agent-memory";

const ctx = { projectId: "proj-1", workspaceId: "ws-1", userId: "u-1" };

// The regression: a staging env that isn't flagged isDefault was invisible
// to the agent, which then told the user no staging environment existed.
const staging = { id: "env-s", name: "Staging", type: "staging", url: "https://staging.example.com", isDefault: false };
const prod = { id: "env-p", name: "Production", type: "production", url: "https://example.com", isDefault: false };

describe("Orbit Agent environments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([staging, prod]);
    getDefaultEnvironment.mockResolvedValue("env-s");
  });

  it("list_environments returns non-default environments, scoped to the workspace", async () => {
    const result = JSON.parse(await executeTool("list_environments", {}, ctx));

    expect(result.count).toBe(2);
    expect(result.environments[0]).toMatchObject({ name: "Staging", type: "staging", usedForRuns: true });
    expect(result.environments[1]).toMatchObject({ name: "Production", usedForRuns: false });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "proj-1", project: { workspaceId: "ws-1", deletedAt: null } },
      })
    );
  });

  it("is registered as a tool the model can call", () => {
    expect(ORBIT_TOOLS.map((t) => t.name)).toContain("list_environments");
  });

  it("puts every environment in the prompt and tells the agent to check, not guess", async () => {
    const environments = await listProjectEnvironments("proj-1", "ws-1");
    const prompt = buildOrbitAgentPrompt({
      project: {
        name: "Acme",
        framework: "nextjs",
        lastIndexedAt: null,
        lastRunAt: null,
        healthStatus: "healthy",
        systemMapStats: { nodes: 0, edges: 0 },
        activePlan: null,
        lastRun: null,
        environments: describeEnvironments(environments),
      },
      memory: { totalRuns: 0 } as AgentMemorySnapshot,
    });

    expect(prompt).toContain("Staging [staging] https://staging.example.com (used for test runs)");
    expect(prompt).toContain("list_environments");
    expect(prompt).toMatch(/Never state whether something exists/);
    expect(prompt).not.toContain("No environment configured");
  });

  it("says none only when there really are none", () => {
    expect(describeEnvironments([])).toBe("None configured");
  });
});
