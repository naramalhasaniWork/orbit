import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, add, planFindFirst, projectFindUnique, generateLLM, getFlag } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  add: vi.fn(),
  planFindFirst: vi.fn(),
  projectFindUnique: vi.fn(),
  generateLLM: vi.fn(),
  getFlag: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: async (k: string) => store.get(k) ?? null,
    exists: async (k: string) => (store.has(k) ? 1 : 0),
    set: async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    del: async (k: string) => (store.delete(k) ? 1 : 0),
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: { testPlan: { findFirst: planFindFirst }, project: { findUnique: projectFindUnique } },
}));
vi.mock("@/lib/queue/queues", () => ({ getPlanningQueue: () => ({ add }) }));
vi.mock("@/lib/queue/availability", () => ({ withQueueTimeout: <T>(op: Promise<T>) => op }));
vi.mock("@/lib/system-config", () => ({ getFlag }));
vi.mock("@/services/ai-suggestions/suggestion-engine", () => ({
  generateLLMSuggestionsForProject: generateLLM,
}));

import { getLLMSuggestions, refreshLLMSuggestions } from "@/services/ai-suggestions/suggestion-cache";

const P = "p1";
const suggestion = { id: "s1", category: "optimization", severity: "info", title: "t", description: "d" };

describe("AI suggestion cache", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    getFlag.mockResolvedValue(true);
    add.mockResolvedValue({});
    planFindFirst.mockResolvedValue({ version: 2 });
    projectFindUnique.mockResolvedValue({ lastIndexedAt: new Date("2026-10-01T00:00:00Z") });
    generateLLM.mockResolvedValue([suggestion]);
  });

  it("never calls the LLM on read; a miss queues exactly one background job", async () => {
    const first = await getLLMSuggestions(P);
    const second = await getLLMSuggestions(P);

    expect(first).toMatchObject({ status: "pending", suggestions: [] });
    expect(second.status).toBe("pending");
    expect(generateLLM).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("suggestions", { kind: "suggestions", projectId: P });
  });

  it("serves the cached result instantly once the job has run", async () => {
    await refreshLLMSuggestions(P);
    const result = await getLLMSuggestions(P);

    expect(result).toMatchObject({ status: "ready", stale: false, suggestions: [suggestion] });
    expect(add).not.toHaveBeenCalled();
  });

  it("marks the cache stale and refreshes in the background when the plan version changes", async () => {
    await refreshLLMSuggestions(P);
    planFindFirst.mockResolvedValue({ version: 3 });

    const result = await getLLMSuggestions(P);

    expect(result).toMatchObject({ status: "ready", stale: true, suggestions: [suggestion] });
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the ai_suggestions flag is off", async () => {
    getFlag.mockResolvedValue(false);
    expect(await getLLMSuggestions(P)).toMatchObject({ status: "disabled", suggestions: [] });
    expect(add).not.toHaveBeenCalled();
  });
});
