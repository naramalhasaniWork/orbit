import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/knowledge/embedder", () => ({ searchKnowledge: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { searchKnowledge } from "@/services/knowledge/embedder";
import { getPlannerKnowledge } from "@/services/knowledge/context-injector";
import { buildPlannerPrompt, type PlannerContext } from "@/agents/prompts/planner-prompt";

const search = vi.mocked(searchKnowledge);

beforeEach(() => vi.clearAllMocks());

describe("getPlannerKnowledge", () => {
  it("formats relevant chunks and drops types the planner does not use", async () => {
    search.mockResolvedValue([
      { content: "Refunds need manager approval.", score: 0.9, fileType: "business_rules", fileName: "rules.md" },
      { content: "admin / hunter2", score: 0.95, fileType: "test_credentials", fileName: "creds.txt" },
      { content: "Unrelated.", score: 0.3, fileType: "markdown", fileName: "misc.md" },
    ]);

    const result = await getPlannerKnowledge("w1", { journeys: ["Checkout"], routes: ["/cart"] });

    expect(search).toHaveBeenCalledWith("w1", "Checkout; /cart", 20);
    expect(result).toContain("## Domain Knowledge");
    expect(result).toContain("Refunds need manager approval.");
    expect(result).not.toContain("hunter2");
    expect(result).not.toContain("Unrelated.");
  });

  it("returns an empty string instead of throwing when retrieval fails", async () => {
    search.mockRejectedValue(new Error("embedding provider not configured"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(getPlannerKnowledge("w1", { journeys: ["Checkout"], routes: [] })).resolves.toBe("");
  });

  it("skips retrieval when there is nothing to query", async () => {
    expect(await getPlannerKnowledge("w1", { journeys: [], routes: [] })).toBe("");
    expect(search).not.toHaveBeenCalled();
  });
});

describe("buildPlannerPrompt", () => {
  it("includes domain knowledge in the system prompt", () => {
    const context: PlannerContext = {
      systemMap: { framework: "next", nodes: [], edges: [] },
      userConfig: { testMode: "smoke" },
      existingTestNames: [],
      gitHistory: [],
      projectId: "p1",
      domainKnowledge: "## Domain Knowledge\n\nRefunds need manager approval.",
    } as unknown as PlannerContext;

    expect(buildPlannerPrompt(context)).toContain("Refunds need manager approval.");
  });
});
