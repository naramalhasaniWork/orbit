import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// ============================================================
// Failure Pattern Categories
// ============================================================

const PATTERN_CATEGORIES: Record<string, { match: (explanation: string) => boolean }> = {
  timeout: {
    match: (e) =>
      /timeout|timed?\s*out|exceeded.*time|navigation.*timeout/i.test(e),
  },
  selector_not_found: {
    match: (e) =>
      /selector.*not\s*found|element.*not\s*found|could\s*not\s*find|no\s*such\s*element|locator/i.test(e),
  },
  assertion_mismatch: {
    match: (e) =>
      /expected.*but\s*(got|received|found)|assertion.*fail|mismatch|does\s*not\s*match/i.test(e),
  },
  network_error: {
    match: (e) =>
      /network.*error|fetch.*fail|ECONNREFUSED|ECONNRESET|ETIMEDOUT|503|502|500.*error/i.test(e),
  },
  auth_failure: {
    match: (e) =>
      /unauthorized|403|401|forbidden|auth.*fail|login.*fail|session.*expired|token.*invalid/i.test(e),
  },
  render_error: {
    match: (e) =>
      /render.*error|hydration|component.*crash|unhandled.*error|chunk.*load/i.test(e),
  },
  data_inconsistency: {
    match: (e) =>
      /null|undefined.*not.*expected|missing.*field|data.*not\s*found|empty.*response/i.test(e),
  },
  navigation_failure: {
    match: (e) =>
      /navigation.*fail|redirect.*loop|page.*not\s*found|404|route.*not.*match/i.test(e),
  },
};

function categorizeFailure(explanation: string): string {
  for (const [category, { match }] of Object.entries(PATTERN_CATEGORIES)) {
    if (match(explanation)) return category;
  }
  return "unknown";
}

function extractPattern(explanation: string): string {
  const normalized = explanation
    .replace(/['"]/g, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b\d{4,}\b/g, "<id>")
    .replace(/https?:\/\/[^\s]+/g, "<url>")
    .replace(/`[^`]+`/g, "<code>")
    .trim();

  const firstSentence = normalized.split(/\.\s/)[0] ?? normalized;
  return firstSentence.slice(0, 200);
}

// ============================================================
// Record & Detect Patterns
// ============================================================

export async function recordFailurePattern(
  projectId: string,
  testCaseId: string,
  failureExplanation: string
): Promise<{ pattern: string; category: string; occurrences: number }> {
  const pattern = extractPattern(failureExplanation);
  const category = categorizeFailure(failureExplanation);

  const existing = await prisma.failurePattern.findFirst({
    where: { projectId, pattern },
  });

  if (existing) {
    const testCaseIds = Array.isArray(existing.testCaseIds) ? existing.testCaseIds as string[] : [];
    if (!testCaseIds.includes(testCaseId)) {
      testCaseIds.push(testCaseId);
    }

    await prisma.failurePattern.update({
      where: { id: existing.id },
      data: {
        occurrences: existing.occurrences + 1,
        testCaseIds: testCaseIds as Prisma.InputJsonValue,
        lastSeenAt: new Date(),
      },
    });

    return { pattern, category, occurrences: existing.occurrences + 1 };
  }

  await prisma.failurePattern.create({
    data: {
      projectId,
      pattern,
      category,
      occurrences: 1,
      testCaseIds: [testCaseId] as Prisma.InputJsonValue,
    },
  });

  return { pattern, category, occurrences: 1 };
}

// ============================================================
// Query Patterns
// ============================================================

export interface FailurePatternSummary {
  id: string;
  pattern: string;
  category: string;
  occurrences: number;
  testCaseIds: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export async function getFailurePatterns(
  projectId: string,
  limit = 20
): Promise<FailurePatternSummary[]> {
  const patterns = await prisma.failurePattern.findMany({
    where: { projectId },
    orderBy: [{ occurrences: "desc" }, { lastSeenAt: "desc" }],
    take: limit,
  });

  return patterns.map((p) => ({
    id: p.id,
    pattern: p.pattern,
    category: p.category,
    occurrences: p.occurrences,
    testCaseIds: Array.isArray(p.testCaseIds) ? p.testCaseIds as string[] : [],
    firstSeenAt: p.firstSeenAt.toISOString(),
    lastSeenAt: p.lastSeenAt.toISOString(),
  }));
}

export const PATTERN_CATEGORY_LABELS: Record<string, string> = {
  timeout: "Timeout",
  selector_not_found: "Selector Not Found",
  assertion_mismatch: "Assertion Mismatch",
  network_error: "Network Error",
  auth_failure: "Auth Failure",
  render_error: "Render Error",
  data_inconsistency: "Data Inconsistency",
  navigation_failure: "Navigation Failure",
  unknown: "Unknown",
};
