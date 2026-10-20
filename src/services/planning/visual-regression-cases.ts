import type { TestCase } from "@/agents/schemas/test-plan";

/**
 * Generate visual_regression test cases for every route node in the system map.
 * Marks the first run as baseline capture; subsequent runs compare against it.
 */
export function generateVisualRegressionCases(
  systemMap: { nodes: Array<{ id: string; type: string; name: string; filePath: string; metadata: Record<string, unknown> }> },
  existingTestNames: string[]
): TestCase[] {
  const routeNodes = systemMap.nodes.filter((n) => n.type === "route");
  const cases: TestCase[] = [];

  for (const node of routeNodes) {
    const testName = `Visual regression: ${node.name}`;

    // Skip if this visual test already exists
    if (existingTestNames.includes(testName)) continue;

    const routePath = (node.metadata?.path as string) ?? node.name;

    cases.push({
      id: `vr-${node.id.slice(0, 8)}`,
      name: testName,
      type: "visual_regression",
      journey: "visual_identity",
      priorityScore: 40,
      criticality: 30,
      risk: 50,
      coverageGap: 60,
      steps: [
        {
          action: `Navigate to ${routePath}`,
          expected: "Page loads and renders completely",
        },
        {
          action: "Capture full-page screenshot",
          expected: "Screenshot captured and stored as artifact",
        },
        {
          action: "Compare against baseline screenshot",
          expected: "Visual diff within acceptable threshold or baseline captured",
        },
      ],
      rationale: `Monitors visual consistency of ${node.name} route. Detects unintended layout changes, broken styles, and brand violations.`,
      edgeCases: [
        "Different viewport sizes",
        "Dynamic content loading states",
        "Dark/light mode variants",
      ],
    });
  }

  return cases;
}
