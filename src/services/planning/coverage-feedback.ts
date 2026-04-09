export interface CoverageNode {
  id: string;
  name: string;
  type: string;
  filePath?: string;
}

export interface FeedbackResult {
  uncoveredNodes: CoverageNode[];
  currentCoverage: number;
  targetCoverage: number;
  shouldIterate: boolean;
  reason: string;
}

/**
 * Identify which nodes weren't covered by any test result.
 */
export function identifyUncoveredNodes(
  allNodes: CoverageNode[],
  coveredNodeIds: Set<string>
): CoverageNode[] {
  return allNodes.filter((n) => !coveredNodeIds.has(n.id));
}

/**
 * Determine if another test generation iteration is warranted.
 */
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

/**
 * Calculate coverage percentage from node counts.
 */
export function calculateCoverage(
  totalNodes: number,
  coveredNodes: number
): number {
  if (totalNodes === 0) return 0;
  return (coveredNodes / totalNodes) * 100;
}

/**
 * Build a feedback summary for the planner to consume.
 * Returns markdown-formatted string listing uncovered nodes grouped by type.
 */
export function buildFeedbackSummary(
  uncoveredNodes: CoverageNode[],
  currentCoverage: number,
  iteration: number
): string {
  if (uncoveredNodes.length === 0) {
    return `## Coverage Feedback (Iteration ${iteration})\n\nAll nodes are covered. Current coverage: ${currentCoverage.toFixed(1)}%.`;
  }

  const grouped = new Map<string, CoverageNode[]>();
  for (const node of uncoveredNodes) {
    const group = grouped.get(node.type) ?? [];
    group.push(node);
    grouped.set(node.type, group);
  }

  const sections: string[] = [];
  sections.push(`## Coverage Feedback (Iteration ${iteration})`);
  sections.push("");
  sections.push(
    `Current coverage: ${currentCoverage.toFixed(1)}%. ${uncoveredNodes.length} node(s) remain uncovered.`
  );
  sections.push("");

  for (const [type, nodes] of grouped) {
    sections.push(`### Uncovered ${type}s`);
    for (const node of nodes) {
      const pathNote = node.filePath ? ` (${node.filePath})` : "";
      sections.push(`- ${node.name}${pathNote}`);
    }
    sections.push("");
  }

  return sections.join("\n").trim();
}
