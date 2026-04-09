# Orbit 1000x Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Orbit from a functional testing platform into an intelligent, resilient, self-improving testing system by activating semantic retrieval, wiring git history, hardening execution reliability, adding invariant testing + fault injection, closing the coverage feedback loop, building interactive test replay, and polishing the dashboard UX.

**Architecture:** 8 parallel workstreams designed for simultaneous agent execution. Each agent owns a clean boundary — no file conflicts between agents. Phases 1-3 from the strategic analysis plus a UX polish track.

**Tech Stack:** TypeScript strict, Next.js 14 App Router, Prisma 7, pgvector, Redis/BullMQ, Playwright, Vitest, Tailwind CSS, shadcn/ui

**Verification:** Each agent runs `pnpm build && pnpm test` before marking complete. Final integration verification across all workstreams before push.

---

## Agent Assignment Map

| Agent | Workstream | Phase | Files Owned |
|-------|-----------|-------|-------------|
| **Agent 1** | Semantic Retrieval | 1 | planner.ts, coverage-analyzer.ts, journey-reconstructor.ts, planner-prompt.ts |
| **Agent 2** | Git History Integration | 1 | indexing/git-history.ts (new), pipeline.ts, test-case-generator context |
| **Agent 3** | Execution Reliability | 1 | runner.ts, step-executor.ts, browser-manager.ts, stagehand-adapter.ts, self-healer.ts, redis/lock.ts (new) |
| **Agent 4** | System Invariant Layer | 2 | execution/invariant-checker.ts (new), action-performer.ts, test-case-executor.ts |
| **Agent 5** | Fault Injection Engine | 2 | execution/fault-injector.ts (new), browser-manager.ts (fault routes only) |
| **Agent 6** | Coverage Feedback Loop | 3 | planning/coverage-feedback.ts (new), orchestrator/pipeline.ts (feedback phase) |
| **Agent 7** | Interactive Test Replay | 3 | components/runs/test-replay.tsx (new), runs/[runId] page |
| **Agent 8** | Dashboard UX Polish | All | Layout components, sidebar, spacing, page flow, globals.css |

---

## Agent 1: Semantic Retrieval Activation

**Objective:** Replace fuzzy text matching in the planner with pgvector semantic similarity queries. The embedding infrastructure exists (`src/lib/db/vector.ts:findSimilarNodes`). This agent wires it into the planning pipeline.

### Task 1.1: Add semantic retrieval to coverage analyzer

**Files:**
- Modify: `src/services/planning/coverage-analyzer.ts:206-233`
- Read: `src/lib/db/vector.ts:152-173` (findSimilarNodes signature)

**Step 1: Write failing test**

Create `src/__tests__/unit/semantic-coverage.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

// Mock the vector module
vi.mock("@/lib/db/vector", () => ({
  findSimilarNodes: vi.fn(),
  generateEmbedding: vi.fn(),
}));

describe("coverage-analyzer semantic matching", () => {
  it("should use semantic similarity when embeddings are available", async () => {
    const { findSimilarNodes } = await import("@/lib/db/vector");
    const mockedFind = vi.mocked(findSimilarNodes);
    mockedFind.mockResolvedValue([
      { id: "node-1", name: "CheckoutForm", type: "component", file_path: "src/checkout.tsx", similarity: 0.92 },
    ]);

    // Import after mocking
    const { analyzeCoverage } = await import("@/services/planning/coverage-analyzer");

    const result = await analyzeCoverage({
      projectId: "test-project",
      nodes: [{ id: "node-1", name: "CheckoutForm", type: "component", filePath: "src/checkout.tsx" }],
      existingTestCases: [{ id: "tc-1", name: "checkout form submission test", journey: "checkout" }],
      useSemanticMatching: true,
    });

    expect(mockedFind).toHaveBeenCalled();
    expect(result.coveredNodes).toContain("CheckoutForm");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/unit/semantic-coverage.test.ts`
Expected: FAIL — `useSemanticMatching` param doesn't exist yet

**Step 3: Add semantic matching to coverage-analyzer.ts**

In `src/services/planning/coverage-analyzer.ts`, add import at top:
```typescript
import { findSimilarNodes, generateEmbedding } from "@/lib/db/vector";
```

Replace the fuzzy matching block (lines 206-233) with:
```typescript
const coveredNodeNames = new Set<string>();

if (options?.useSemanticMatching && projectId) {
  // Semantic matching via pgvector embeddings
  for (const tc of existingTestCases) {
    const testDescription = `${tc.name} ${tc.journey ?? ""}`.trim();
    try {
      const embedding = await generateEmbedding(testDescription);
      const similar = await findSimilarNodes(projectId, embedding, 5);
      for (const match of similar) {
        if (match.similarity >= 0.75) {
          coveredNodeNames.add(match.name);
        }
      }
    } catch {
      // Fall back to text matching for this test case
      fallbackTextMatch(tc, nodes, coveredNodeNames);
    }
  }
} else {
  // Fallback: fuzzy text matching (existing logic)
  for (const tc of existingTestCases) {
    fallbackTextMatch(tc, nodes, coveredNodeNames);
  }
}
```

Extract existing fuzzy logic into `fallbackTextMatch`:
```typescript
function fallbackTextMatch(
  tc: { name: string; journey?: string },
  nodes: Array<{ name: string; filePath: string }>,
  coveredNodeNames: Set<string>
): void {
  const tcNameLower = tc.name.toLowerCase();
  const tcJourney = tc.journey?.toLowerCase() ?? "";
  for (const node of nodes) {
    const nodeNameLower = node.name.toLowerCase();
    const nodePathLower = node.filePath.toLowerCase();
    const journeyMatch = tcJourney.length >= 3 &&
      (nodeNameLower.includes(tcJourney) || nodePathLower.includes(tcJourney));
    const nameMatch = nodeNameLower.length >= MIN_NODE_NAME_MATCH_LENGTH &&
      tcNameLower.includes(nodeNameLower);
    if (journeyMatch || nameMatch) {
      coveredNodeNames.add(node.name);
    }
  }
}
```

**Step 4: Run tests**

Run: `pnpm test src/__tests__/unit/semantic-coverage.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/services/planning/coverage-analyzer.ts src/__tests__/unit/semantic-coverage.test.ts
git commit -m "feat: add semantic similarity matching to coverage analyzer via pgvector"
```

### Task 1.2: Add semantic retrieval to journey reconstructor

**Files:**
- Modify: `src/services/planning/journey-reconstructor.ts:33-66`

**Step 1: Write failing test**

Create `src/__tests__/unit/semantic-journey.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/vector", () => ({
  findSimilarNodes: vi.fn(),
  generateEmbedding: vi.fn(),
}));

describe("journey-reconstructor semantic classification", () => {
  it("should classify nodes using semantic similarity when keyword matching fails", async () => {
    const { generateEmbedding, findSimilarNodes } = await import("@/lib/db/vector");
    vi.mocked(generateEmbedding).mockResolvedValue(new Array(1536).fill(0));
    vi.mocked(findSimilarNodes).mockResolvedValue([
      { id: "n1", name: "PaymentProcessor", type: "component", file_path: "src/pay.tsx", similarity: 0.88 },
    ]);

    const { reconstructJourneys } = await import("@/services/planning/journey-reconstructor");

    const result = await reconstructJourneys({
      projectId: "test-project",
      nodes: [{ id: "n1", name: "PaymentProcessor", type: "component", filePath: "src/pay.tsx" }],
      edges: [],
      useSemanticClassification: true,
    });

    expect(result.some((j) => j.name === "checkout")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/unit/semantic-journey.test.ts`
