import { describe, it, expect } from "vitest";
import { generateVisualRegressionCases } from "@/services/planning/visual-regression-cases";

const route = (id: string, path: string, filePath: string) => ({
  id: `${id}-0000000000`,
  type: "route",
  name: path,
  filePath,
  metadata: { path },
});

describe("generateVisualRegressionCases", () => {
  const nodes = [
    route("a", "/dashboard", "src/app/(dashboard)/dashboard/page.tsx"),
    route("b", "/dashboard/runs", "src/app/(dashboard)/dashboard/runs/page.tsx"),
    route("c", "/dashboard/runs/[id]", "src/app/(dashboard)/dashboard/runs/[id]/page.tsx"),
    route("d", "/pricing", "src/app/(marketing)/pricing/page.tsx"),
    route("e", "/", "src/app/(marketing)/page.tsx"),
    route("f", "/settings/billing", "pages/settings/billing.tsx"),
    route("g", "/settings", "pages/settings/index.tsx"),
    { id: "h-0000000000", type: "component", name: "Button", filePath: "src/ui/button.tsx", metadata: {} },
  ];

  it("emits one case per route group, using the shallowest route", () => {
    const names = generateVisualRegressionCases({ nodes }, []).map((c) => c.name).sort();
    expect(names).toEqual([
      "Visual regression: /",
      "Visual regression: /dashboard",
      "Visual regression: /settings",
    ]);
  });

  it("skips groups whose representative case already exists", () => {
    const cases = generateVisualRegressionCases({ nodes }, ["Visual regression: /dashboard"]);
    expect(cases).toHaveLength(2);
  });
});
