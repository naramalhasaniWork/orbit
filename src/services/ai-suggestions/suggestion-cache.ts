import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { getPlanningQueue } from "@/lib/queue/queues";
import { withQueueTimeout } from "@/lib/queue/availability";
import { getFlag } from "@/lib/system-config";
import { generateLLMSuggestionsForProject } from "./suggestion-engine";
import type { Suggestion } from "./suggestion-types";

/**
 * LLM suggestions are cached per project and keyed by what they were derived
 * from (active plan version + last index time). Viewing the Test Plans page
 * never waits on an LLM; a background job fills the cache.
 */

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Dedupe window for refresh requests while a generation is in flight. */
const PENDING_TTL_SECONDS = 5 * 60;

const cacheKey = (projectId: string) => `suggestions:llm:${projectId}`;
const pendingKey = (projectId: string) => `suggestions:llm:${projectId}:pending`;

interface CachedSuggestions {
  fingerprint: string;
  suggestions: Suggestion[];
  generatedAt: string;
}

export type LLMSuggestionStatus = "ready" | "pending" | "disabled" | "unavailable";

export interface LLMSuggestionsResult {
  status: LLMSuggestionStatus;
  suggestions: Suggestion[];
  generatedAt: string | null;
  /** True when the cached result predates the current plan or index. */
  stale: boolean;
}

export async function suggestionFingerprint(projectId: string): Promise<string> {
  const [plan, project] = await Promise.all([
    prisma.testPlan.findFirst({
      where: { projectId, isActive: true },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { lastIndexedAt: true } }),
  ]);
  return `plan:${plan?.version ?? 0}|index:${project?.lastIndexedAt?.toISOString() ?? "never"}`;
}

/**
 * Cached LLM suggestions for the project. A miss or a stale entry queues a
 * background refresh; the caller gets whatever is cached right now.
 */
export async function getLLMSuggestions(projectId: string): Promise<LLMSuggestionsResult> {
  if (!(await getFlag("ai_suggestions"))) {
    return { status: "disabled", suggestions: [], generatedAt: null, stale: false };
  }

  try {
    const [fingerprint, raw] = await Promise.all([
      suggestionFingerprint(projectId),
      withQueueTimeout(getRedis().get(cacheKey(projectId))),
    ]);
    const cached = raw ? (JSON.parse(raw) as CachedSuggestions) : null;
    const stale = !cached || cached.fingerprint !== fingerprint;
    const queued = stale ? await requestSuggestionRefresh(projectId) : false;

    return {
      status: cached ? "ready" : queued || (await isRefreshPending(projectId)) ? "pending" : "unavailable",
      suggestions: cached?.suggestions ?? [],
      generatedAt: cached?.generatedAt ?? null,
      stale: !!cached && stale,
    };
  } catch (err) {
    console.error("[suggestions] Cache unavailable:", err instanceof Error ? err.message : err);
    return { status: "unavailable", suggestions: [], generatedAt: null, stale: false };
  }
}

async function isRefreshPending(projectId: string): Promise<boolean> {
  return (await withQueueTimeout(getRedis().exists(pendingKey(projectId)))) === 1;
}

/**
 * Queues one background generation per project at a time. Returns true when
 * a job was queued by this call.
 */
export async function requestSuggestionRefresh(projectId: string): Promise<boolean> {
  const claimed = await withQueueTimeout(
    getRedis().set(pendingKey(projectId), "1", "EX", PENDING_TTL_SECONDS, "NX")
  );
  if (claimed !== "OK") return false;
  try {
    await withQueueTimeout(getPlanningQueue().add("suggestions", { kind: "suggestions", projectId }));
    return true;
  } catch (err) {
    await getRedis().del(pendingKey(projectId)).catch(() => undefined);
    throw err;
  }
}

/** Worker side: generate and store. */
export async function refreshLLMSuggestions(projectId: string): Promise<void> {
  try {
    const fingerprint = await suggestionFingerprint(projectId);
    const suggestions = await generateLLMSuggestionsForProject(projectId);
    const entry: CachedSuggestions = { fingerprint, suggestions, generatedAt: new Date().toISOString() };
    await getRedis().set(cacheKey(projectId), JSON.stringify(entry), "EX", CACHE_TTL_SECONDS);
  } finally {
    await getRedis().del(pendingKey(projectId));
  }
}