Expected: FAIL

**Step 3: Add semantic classification fallback to journey-reconstructor.ts**

After the keyword-based `classifyNode` function (line 66), add:
```typescript
async function classifyNodeSemantic(
  node: PrismaNode,
  projectId: string
): Promise<string | null> {
  try {
    const description = `${node.name} ${node.filePath}`;
    const embedding = await generateEmbedding(description);
    const similar = await findSimilarNodes(projectId, embedding, 3);

    // Check if any similar nodes are already classified
    for (const match of similar) {
      if (match.similarity >= 0.8 && match.id !== node.id) {
        const classified = classifyNode({ ...node, name: match.name, filePath: match.file_path } as PrismaNode);
        if (classified) return classified;
      }
    }

    // Semantic journey hint matching
    const journeyHints: Record<string, string[]> = {
      authentication: ["user authentication", "login form", "session management", "password reset", "OAuth"],
      checkout: ["payment processing", "shopping cart", "order summary", "billing address", "stripe"],
      onboarding: ["user onboarding", "welcome flow", "first-time setup", "getting started"],
      dashboard: ["analytics dashboard", "main overview", "statistics panel", "activity feed"],
      settings: ["user settings", "configuration panel", "account management", "preferences"],
      crud: ["data management", "record creation", "item listing", "form editor"],
    };

    for (const [journey, hints] of Object.entries(journeyHints)) {
      for (const hint of hints) {
        const hintEmbedding = await generateEmbedding(hint);
        const hintSimilar = await findSimilarNodes(projectId, hintEmbedding, 1);
        if (hintSimilar.length > 0 && hintSimilar[0].id === node.id && hintSimilar[0].similarity >= 0.7) {
          return journey;
        }
      }
    }
  } catch {
    // Semantic classification unavailable, return null to fall back to keywords
  }
  return null;
}
```

Update `buildKeywordJourneys` to try semantic classification when keyword fails:
```typescript
for (const node of nodes) {
  let journeyName = classifyNode(node);
  if (!journeyName && useSemanticClassification && projectId) {
    journeyName = await classifyNodeSemantic(node, projectId);
  }
  if (journeyName) {
    if (!journeyGroups.has(journeyName)) journeyGroups.set(journeyName, []);
    journeyGroups.get(journeyName)!.push(node);
  }
}
```

**Step 4: Run tests**

Run: `pnpm test src/__tests__/unit/semantic-journey.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/services/planning/journey-reconstructor.ts src/__tests__/unit/semantic-journey.test.ts
git commit -m "feat: add semantic classification fallback to journey reconstructor"
```

### Task 1.3: Add semantic context retrieval to planner prompt

**Files:**
- Modify: `src/services/planning/planner.ts:251-267`
- Modify: `src/agents/prompts/planner-prompt.ts`

**Step 1: In planner.ts, before context assembly (line 250), add semantic retrieval:**

```typescript
// Retrieve semantically relevant code context for focus areas
let semanticContext: Array<{ name: string; type: string; filePath: string; similarity: number }> = [];
if (focusAreas.length > 0) {
  try {
    const { generateEmbedding, findSimilarNodes } = await import("@/lib/db/vector");
    const focusDescription = focusAreas.join(", ");
    const embedding = await generateEmbedding(focusDescription);
    semanticContext = await findSimilarNodes(projectId, embedding, 20);
  } catch {
    // Semantic retrieval unavailable, continue without it
  }
}
```

**Step 2: Add semanticContext to the PlannerContext type and pass it through:**

In `src/agents/prompts/planner-prompt.ts`, extend PlannerContext:
```typescript
export interface PlannerContext {
  // ... existing fields ...
  semanticContext?: Array<{ name: string; type: string; filePath: string; similarity: number }>;
}
```

In `buildPlannerPrompt`, add a section when semantic context is available:
```typescript
if (context.semanticContext && context.semanticContext.length > 0) {
  sections.push(`## Semantically Related Code
The following code elements are semantically related to the focus areas and should receive higher test coverage priority:
${context.semanticContext.map((sc) => `- ${sc.type}: ${sc.name} (${sc.filePath}) — relevance: ${(sc.similarity * 100).toFixed(0)}%`).join("\n")}`);
}
```

**Step 3: Wire into planner.ts context assembly at line 261:**

```typescript
const context: PlannerContext = {
  systemMap,
  userConfig: { /* ... existing ... */ },
  existingTestNames,
  gitHistory: [], // Wired by Agent 2
  failurePatterns,
  projectId,
  workspaceName,
  operationsMap: input.operationsMap,
  testingNotes: testingNotes.length > 0 ? testingNotes : undefined,
  semanticContext, // NEW
};
```

**Step 4: Run full test suite**

Run: `pnpm test`
Expected: All existing tests pass (no breaking changes)

**Step 5: Commit**
```bash
git add src/services/planning/planner.ts src/agents/prompts/planner-prompt.ts
git commit -m "feat: wire pgvector semantic retrieval into planner context"
```

---

## Agent 2: Git History Integration

**Objective:** Feed git commit history into the planning pipeline so the planner can prioritize recently changed and frequently modified code.

### Task 2.1: Create git history extraction service

**Files:**
- Create: `src/services/indexing/git-history.ts`

**Step 1: Write failing test**

Create `src/__tests__/unit/git-history.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

describe("git-history", () => {
  it("should parse git log output into structured change records", () => {
    const { parseGitLogOutput } = require("@/services/indexing/git-history");

    const gitOutput = `abc1234|2026-04-01|feat: update checkout form
 3 files changed, 45 insertions(+), 12 deletions(-)
 src/components/checkout/CheckoutForm.tsx | 30 ++++++++++++-------
 src/lib/api/payments.ts | 15 +++++++--
 src/app/api/checkout/route.ts | 12 ++++++`;

    const result = parseGitLogOutput(gitOutput);
    expect(result).toHaveLength(3);
    expect(result[0].filePath).toBe("src/components/checkout/CheckoutForm.tsx");
    expect(result[0].changeCount).toBeGreaterThan(0);
  });

  it("should aggregate file change frequency", () => {
    const { aggregateChangeFrequency } = require("@/services/indexing/git-history");

    const changes = [
      { filePath: "src/a.ts", commitHash: "abc", date: "2026-04-01", changeCount: 10 },
      { filePath: "src/a.ts", commitHash: "def", date: "2026-04-05", changeCount: 5 },
      { filePath: "src/b.ts", commitHash: "ghi", date: "2026-04-03", changeCount: 20 },
    ];

    const freq = aggregateChangeFrequency(changes);
    expect(freq.get("src/a.ts")?.commitCount).toBe(2);
    expect(freq.get("src/a.ts")?.totalChanges).toBe(15);
    expect(freq.get("src/b.ts")?.commitCount).toBe(1);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm test src/__tests__/unit/git-history.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement git-history.ts**

Create `src/services/indexing/git-history.ts`:
```typescript
import { prisma } from "@/lib/db";

export interface FileChange {
  filePath: string;
  commitHash: string;
  date: string;
  message: string;
  changeCount: number;
}

export interface FileChangeFrequency {
  filePath: string;
  commitCount: number;
  totalChanges: number;
  lastChanged: string;
  recentCommitMessages: string[];
}

