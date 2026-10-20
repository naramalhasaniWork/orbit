import { describe, it, expect, vi, beforeEach } from "vitest";

const artifactStore: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    runArtifact: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `a${artifactStore.length + 1}`, ...data };
        artifactStore.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(artifactStore.find((a) => a.id === where.id)!, data);
      }),
      findMany: vi.fn(async () => artifactStore),
      findFirst: vi.fn(async ({ where }: { where: { storageKey: string } }) =>
        artifactStore.find((a) => a.storageKey === where.storageKey) ?? null
      ),
    },
    project: { findUniqueOrThrow: vi.fn(async () => ({ workspaceId: "w1" })) },
  },
}));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ upload: vi.fn() }) }));
vi.mock("@/services/execution/browser-manager", () => ({
  launchBrowser: vi.fn(async () => ({
    page: {
      goto: vi.fn(),
      waitForTimeout: vi.fn(),
      screenshot: vi.fn(async () => new Uint8Array([1, 2, 3])),
    },
  })),
  closeBrowser: vi.fn(),
}));
vi.mock("@/services/visual-qa/baseline-manager", () => ({
  getBaseline: vi.fn(),
  acceptAsBaseline: vi.fn(),
  computeChecksum: vi.fn(() => "sum"),
}));
vi.mock("@/services/visual-qa/diff-engine", () => ({ compareScreenshots: vi.fn() }));
vi.mock("@/services/visual-qa/brand-checker", () => ({ checkBrandConsistency: vi.fn() }));

import { runVisualTest } from "@/services/visual-qa/visual-test-runner";
import { loadRunVisualResults } from "@/services/visual-qa/run-results";
import { getBaseline } from "@/services/visual-qa/baseline-manager";
import { compareScreenshots } from "@/services/visual-qa/diff-engine";

beforeEach(() => {
  artifactStore.length = 0;
  vi.clearAllMocks();
});

describe("visual results round trip", () => {
  it("persists the diff on the screenshot artifact and reads it back for the run page", async () => {
    // A baseline screenshot from an earlier run
    artifactStore.push({
      id: "base1",
      testRunId: "old-run",
      storageKey: "visual-qa/p1/old-run/_home.png",
      metadata: { source: "visual-qa" },
    });
    vi.mocked(getBaseline).mockResolvedValue({
      storageKey: "visual-qa/p1/old-run/_home.png",
    } as never);
    const diff = {
      diffPercentage: 4.2,
      regions: [],
      isRegression: true,
      summary: "changed",
      identical: false,
    };
    vi.mocked(compareScreenshots).mockResolvedValue(diff);

    const result = await runVisualTest({
      runId: "r1",
      projectId: "p1",
      routePath: "/home",
      environmentUrl: "https://staging.example.com",
    });
    expect(result.passed).toBe(false);

    const [data] = await loadRunVisualResults("p1", "r1");
    // findMany mock returns every row; the baseline row has no routePath and is skipped
    expect(data.routePath).toBe("/home");
    expect(data.diff).toEqual(diff);
    expect(data.baselineUrl).toBe("/api/projects/p1/runs/old-run/artifacts/base1/file");
    expect(data.currentUrl).toBe("/api/projects/p1/runs/r1/artifacts/a2/file");
  });

  it("returns nothing for artifacts recorded before results were persisted", async () => {
    artifactStore.push({ id: "x", storageKey: "k", metadata: { source: "visual-qa" } });
    expect(await loadRunVisualResults("p1", "r1")).toEqual([]);
  });
});
