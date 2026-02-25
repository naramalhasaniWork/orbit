import type { TestCase } from "@/agents/schemas/test-plan";

/**
 * Resolves execution order for test cases based on prerequisite dependencies.
 * Returns groups of test cases: each group can run in parallel, but groups
 * must execute sequentially (group 0 first, then group 1, etc.).
 */
export function resolveExecutionOrder(testCases: TestCase[]): TestCase[][] {
  if (testCases.length === 0) return [];

  const byId = new Map<string, TestCase>();
  for (const tc of testCases) byId.set(tc.id, tc);

  // Build adjacency: prereq -> dependent (forward edges for in-degree counting)
  const dependents = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const tc of testCases) {
    if (!inDegree.has(tc.id)) inDegree.set(tc.id, 0);

    const prereqs = tc.prerequisites ?? [];
    for (const prereqId of prereqs) {
      // Only count prerequisites that are in the current test case set
      if (!byId.has(prereqId)) continue;

      if (!dependents.has(prereqId)) dependents.set(prereqId, []);
      dependents.get(prereqId)!.push(tc.id);
      inDegree.set(tc.id, (inDegree.get(tc.id) ?? 0) + 1);
    }
  }

  // Detect and break cycles before topological sort
  breakCycles(testCases, byId, inDegree, dependents);

  // Kahn's algorithm — group by level for parallel execution
  const groups: TestCase[][] = [];
  const remaining = new Set(testCases.map((tc) => tc.id));

  while (remaining.size > 0) {
    // Collect all nodes with in-degree 0
    const ready: string[] = [];
    for (const id of Array.from(remaining)) {
      if ((inDegree.get(id) ?? 0) === 0) {
        ready.push(id);
      }
    }

    // If no nodes are ready but remaining exists, we have an unresolved cycle
    // (should not happen after breakCycles, but guard defensively)
    if (ready.length === 0) {
      console.warn(
        `[FlowExecutor] Unresolved cycle detected among ${remaining.size} test cases — adding them as final group`
      );
      const fallback: TestCase[] = [];
      for (const id of Array.from(remaining)) {
        const tc = byId.get(id);
        if (tc) fallback.push(tc);
      }
      groups.push(fallback);
      break;
    }

    const group: TestCase[] = [];
    for (const id of ready) {
      remaining.delete(id);
      const tc = byId.get(id);
      if (tc) group.push(tc);

      // Decrease in-degree for dependents
      const deps = dependents.get(id) ?? [];
      for (const depId of deps) {
        if (remaining.has(depId)) {
          inDegree.set(depId, (inDegree.get(depId) ?? 0) - 1);
        }
      }
    }

    if (group.length > 0) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Detects cycles using DFS and breaks them by removing the back-edge
 * with the lowest impact (the prerequisite link on the node with the
 * most other prerequisites, to preserve as much ordering as possible).
 */
function breakCycles(
  testCases: TestCase[],
  byId: Map<string, TestCase>,
  inDegree: Map<string, number>,
  dependents: Map<string, string[]>
): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const tc of testCases) color.set(tc.id, WHITE);

  // Track parent in DFS tree for cycle reconstruction
  const parent = new Map<string, string>();

  function dfs(nodeId: string): string | null {
    color.set(nodeId, GRAY);

    const deps = dependents.get(nodeId) ?? [];
    for (const depId of deps) {
      if (!byId.has(depId)) continue;

      if (color.get(depId) === GRAY) {
        // Found a cycle: back-edge from nodeId -> depId
        return depId;
      }

      if (color.get(depId) === WHITE) {
        parent.set(depId, nodeId);
        const cycleNode = dfs(depId);
        if (cycleNode !== null) return cycleNode;
      }
    }

    color.set(nodeId, BLACK);
    return null;
  }

  // Run DFS from each unvisited node
  for (const tc of testCases) {
    if (color.get(tc.id) === WHITE) {
      const cycleNode = dfs(tc.id);
      if (cycleNode !== null) {
        // Break the cycle by removing the prerequisite link
        // Find the dependent that creates the back-edge and remove it
        const depTc = byId.get(cycleNode);
        if (depTc && depTc.prerequisites) {
          console.warn(
            `[FlowExecutor] Circular dependency detected involving test case "${depTc.name}" (${depTc.id}) — breaking cycle`
          );

          // Remove the first prerequisite that is part of the cycle
          const cyclePrereqs = depTc.prerequisites.filter((pid) => byId.has(pid));
          if (cyclePrereqs.length > 0) {
            const removeId = cyclePrereqs[cyclePrereqs.length - 1];
            depTc.prerequisites = depTc.prerequisites.filter((pid) => pid !== removeId);
            inDegree.set(cycleNode, Math.max(0, (inDegree.get(cycleNode) ?? 0) - 1));

            // Remove from dependents list
            const depList = dependents.get(removeId);
            if (depList) {
              const idx = depList.indexOf(cycleNode);
              if (idx >= 0) depList.splice(idx, 1);
            }
          }
        }

        // Reset colors and re-run to catch additional cycles
        for (const tc2 of testCases) color.set(tc2.id, WHITE);
        parent.clear();
        // Recursive call to handle remaining cycles
        breakCycles(testCases, byId, inDegree, dependents);
        return;
      }
    }
  }
}
