import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Anthropic-only install with ORBIT_EMBEDDINGS=none: indexing, planning retrieval and
// knowledge search must work without any embedding provider.

const { vector, prismaMock, fetchMock } = vi.hoisted(() => ({
  vector: {
    findSimilarNodes: vi.fn(),
    keywordSearchNodes: vi.fn(),
    findSimilarChunks: vi.fn(),
    keywordSearchChunks: vi.fn(),
    batchSetEmbeddings: vi.fn(),
    setNodeEmbedding: vi.fn(),
    storeChunkEmbedding: vi.fn(),
    buildVectorIndexes: vi.fn(),
    clearAllEmbeddings: vi.fn(),
  },
  prismaMock: {
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
    systemMapNode: { findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    embeddingConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/db/vector", () => vector);
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/vault", () => ({ decrypt: vi.fn() }));

import { validateEnv } from "@/lib/env";
import { generateAndStoreEmbeddings, generateEmbeddingForNode } from "@/services/indexing/embedding-generator";
import { retrieveRelevantNodes } from "@/services/orchestrator/context-manager";
import { embedChunks, searchKnowledge } from "@/services/knowledge/embedder";
import { search, toAnyTermQuery } from "@/server/ai/search";

const ANTHROPIC_ONLY = {
  DATABASE_URL: "postgres://u:p@localhost:5432/orbit",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_SECRET: "s".repeat(32),
  NEXTAUTH_URL: "https://orbit.example.com",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
  ENCRYPTION_KEY: "e".repeat(64),
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY: "pem",
  GITHUB_APP_SLUG: "orbit",
  ANTHROPIC_API_KEY: "sk-ant",
  ORBIT_EMBEDDINGS: "none",
};

beforeEach(() => {
  for (const fn of Object.values(vector)) fn.mockReset();
  vi.stubEnv("ORBIT_EMBEDDINGS", "none");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubGlobal("fetch", fetchMock.mockReset());
  vector.keywordSearchNodes.mockResolvedValue([
    { id: "n1", name: "LoginPage", type: "route", file_path: "app/login/page.tsx", similarity: "0.6" },
  ]);
  vector.keywordSearchChunks.mockResolvedValue([
    { content: "Checkout requires a coupon", metadata: { section: "Billing" }, type: "doc", name: "faq.md", similarity: 0.4 },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ORBIT_EMBEDDINGS=none with only an Anthropic key", () => {
  it("passes env validation", () => {
    expect(validateEnv(ANTHROPIC_ONLY).errors).toEqual([]);
  });

  it("indexing skips embeddings instead of failing", async () => {
    expect(await generateAndStoreEmbeddings("p1")).toBe(0);
    expect(await generateEmbeddingForNode("n1")).toBeNull();
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("planning retrieval falls back to keyword search", async () => {
    const nodes = await retrieveRelevantNodes("p1", "login flow", 5);

    expect(vector.keywordSearchNodes).toHaveBeenCalledWith("p1", "login flow", 5);
    expect(vector.findSimilarNodes).not.toHaveBeenCalled();
    expect(nodes[0]).toMatchObject({ name: "LoginPage", similarity: 0.6 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("knowledge chunks are stored without vectors and found by keyword", async () => {
    const tx = { knowledgeChunk: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) }, domainKnowledgeFile: { update: vi.fn() } };
    prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));

    expect(await embedChunks([{ content: "Coupons", index: 0, metadata: {} }], "f1", "ws1")).toEqual([]);
    expect(tx.knowledgeChunk.create).toHaveBeenCalledTimes(1);
    expect(vector.storeChunkEmbedding).not.toHaveBeenCalled();

    const results = await searchKnowledge("ws1", "checkout coupon rules", 3);
    expect(vector.keywordSearchChunks).toHaveBeenCalledWith("ws1", "checkout | coupon | rules", 3);
    expect(results[0]).toMatchObject({ fileName: "faq.md", section: "Billing", score: 0.4 });
  });
});

describe("search degrades gracefully", () => {
  it("uses keyword search when the embedding provider fails", async () => {
    vi.stubEnv("ORBIT_EMBEDDINGS", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    prismaMock.embeddingConfig.findUnique.mockResolvedValue({ provider: "openai", model: "text-embedding-3-small", dimensions: 1536 });
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const hits = await search.semantic("p1", "login", 3);

    expect(hits).toHaveLength(1);
    expect(vector.findSimilarNodes).not.toHaveBeenCalled();
    expect(vector.keywordSearchNodes).toHaveBeenCalled();
  }, 15_000);

  it("builds any-term full-text queries from free text", () => {
    expect(toAnyTermQuery("Login form, auth! a b")).toBe("login | form | auth");
    expect(toAnyTermQuery("?? !")).toBeNull();
  });
});