export function parseGitLogOutput(output: string): FileChange[] {
  const changes: FileChange[] = [];
  const lines = output.trim().split("\n");
  let currentCommit = { hash: "", date: "", message: "" };

  for (const line of lines) {
    const commitMatch = line.match(/^([a-f0-9]+)\|(\d{4}-\d{2}-\d{2})\|(.+)$/);
    if (commitMatch) {
      currentCommit = { hash: commitMatch[1], date: commitMatch[2], message: commitMatch[3] };
      continue;
    }
    const fileMatch = line.match(/^\s+(.+?)\s+\|\s+(\d+)/);
    if (fileMatch && currentCommit.hash) {
      changes.push({
        filePath: fileMatch[1].trim(),
        commitHash: currentCommit.hash,
        date: currentCommit.date,
        message: currentCommit.message,
        changeCount: parseInt(fileMatch[2], 10),
      });
    }
  }
  return changes;
}

export function aggregateChangeFrequency(
  changes: FileChange[]
): Map<string, FileChangeFrequency> {
  const freq = new Map<string, FileChangeFrequency>();

  for (const change of changes) {
    const existing = freq.get(change.filePath);
    if (existing) {
      existing.commitCount++;
      existing.totalChanges += change.changeCount;
      if (change.date > existing.lastChanged) {
        existing.lastChanged = change.date;
      }
      if (existing.recentCommitMessages.length < 5) {
        existing.recentCommitMessages.push(change.message);
      }
    } else {
      freq.set(change.filePath, {
        filePath: change.filePath,
        commitCount: 1,
        totalChanges: change.changeCount,
        lastChanged: change.date,
        recentCommitMessages: [change.message],
      });
    }
  }
  return freq;
}

export async function getGitHistoryForProject(
  projectId: string,
  daysSince: number = 30
): Promise<FileChange[]> {
  // Fetch stored git log from the project's cloned repo metadata
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoUrl: true, defaultBranch: true },
  });
  if (!project) return [];

  // Git log is captured during clone phase and stored as project metadata
  // This reads from the stored analysis, not running git directly
  const gitData = await prisma.systemMapNode.findMany({
    where: {
      projectId,
      type: "git_history",
    },
    select: { metadata: true },
    take: 1,
  });

  if (gitData.length === 0) return [];

  const metadata = gitData[0].metadata as Record<string, unknown>;
  const rawLog = (metadata?.gitLog as string) ?? "";
  return parseGitLogOutput(rawLog);
}
```

**Step 4: Run tests**

Run: `pnpm test src/__tests__/unit/git-history.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/services/indexing/git-history.ts src/__tests__/unit/git-history.test.ts
git commit -m "feat: add git history extraction and change frequency analysis"
```

### Task 2.2: Wire git history into the indexing pipeline

**Files:**
- Modify: `src/services/indexing/pipeline.ts`

**Step 1: Add git history collection as Phase 6.5 of the indexing pipeline**

In `pipeline.ts`, after the embedding generation phase, add:
```typescript
// Phase 7: Git History Analysis
emitProgress(projectId, "git_history", "Analyzing git history...");
try {
  const { parseGitLogOutput, aggregateChangeFrequency } = await import("./git-history");
  // The clone phase already has the repo content — extract git log from GitHub API
  const gitLogRaw = await fetchGitLogFromGitHub(projectId, cloneResult.token, 30);
  const changes = parseGitLogOutput(gitLogRaw);
  const frequency = aggregateChangeFrequency(changes);

  // Store as a system map node for downstream retrieval
  await prisma.systemMapNode.upsert({
    where: {
      projectId_type_name: { projectId, type: "git_history", name: "recent_changes" },
    },
    create: {
      projectId,
      type: "git_history",
      name: "recent_changes",
      filePath: "",
      metadata: {
        gitLog: gitLogRaw,
        changeFrequency: Object.fromEntries(frequency),
        analyzedAt: new Date().toISOString(),
      },
    },
    update: {
      metadata: {
        gitLog: gitLogRaw,
        changeFrequency: Object.fromEntries(frequency),
        analyzedAt: new Date().toISOString(),
      },
    },
  });
  emitProgress(projectId, "git_history", `Analyzed ${changes.length} file changes`);
} catch (err) {
  console.warn("[Pipeline] Git history analysis failed, continuing:", err);
}
```

**Step 2: Commit**
```bash
git add src/services/indexing/pipeline.ts
git commit -m "feat: add git history collection to indexing pipeline"
```

### Task 2.3: Wire git history into planner context

**Files:**
- Modify: `src/services/planning/planner.ts:261`

**Step 1: Replace `gitHistory: []` with actual data retrieval**

Before the context assembly block (around line 250), add:
```typescript
// Retrieve git history for prioritization
let gitHistory: Array<{ filePath: string; commitCount: number; totalChanges: number; lastChanged: string }> = [];
try {
  const { getGitHistoryForProject, aggregateChangeFrequency } = await import("@/services/indexing/git-history");
  const changes = await getGitHistoryForProject(projectId, 30);
  const frequency = aggregateChangeFrequency(changes);
  gitHistory = Array.from(frequency.values())
    .sort((a, b) => b.totalChanges - a.totalChanges)
    .slice(0, 50); // Top 50 most-changed files
} catch {
  // Git history unavailable, continue with empty array
}
```

Then update line 261:
```typescript
gitHistory, // Was: gitHistory: []
```

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: PASS

**Step 3: Commit**
```bash
git add src/services/planning/planner.ts
git commit -m "feat: wire real git history into planner context, replacing empty array"
```

---

## Agent 3: Execution Reliability Hardening

**Objective:** Fix the critical reliability issues in the execution pipeline: error handling, retry logic, distributed locking, and model routing.

### Task 3.1: Create distributed lock utility

**Files:**
- Create: `src/lib/redis/lock.ts`

**Step 1: Write failing test**

Create `src/__tests__/unit/redis-lock.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => ({
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  })),
}));

describe("distributed lock", () => {
  it("should acquire and release a lock", async () => {
    const { acquireLock, releaseLock } = await import("@/lib/redis/lock");
    const lock = await acquireLock("test-key", 30);
    expect(lock.acquired).toBe(true);
    await releaseLock(lock);
  });
});
```

**Step 2: Implement lock utility**

Create `src/lib/redis/lock.ts`:
```typescript
import { getRedis } from "@/lib/redis";

export interface Lock {
  key: string;
  acquired: boolean;
  refreshInterval?: ReturnType<typeof setInterval>;
}

