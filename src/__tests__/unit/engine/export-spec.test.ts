import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderPlaywrightSpec } from "@/server/engine/replay/export-spec";
import { checkoutActions, checkoutSteps } from "../../fixtures/replay/checkout-script";

const GOLDEN = join(__dirname, "../../fixtures/replay/checkout.spec.ts.golden");

describe("renderPlaywrightSpec", () => {
  it("matches the golden Playwright spec", () => {
    const spec = renderPlaywrightSpec({
      testCaseName: "Checkout with a coupon",
      steps: checkoutSteps,
      version: 3,
      startUrl: "https://staging.example.com/",
      actions: checkoutActions,
    });
    expect(spec).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("reads credentials from the environment and never inlines placeholders", () => {
    const spec = readFileSync(GOLDEN, "utf8");
    expect(spec).toContain("process.env.COUPON_CODE");
    expect(spec).not.toContain("{{credential:");
  });
});
