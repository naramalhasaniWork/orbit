import type { TestCase } from "@/agents/schemas/test-plan";

interface RouteNode {
  id: string;
  type: string;
  name: string;
  filePath: string;
  metadata: Record<string, unknown>;
}

const routePathOf = (node: RouteNode) => (node.metadata?.path as string) ?? node.name;

/**
 * The layout a route renders under: its Next.js route group when it has one
 * (`app/(marketing)/...`), otherwise its first path segment.
 */
export function routeGroupKey(node: RouteNode): string {
  const group = node.filePath?.match(/\(([^)/]+)\)/);
  if (group) return `(${group[1]})`;
  const first = routePathOf(node).split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

/**
 * One visual_regression case per top-level layout / route group, using the
 * shallowest route as its representative. Screenshotting every route mostly
 * re-tests the same shell and buried real cases under boilerplate.
 * The first run captures the baseline; later runs compare against it.
 */
export function generateVisualRegressionCases(
  systemMap: { nodes: RouteNode[] },
  existingTestNames: string[]
): TestCase[] {
  const representatives = new Map<string, RouteNode>();
  for (const node of systemMap.nodes) {
    if (node.type !== "route" || routePathOf(node).includes("/api/")) continue;
    const key = routeGroupKey(node);
    const current = representatives.get(key);
    if (!current || routePathOf(node).length < routePathOf(current).length) {
      representatives.set(key, node);
    }
  }

  const cases: TestCase[] = [];
  for (const node of Array.from(representatives.values())) {
    const testName = `Visual regression: ${node.name}`;

    // Skip if this visual test already exists
    if (existingTestNames.includes(testName)) continue;

    const routePath = routePathOf(node);

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
