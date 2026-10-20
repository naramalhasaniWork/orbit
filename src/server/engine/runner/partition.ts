import type { TestCaseForExecution } from "@/services/execution/test-case-executor";

const VISUAL_JOURNEY = "visual_identity";

/**
 * Split a run's cases into groups that may run concurrently. With one worker,
 * everything stays in the loaded (priority) order. With more, cases are
 * grouped by journey (a journey runs in order on one worker, since its cases
 * may share state), and visual cases go last so they can reuse a session
 * from the login tests.
 */
export function partitionCases(
  cases: TestCaseForExecution[], concurrency: number
): TestCaseForExecution[][] {
  if (cases.length === 0) return [];
  if (concurrency <= 1) return [cases];

  const groups = new Map<string, TestCaseForExecution[]>();
  for (const testCase of cases) {
    const journey = testCase.journey ?? "default";
    const group = groups.get(journey) ?? [];
    group.push(testCase);
    groups.set(journey, group);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => Number(a === VISUAL_JOURNEY) - Number(b === VISUAL_JOURNEY))
    .map(([, group]) => group);
}