export async function acquireLock(
  key: string,
  ttlSeconds: number = 300,
  retries: number = 3,
  retryDelayMs: number = 1000
): Promise<Lock> {
  const redis = getRedis();
  const lockKey = `orbit:lock:${key}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await redis.set(lockKey, "locked", "EX", ttlSeconds, "NX");
    if (result === "OK") {
      // Auto-refresh the lock TTL every half-TTL
      const refreshInterval = setInterval(async () => {
        try {
          await redis.expire(lockKey, ttlSeconds);
        } catch {
          // Lock refresh failed, will expire naturally
        }
      }, (ttlSeconds * 1000) / 2);

      return { key: lockKey, acquired: true, refreshInterval };
    }

    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
    }
  }

  return { key: lockKey, acquired: false };
}

export async function releaseLock(lock: Lock): Promise<void> {
  if (!lock.acquired) return;
  if (lock.refreshInterval) clearInterval(lock.refreshInterval);
  try {
    const redis = getRedis();
    await redis.del(lock.key);
  } catch {
    // Lock will expire via TTL
  }
}
```

**Step 3: Run test, commit**
```bash
pnpm test src/__tests__/unit/redis-lock.test.ts
git add src/lib/redis/lock.ts src/__tests__/unit/redis-lock.test.ts
git commit -m "feat: add distributed lock utility with TTL refresh and retry"
```

### Task 3.2: Add error handling to saveTestResult

**Files:**
- Modify: `src/services/execution/runner.ts:335-346`

**Step 1: Wrap saveTestResult with retry logic**

Replace the current `saveTestResult` function:
```typescript
async function saveTestResult(
  runId: string,
  testCaseId: string,
  verdict: TestVerdict,
  durationMs: number,
  steps: Array<Record<string, unknown>>,
  artifacts: Record<string, string>,
  healedSelectors: string[]
): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await prisma.testResult.create({
        data: {
          testRunId: runId,
          testCaseId,
          verdict,
          durationMs,
          steps: JSON.parse(JSON.stringify(steps)),
          artifacts: JSON.parse(JSON.stringify(artifacts)),
          healedSelectors: JSON.parse(JSON.stringify(healedSelectors)),
        },
      });
      return;
    } catch (err) {
      console.error(
        `[Runner] saveTestResult attempt ${attempt + 1}/${maxRetries} failed for run=${runId} test=${testCaseId}:`,
        err instanceof Error ? err.message : err
      );
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  // Final fallback: log the result so it's not completely lost
  console.error(`[Runner] CRITICAL: Failed to save test result after ${maxRetries} attempts`, {
    runId, testCaseId, verdict, durationMs,
  });
}
```

**Step 2: Commit**
```bash
git add src/services/execution/runner.ts
git commit -m "fix: add retry with backoff to saveTestResult to prevent data loss"
```

### Task 3.3: Add LLM retry with backoff to step-executor

**Files:**
- Modify: `src/services/execution/step-executor.ts:96-121`

**Step 1: Wrap the LLM call in getNextAction with retry**

Replace the `getNextAction` function body:
```typescript
async function getNextAction(
  context: ExecutorContext,
  billing: BillingInfo
): Promise<ExecutorAction> {
  const model = await getModelForTask("browser_execution");
  const prompt = buildExecutorPrompt(context);

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await createTrackedCompletion(
        {
          model,
          systemPrompt: prompt,
          messages: [{ role: "user", content: "Decide the next action." }],
          maxTokens: 500,
          temperature: 0,
        },
        {
          workspaceId: billing.workspaceId,
          projectId: billing.projectId,
          runId: billing.runId,
          agentPhase: "executor",
        }
      );
      const cleaned = stripNulls(parseLlmJson(result.content)) as Record<string, unknown>;
      return ExecutorActionSchema.parse(normalizeAction(cleaned));
    } catch (err) {
      const isRetryable = err instanceof Error && (
        err.message.includes("rate_limit") ||
        err.message.includes("timeout") ||
        err.message.includes("overloaded") ||
        err.message.includes("ECONNRESET") ||
        err.message.includes("529")
      );
      if (isRetryable && attempt < maxRetries - 1) {
        const delay = 2000 * Math.pow(2, attempt);
        console.warn(`[Executor] LLM call failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable: LLM retry loop exited without return or throw");
}
```

**Step 2: Commit**
```bash
git add src/services/execution/step-executor.ts
git commit -m "fix: add retry with exponential backoff to LLM calls in step executor"
```

### Task 3.4: Add browser connection retry

**Files:**
- Modify: `src/services/execution/browser-manager.ts:78-86`

**Step 1: Wrap browser connection with retry**

Replace the connection block:
```typescript
const maxConnRetries = 3;
for (let attempt = 0; attempt < maxConnRetries; attempt++) {
  try {
    if (usePlaywrightProtocol) {
      console.log(`[Browser] Connecting via Playwright protocol (attempt ${attempt + 1})...`);
      browser = await chromium.connect(wsEndpoint, { timeout: DEFAULT_TIMEOUT });
    } else {
      console.log(`[Browser] Connecting via CDP (attempt ${attempt + 1})...`);
      browser = await chromium.connectOverCDP(wsEndpoint, { timeout: DEFAULT_TIMEOUT });
    }
    break; // Connected successfully
  } catch (err) {
    console.error(`[Browser] Connection attempt ${attempt + 1}/${maxConnRetries} failed:`, err instanceof Error ? err.message : err);
    if (attempt < maxConnRetries - 1) {
      const delay = 2000 * Math.pow(2, attempt);
      console.log(`[Browser] Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    } else {
      throw err; // All retries exhausted
    }
  }
}
```

**Step 2: Add logging to closeBrowser**

Replace silent catches in `closeBrowser` (lines 107-129):
```typescript
export async function closeBrowser(instance: BrowserInstance): Promise<void> {
  try {
    await instance.page.close();
  } catch (err) {
    console.warn("[Browser] Page close failed:", err instanceof Error ? err.message : "unknown");
  }
  try {
    await instance.context.close();
  } catch (err) {
    console.warn("[Browser] Context close failed:", err instanceof Error ? err.message : "unknown");
  }
  try {
    if (instance.isRemote) {
      instance.browser.close();
    } else {
      await instance.browser.close();
    }
  } catch (err) {
    console.warn("[Browser] Browser close failed:", err instanceof Error ? err.message : "unknown");
  }
}
```

**Step 3: Commit**
```bash
git add src/services/execution/browser-manager.ts
git commit -m "fix: add connection retry with backoff and logging to browser manager"
```

### Task 3.5: Fix Stagehand model routing

**Files:**
- Modify: `src/services/execution/stagehand-adapter.ts:49`

**Step 1: Replace hardcoded model with model router**

Change line 49 from:
```typescript
model: (config.modelName ?? "gpt-4.1") as "gpt-4.1"
```
To:
```typescript
model: config.modelName ?? (await getModelForTask("browser_execution"))
```

Add import at top of file:
```typescript
import { getModelForTask } from "@/lib/ai/model-router";
```

**Step 2: Add environment validation**

At the beginning of `createStagehandSession`:
```typescript
if (!process.env.BROWSERBASE_API_KEY) {
  throw new Error("[Stagehand] BROWSERBASE_API_KEY environment variable is required when USE_STAGEHAND=true");
}
```

**Step 3: Commit**
```bash
git add src/services/execution/stagehand-adapter.ts
git commit -m "fix: use model router instead of hardcoded gpt-4.1, add env validation"
```

### Task 3.6: Update runner.ts to use distributed lock

**Files:**
- Modify: `src/services/execution/runner.ts:33-39`

**Step 1: Replace inline lock with utility**

Replace the existing inline Redis lock:
```typescript
import { acquireLock, releaseLock } from "@/lib/redis/lock";

// Inside executeRun, at the top:
const lock = await acquireLock(`run:${runId}`, 300); // 5 min TTL with auto-refresh
if (!lock.acquired) {
  console.warn(`[Runner] Run ${runId} is already being executed by another worker — skipping`);
  return;
}

try {
  // ... existing run execution logic ...
} finally {
  await releaseLock(lock);
}
```

**Step 2: Run all tests**

Run: `pnpm test`
Expected: PASS

**Step 3: Commit**
```bash
git add src/services/execution/runner.ts
git commit -m "fix: replace inline Redis lock with distributed lock utility with TTL refresh"
```

---

## Agent 4: System Invariant Layer

**Objective:** Create an invariant checking system that evaluates global assertions (no 500s, no console errors, auth enforcement, etc.) automatically on every page navigation during test execution.

### Task 4.1: Create invariant checker service

**Files:**
- Create: `src/services/execution/invariant-checker.ts`

**Step 1: Write failing test**

Create `src/__tests__/unit/invariant-checker.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("invariant-checker", () => {
  it("should detect console errors as invariant violations", async () => {
    const { checkConsoleInvariant } = await import("@/services/execution/invariant-checker");
    const result = checkConsoleInvariant([
      { type: "error", text: "Uncaught TypeError: Cannot read property 'map' of undefined" },
      { type: "log", text: "App loaded" },
    ]);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantType).toBe("no_console_errors");
  });

  it("should pass when no console errors exist", async () => {
    const { checkConsoleInvariant } = await import("@/services/execution/invariant-checker");
    const result = checkConsoleInvariant([
      { type: "log", text: "App loaded" },
      { type: "warn", text: "Deprecation warning" },
    ]);
    expect(result.passed).toBe(true);
  });

  it("should detect slow page loads", async () => {
    const { checkPageLoadInvariant } = await import("@/services/execution/invariant-checker");
    const result = checkPageLoadInvariant(6000, 5000);
    expect(result.passed).toBe(false);
    expect(result.violations[0].invariantType).toBe("page_load_time");
  });
});
```

**Step 2: Implement invariant checker**

Create `src/services/execution/invariant-checker.ts`:
```typescript
export interface InvariantViolation {
  invariantType: string;
  description: string;
  severity: "warning" | "error";
  expected?: string;
  actual?: string;
}

export interface InvariantResult {
  passed: boolean;
  violations: InvariantViolation[];
  checksRun: number;
}

export function checkConsoleInvariant(
  consoleMessages: Array<{ type: string; text: string }>
): InvariantResult {
  const errors = consoleMessages.filter((m) => m.type === "error");
  return {
    passed: errors.length === 0,
    checksRun: 1,
    violations: errors.map((e) => ({
      invariantType: "no_console_errors",
      description: `Console error detected: ${e.text.slice(0, 200)}`,
      severity: "error" as const,
      expected: "No console errors",
      actual: e.text.slice(0, 200),
    })),
  };
}

export function checkPageLoadInvariant(
  loadTimeMs: number,
  thresholdMs: number = 5000
): InvariantResult {
  const passed = loadTimeMs <= thresholdMs;
  return {
    passed,
    checksRun: 1,
    violations: passed
      ? []
      : [{
          invariantType: "page_load_time",
          description: `Page load took ${loadTimeMs}ms, exceeding ${thresholdMs}ms threshold`,
          severity: "warning",
          expected: `<= ${thresholdMs}ms`,
          actual: `${loadTimeMs}ms`,
        }],
  };
}

export function checkNetworkInvariant(
  responses: Array<{ url: string; status: number }>
): InvariantResult {
  const serverErrors = responses.filter((r) => r.status >= 500);
  return {
    passed: serverErrors.length === 0,
    checksRun: 1,
    violations: serverErrors.map((r) => ({
      invariantType: "no_server_errors",
      description: `Server error ${r.status} on ${r.url}`,
      severity: "error",
      expected: "No 5xx responses",
      actual: `${r.status} on ${r.url}`,
    })),
  };
}

export function checkBrokenImagesInvariant(
  images: Array<{ src: string; loaded: boolean }>
): InvariantResult {
  const broken = images.filter((i) => !i.loaded);
  return {
    passed: broken.length === 0,
    checksRun: 1,
    violations: broken.map((i) => ({
      invariantType: "no_broken_images",
      description: `Broken image: ${i.src}`,
      severity: "warning",
      expected: "All images load successfully",
      actual: `Image failed to load: ${i.src}`,
    })),
  };
}

export function checkAuthEnforcementInvariant(
  url: string,
  isApiRoute: boolean,
  responseStatus: number,
  hasAuthHeader: boolean
): InvariantResult {
  // API routes without auth should return 401, not 200
  if (isApiRoute && !hasAuthHeader && responseStatus === 200) {
    return {
      passed: false,
      checksRun: 1,
      violations: [{
        invariantType: "auth_enforcement",
        description: `API route ${url} returned 200 without authentication`,
        severity: "error",
        expected: "401 Unauthorized",
        actual: `${responseStatus}`,
      }],
    };
  }
  return { passed: true, checksRun: 1, violations: [] };
}

export async function runAllInvariants(pageState: {
  url: string;
  consoleMessages: Array<{ type: string; text: string }>;
  networkResponses: Array<{ url: string; status: number }>;
  loadTimeMs: number;
  images: Array<{ src: string; loaded: boolean }>;
}): Promise<InvariantResult> {
  const results = [
    checkConsoleInvariant(pageState.consoleMessages),
    checkPageLoadInvariant(pageState.loadTimeMs),
    checkNetworkInvariant(pageState.networkResponses),
    checkBrokenImagesInvariant(pageState.images),
  ];

  const allViolations = results.flatMap((r) => r.violations);
  return {
    passed: allViolations.length === 0,
    checksRun: results.reduce((sum, r) => sum + r.checksRun, 0),
    violations: allViolations,
  };
}
```

**Step 3: Run tests, commit**
```bash
pnpm test src/__tests__/unit/invariant-checker.test.ts
git add src/services/execution/invariant-checker.ts src/__tests__/unit/invariant-checker.test.ts
git commit -m "feat: add system invariant checker with 5 built-in invariants"
```

### Task 4.2: Wire invariants into test-case-executor

**Files:**
- Modify: `src/services/execution/test-case-executor.ts`

**Step 1: Import and call invariants after each page navigation**

Add import:
```typescript
import { runAllInvariants, type InvariantResult } from "./invariant-checker";
```

After each action that causes navigation (in the step execution loop), collect page state and run invariants:
```typescript
// After step execution, collect invariant data
const pageState = await collectPageState(page);
const invariantResult = await runAllInvariants(pageState);

// Attach invariant results to the step
step.invariantResult = invariantResult;
if (!invariantResult.passed) {
  console.warn(`[Invariant] ${invariantResult.violations.length} violation(s) on ${pageState.url}`);
}
```

Add page state collection helper:
```typescript
async function collectPageState(page: Page) {
  const consoleMessages: Array<{ type: string; text: string }> = [];
  // Console messages are collected via page.on("console") handler set up in browser-manager
  const images = await page.evaluate(() =>
    Array.from(document.images).map((img) => ({
      src: img.src,
      loaded: img.complete && img.naturalWidth > 0,
    }))
  );
  return {
    url: page.url(),
    consoleMessages,
    networkResponses: [], // Collected from network interception
    loadTimeMs: 0, // From performance.timing
    images,
  };
}
```

**Step 2: Commit**
```bash
git add src/services/execution/test-case-executor.ts
git commit -m "feat: wire invariant checks into test case execution lifecycle"
```

---

## Agent 5: Fault Injection Engine

**Objective:** Create a Playwright-based fault injection system using `page.route()` to simulate network failures, slow responses, and service unavailability.

### Task 5.1: Create fault injector service

**Files:**
- Create: `src/services/execution/fault-injector.ts`

**Step 1: Write failing test**

Create `src/__tests__/unit/fault-injector.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("fault-injector", () => {
  it("should generate fault injection routes for network errors", () => {
    const { buildFaultRoutes } = require("@/services/execution/fault-injector");

    const routes = buildFaultRoutes({
      networkErrors: { enabled: true, errorRate: 0.3, targetPattern: "**/api/**" },
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].pattern).toBe("**/api/**");
    expect(routes[0].type).toBe("network_error");
  });

  it("should generate slow response routes", () => {
    const { buildFaultRoutes } = require("@/services/execution/fault-injector");

    const routes = buildFaultRoutes({
      slowResponses: { enabled: true, delayMs: 3000, targetPattern: "**/api/**" },
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].type).toBe("slow_response");
  });
});
```

**Step 2: Implement fault injector**

Create `src/services/execution/fault-injector.ts`:
```typescript
import type { Page, Route } from "playwright";

export interface FaultConfig {
  networkErrors?: {
    enabled: boolean;
    errorRate: number; // 0-1
    targetPattern: string;
  };
  slowResponses?: {
    enabled: boolean;
    delayMs: number;
    targetPattern: string;
  };
  serverErrors?: {
    enabled: boolean;
    statusCode: number;
    errorRate: number;
    targetPattern: string;
  };
  missingAssets?: {
    enabled: boolean;
    targetPattern: string;
  };
}

export interface FaultRoute {
  pattern: string;
  type: "network_error" | "slow_response" | "server_error" | "missing_asset";
  config: Record<string, unknown>;
}

export function buildFaultRoutes(config: FaultConfig): FaultRoute[] {
  const routes: FaultRoute[] = [];

  if (config.networkErrors?.enabled) {
    routes.push({
      pattern: config.networkErrors.targetPattern,
      type: "network_error",
      config: { errorRate: config.networkErrors.errorRate },
    });
  }

  if (config.slowResponses?.enabled) {
    routes.push({
      pattern: config.slowResponses.targetPattern,
      type: "slow_response",
      config: { delayMs: config.slowResponses.delayMs },
    });
  }

  if (config.serverErrors?.enabled) {
    routes.push({
      pattern: config.serverErrors.targetPattern,
      type: "server_error",
      config: {
        statusCode: config.serverErrors.statusCode,
        errorRate: config.serverErrors.errorRate,
      },
    });
  }

  if (config.missingAssets?.enabled) {
    routes.push({
      pattern: config.missingAssets.targetPattern,
      type: "missing_asset",
      config: {},
    });
  }

  return routes;
}

export async function applyFaultInjection(
  page: Page,
  config: FaultConfig
): Promise<{ appliedRoutes: number; faultsInjected: number }> {
  const routes = buildFaultRoutes(config);
  let faultsInjected = 0;

  for (const faultRoute of routes) {
    await page.route(faultRoute.pattern, async (route: Route) => {
      switch (faultRoute.type) {
        case "network_error": {
          const rate = (faultRoute.config.errorRate as number) ?? 0.3;
          if (Math.random() < rate) {
            faultsInjected++;
            await route.abort("failed");
            return;
          }
          await route.continue();
          break;
        }
        case "slow_response": {
          const delay = (faultRoute.config.delayMs as number) ?? 3000;
          faultsInjected++;
          await new Promise((r) => setTimeout(r, delay));
          await route.continue();
          break;
        }
        case "server_error": {
          const rate = (faultRoute.config.errorRate as number) ?? 0.3;
          const status = (faultRoute.config.statusCode as number) ?? 500;
          if (Math.random() < rate) {
            faultsInjected++;
            await route.fulfill({
              status,
              body: JSON.stringify({ error: "Injected server error", _orbit_fault: true }),
              headers: { "content-type": "application/json" },
            });
            return;
          }
          await route.continue();
          break;
        }
        case "missing_asset": {
          faultsInjected++;
          await route.abort("blockedbyclient");
          break;
        }
        default:
          await route.continue();
      }
    });
  }

  return { appliedRoutes: routes.length, faultsInjected };
}
```

**Step 3: Run tests, commit**
```bash
pnpm test src/__tests__/unit/fault-injector.test.ts
git add src/services/execution/fault-injector.ts src/__tests__/unit/fault-injector.test.ts
git commit -m "feat: add fault injection engine with network errors, slow responses, server errors"
```

### Task 5.2: Wire fault injection into test execution

**Files:**
- Modify: `src/services/execution/test-case-executor.ts`

**Step 1: Add fault injection support to test case execution**

Import and apply fault injection when `mode === "resilience"`:
```typescript
import { applyFaultInjection, type FaultConfig } from "./fault-injector";

// In executeTestCase, after browser launch but before step execution:
if (options?.faultConfig) {
  const faultResult = await applyFaultInjection(page, options.faultConfig);
  console.log(`[FaultInjector] Applied ${faultResult.appliedRoutes} fault routes`);
}
```

**Step 2: Commit**
```bash
git add src/services/execution/test-case-executor.ts
git commit -m "feat: wire fault injection into test case executor for resilience mode"
```

---

## Agent 6: Coverage Feedback Loop

**Objective:** After test execution, identify uncovered routes/components and automatically generate additional tests to close coverage gaps. Run iteratively until target met or budget exhausted.

### Task 6.1: Create coverage feedback service

**Files:**
- Create: `src/services/planning/coverage-feedback.ts`

**Step 1: Write failing test**

Create `src/__tests__/unit/coverage-feedback.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("coverage-feedback", () => {
  it("should identify uncovered nodes from run results", () => {
    const { identifyUncoveredNodes } = require("@/services/planning/coverage-feedback");

    const allNodes = [
      { id: "1", name: "LoginPage", type: "route" },
      { id: "2", name: "DashboardPage", type: "route" },
      { id: "3", name: "SettingsPage", type: "route" },
    ];
    const coveredNodeIds = new Set(["1", "2"]);

    const uncovered = identifyUncoveredNodes(allNodes, coveredNodeIds);
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].name).toBe("SettingsPage");
  });

  it("should determine if another iteration is needed", () => {
    const { shouldRunAnotherIteration } = require("@/services/planning/coverage-feedback");

    expect(shouldRunAnotherIteration(60, 80, 1, 3, 1000, 5000)).toBe(true);
    expect(shouldRunAnotherIteration(85, 80, 1, 3, 1000, 5000)).toBe(false);
    expect(shouldRunAnotherIteration(60, 80, 3, 3, 1000, 5000)).toBe(false);
    expect(shouldRunAnotherIteration(60, 80, 1, 3, 5000, 5000)).toBe(false);
  });
});
```

**Step 2: Implement coverage feedback**

Create `src/services/planning/coverage-feedback.ts`:
```typescript
export interface CoverageNode {
  id: string;
  name: string;
  type: string;
}

export function identifyUncoveredNodes(
  allNodes: CoverageNode[],
  coveredNodeIds: Set<string>
): CoverageNode[] {
  return allNodes.filter((n) => !coveredNodeIds.has(n.id));
}

export function shouldRunAnotherIteration(
  currentCoverage: number,
  targetCoverage: number,
  currentIteration: number,
  maxIterations: number,
  tokensUsed: number,
  tokenBudget: number
): boolean {
  if (currentCoverage >= targetCoverage) return false;
  if (currentIteration >= maxIterations) return false;
  if (tokensUsed >= tokenBudget) return false;
  return true;
}

export async function generateAdditionalTests(
  projectId: string,
  uncoveredNodes: CoverageNode[],
  existingTestCount: number
): Promise<{ testCases: Array<{ name: string; journey: string; steps: string[] }>; tokensUsed: number }> {
  if (uncoveredNodes.length === 0) {
    return { testCases: [], tokensUsed: 0 };
  }

  // Use the existing planner to generate targeted tests for uncovered areas
  const { generatePlan } = await import("@/services/planning/planner");

  const focusAreas = uncoveredNodes.map((n) => n.name);
  const result = await generatePlan({
    projectId,
    mode: "targeted",
    focusAreas,
    maxTestCases: Math.min(uncoveredNodes.length * 2, 20),
  });

  return {
    testCases: result.testCases?.map((tc: { name: string; journey?: string; steps?: Array<{ description: string }> }) => ({
      name: tc.name,
      journey: tc.journey ?? "uncovered",
      steps: tc.steps?.map((s: { description: string }) => s.description) ?? [],
    })) ?? [],
    tokensUsed: result.tokensUsed ?? 0,
  };
}
```

**Step 3: Run tests, commit**
```bash
pnpm test src/__tests__/unit/coverage-feedback.test.ts
git add src/services/planning/coverage-feedback.ts src/__tests__/unit/coverage-feedback.test.ts
git commit -m "feat: add coverage feedback loop for iterative test generation"
```

### Task 6.2: Wire feedback into orchestrator pipeline

**Files:**
- Modify: `src/services/orchestrator/pipeline.ts`

**Step 1: Add coverage feedback phase after execution**

After the execution phase in the pipeline, add:
```typescript
// Phase 5: Coverage Feedback Loop (optional)
if (mode === "full" && !skipFeedback) {
  const { identifyUncoveredNodes, shouldRunAnotherIteration, generateAdditionalTests } =
    await import("@/services/planning/coverage-feedback");

  let iteration = 0;
  const maxIterations = 3;
  const coverageTarget = 80;

  while (shouldRunAnotherIteration(
    currentCoverage, coverageTarget, iteration, maxIterations,
    tokenBudget.used, tokenBudget.total
  )) {
    iteration++;
    emitProgress(run.id, "coverage_feedback", `Running coverage feedback iteration ${iteration}...`);

    const uncovered = identifyUncoveredNodes(systemMapNodes, coveredNodeIds);
    if (uncovered.length === 0) break;

    const { testCases, tokensUsed } = await generateAdditionalTests(
      input.projectId, uncovered, existingTestCount
    );
    tokenBudget.used += tokensUsed;

    if (testCases.length > 0) {
      // Execute the additional tests
      // ... run them through the execution phase ...
    }
  }
}
```

**Step 2: Commit**
```bash
git add src/services/orchestrator/pipeline.ts
git commit -m "feat: add coverage feedback loop to orchestrator pipeline"
```

---

## Agent 7: Interactive Test Replay

**Objective:** Build a timeline-based test replay UI that packages existing evidence capture (screenshots, DOM snapshots, network logs) into a scrubable debugger.

### Task 7.1: Create test replay component

**Files:**
- Create: `src/components/runs/test-replay.tsx`

**Step 1: Build the timeline component**

Create `src/components/runs/test-replay.tsx`:
```typescript
"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ReplayStep {
  index: number;
  action: string;
  description: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  timestamp: number;
  screenshotUrl?: string;
  domSnapshot?: string;
  networkRequests?: Array<{
    url: string;
    method: string;
    status: number;
    durationMs: number;
  }>;
  consoleMessages?: Array<{
    type: string;
    text: string;
  }>;
  invariantViolations?: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
}

interface TestReplayProps {
  steps: ReplayStep[];
  testName: string;
}

export function TestReplay({ steps, testName }: TestReplayProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [activeTab, setActiveTab] = useState<"screenshot" | "network" | "console" | "dom">("screenshot");

  const currentStep = steps[activeStep];
  const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);

  const handleStepClick = useCallback((index: number) => {
    setActiveStep(index);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{testName}</h3>
        <span className="text-xs text-muted-foreground">
          {steps.length} steps · {(totalDuration / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-10 bg-surface-2 rounded-lg overflow-hidden">
        <div className="flex h-full">
          {steps.map((step, i) => {
            const widthPercent = (step.durationMs / totalDuration) * 100;
            return (
              <button
                key={i}
                onClick={() => handleStepClick(i)}
                className={cn(
                  "h-full border-r border-surface-3 transition-colors relative group",
                  step.status === "passed" && "bg-emerald-500/20 hover:bg-emerald-500/30",
                  step.status === "failed" && "bg-red-500/20 hover:bg-red-500/30",
                  step.status === "skipped" && "bg-muted/20 hover:bg-muted/30",
                  i === activeStep && "ring-2 ring-orbit-accent ring-inset"
                )}
                style={{ width: `${Math.max(widthPercent, 2)}%` }}
                title={`Step ${i + 1}: ${step.action}`}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-mono text-foreground/60 truncate px-1">
                    {i + 1}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step detail */}
      {currentStep && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Visual */}
          <div className="space-y-3">
            {/* Tab selector */}
            <div className="flex gap-1 border-b border-white/[0.06] pb-2">
              {(["screenshot", "network", "console", "dom"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md transition-colors",
                    activeTab === tab
                      ? "bg-orbit-accent/10 text-orbit-accent"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === "screenshot" && currentStep.screenshotUrl && (
              <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                <img
                  src={currentStep.screenshotUrl}
                  alt={`Step ${activeStep + 1} screenshot`}
                  className="w-full h-auto"
                />
              </div>
            )}

            {activeTab === "network" && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {(currentStep.networkRequests ?? []).map((req, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded bg-surface-2"
                  >
                    <span className={cn(
                      "font-bold w-8",
                      req.status >= 500 ? "text-red-400" : req.status >= 400 ? "text-amber-400" : "text-emerald-400"
                    )}>
                      {req.status}
                    </span>
                    <span className="text-muted-foreground w-10">{req.method}</span>
                    <span className="text-foreground truncate flex-1">{req.url}</span>
                    <span className="text-muted-foreground">{req.durationMs}ms</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "console" && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {(currentStep.consoleMessages ?? []).map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "text-xs font-mono px-2 py-1.5 rounded",
                      msg.type === "error" ? "bg-red-500/10 text-red-300" :
                      msg.type === "warn" ? "bg-amber-500/10 text-amber-300" :
                      "bg-surface-2 text-muted-foreground"
                    )}
                  >
                    [{msg.type}] {msg.text}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Step info */}
          <div className="space-y-3">
            <div className="rounded-lg border border-white/[0.06] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Step {activeStep + 1} of {steps.length}
                </span>
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  currentStep.status === "passed" && "bg-emerald-500/10 text-emerald-400",
                  currentStep.status === "failed" && "bg-red-500/10 text-red-400"
                )}>
                  {currentStep.status}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground">{currentStep.action}</p>
              <p className="text-xs text-muted-foreground">{currentStep.description}</p>
              <p className="text-xs text-muted-foreground font-mono">{currentStep.durationMs}ms</p>
            </div>

            {/* Invariant violations */}
            {currentStep.invariantViolations && currentStep.invariantViolations.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                <h4 className="text-xs font-medium text-amber-400">Invariant Violations</h4>
                {currentStep.invariantViolations.map((v, i) => (
                  <div key={i} className="text-xs text-amber-300/80">
                    <span className="font-mono">[{v.type}]</span> {v.description}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
          disabled={activeStep === 0}
          className="px-3 py-1.5 text-xs rounded-md bg-surface-2 text-foreground disabled:opacity-30 hover:bg-surface-3 transition-colors"
        >
          Previous
        </button>
        <span className="text-xs text-muted-foreground font-mono">
          {activeStep + 1} / {steps.length}
        </span>
        <button
          onClick={() => setActiveStep(Math.min(steps.length - 1, activeStep + 1))}
          disabled={activeStep === steps.length - 1}
          className="px-3 py-1.5 text-xs rounded-md bg-surface-2 text-foreground disabled:opacity-30 hover:bg-surface-3 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/components/runs/test-replay.tsx
git commit -m "feat: add interactive test replay timeline component"
```

### Task 7.2: Wire replay into run detail page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/runs/[runId]/page.tsx` or its client component

**Step 1: Import and render TestReplay in the run detail view**

Find the run detail client component and add TestReplay below the existing step log:
```typescript
import { TestReplay } from "@/components/runs/test-replay";

// In the test result expansion area, add:
{selectedTest && (
  <TestReplay
    testName={selectedTest.name}
    steps={selectedTest.steps.map((step: Record<string, unknown>, i: number) => ({
      index: i,
      action: step.action as string,
      description: step.expected as string ?? "",
      status: step.status as "passed" | "failed" | "skipped",
      durationMs: step.durationMs as number ?? 0,
      timestamp: 0,
      screenshotUrl: step.screenshotUrl as string,
      networkRequests: step.networkRequests as Array<{ url: string; method: string; status: number; durationMs: number }>,
      consoleMessages: step.consoleMessages as Array<{ type: string; text: string }>,
    }))}
  />
)}
```

**Step 2: Run build to verify no type errors**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**
```bash
git add src/app/\(dashboard\)/dashboard/runs/\[runId\]/
git commit -m "feat: wire interactive test replay into run detail view"
```

---

## Agent 8: Dashboard UX Polish

**Objective:** Improve spacing, ratios, page flow, and fix small UX issues across the dashboard.

### Task 8.1: Fix sidebar spacing and ratio

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Step 1: Fix the collapsed-to-expanded ratio jump**

Change sidebar collapsed width from 52px to 56px and expanded from 208px to 240px for a smoother 1:4.3 ratio:
```typescript
// Update width classes
// Collapsed: w-14 (56px) instead of w-[52px]
// Expanded: w-60 (240px) instead of w-52 (208px)
```

Fix menu item spacing — replace `space-y-0.5` (2px) with `space-y-1` (4px) for better visual separation:
```typescript
// In the nav container:
className="py-3 px-2.5 space-y-1"
```

Fix icon-to-label gap — use consistent `gap-2.5` instead of `gap-3`:
```typescript
// In each menu item:
className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px]"
```

**Step 2: Commit**
```bash
git add src/components/layout/sidebar.tsx
git commit -m "fix: improve sidebar spacing ratios and menu item gaps"
```

### Task 8.2: Improve main content area spacing

**Files:**
- Modify: `src/app/(dashboard)/dashboard/layout.tsx` or main layout wrapper

**Step 1: Add responsive padding and max-width constraint**

Update main content area:
```typescript
// Replace flat p-6 with responsive padding and max-width
<main className="flex-1 overflow-y-auto">
  <div className="px-6 py-5 lg:px-8 xl:px-10 max-w-[1440px] mx-auto">
    {children}
  </div>
</main>
```

**Step 2: Add consistent section spacing to dashboard page**

In the dashboard client component, ensure all sections use consistent gap:
```typescript
// Use gap-6 between major sections, gap-4 between related items
<div className="space-y-6">
  {/* Health strip */}
  <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {/* stat cards */}
  </section>

  {/* Map + Runs */}
  <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
    <div className="lg:col-span-3">{/* System Map */}</div>
    <div className="lg:col-span-2">{/* Recent Runs */}</div>
  </section>
</div>
```

**Step 3: Commit**
```bash
git add src/app/\(dashboard\)/dashboard/
git commit -m "fix: improve content area spacing with responsive padding and max-width"
```

### Task 8.3: Fix page-to-page transitions and flow

**Files:**
- Modify: Various dashboard page components

**Step 1: Add consistent page headers across all dashboard pages**

Create a shared page header pattern:
```typescript
// Each dashboard page should follow this pattern:
<div className="space-y-6">
  {/* Page header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
    </div>
    <div className="flex items-center gap-2">
      {/* Action buttons */}
    </div>
  </div>

  {/* Page content */}
  {children}
</div>
```

**Step 2: Ensure breadcrumb/back navigation exists on detail pages**

On pages like `/runs/[runId]` and `/projects/[projectId]`, ensure there's a back link:
```typescript
<button
  onClick={() => router.back()}
  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
>
  <ChevronLeft className="h-3.5 w-3.5" />
  Back
</button>
```

**Step 3: Fix stat card sizing consistency**

Ensure all stat cards in the health strip use identical height:
```typescript
// Each stat card:
<div className="rounded-lg border border-white/[0.06] bg-surface-2 p-4 min-h-[88px] flex flex-col justify-between">
  {/* ... */}
</div>
```

**Step 4: Commit**
```bash
git add src/components/ src/app/
git commit -m "fix: standardize page headers, navigation flow, and stat card sizing"
```

### Task 8.4: Polish small UX details

**Files:**
- Various component files

**Step 1: Fix loading states**

Ensure all data-fetching pages have proper loading skeletons, not just spinners:
```typescript
// Skeleton pattern for list items:
<div className="animate-pulse space-y-3">
  {Array.from({ length: 5 }).map((_, i) => (
    <div key={i} className="h-14 rounded-lg bg-surface-2" />
  ))}
</div>
```

**Step 2: Fix empty states**

Ensure all list views have meaningful empty states:
```typescript
// Empty state pattern:
<div className="flex flex-col items-center justify-center py-16 text-center">
  <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" />
  <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
  <p className="text-xs text-muted-foreground max-w-[280px]">{description}</p>
  {action && (
    <Button variant="outline" size="sm" className="mt-4">{action}</Button>
  )}
</div>
```

**Step 3: Fix hover/focus states**

Audit interactive elements for consistent hover feedback:
- All clickable rows: `hover:bg-surface-2 transition-colors`
- All buttons: proper `disabled:opacity-50` states
- All links: `hover:text-foreground` transition

**Step 4: Commit**
```bash
git add src/components/
git commit -m "fix: polish loading skeletons, empty states, and hover transitions"
```

---

## Integration Verification

After all 8 agents complete, run the following verification sequence:

### Step 1: Type check
```bash
pnpm exec tsc --noEmit
```

### Step 2: Lint
```bash
pnpm lint
```

### Step 3: Full test suite
```bash
pnpm test
```

### Step 4: Build
```bash
pnpm build
```

### Step 5: Verify no file conflicts
```bash
git diff --stat
git status
```

### Step 6: Create single integration commit
```bash
git add -A
git commit -m "feat: Orbit 1000x upgrade — semantic retrieval, git history, execution reliability, invariant testing, fault injection, coverage feedback, test replay, UX polish"
```

### Step 7: Push
```bash
git push origin main
```
