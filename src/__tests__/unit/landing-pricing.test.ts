import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingBand } from "@/components/marketing/pricing-band";
import { getTierConfig } from "@/lib/stripe/prices";

describe("public pricing band", () => {
  const html = renderToStaticMarkup(createElement(PricingBand));

  it("reads per-seat prices from the billing config, never hardcoded copy", () => {
    for (const tier of ["starter", "professional"] as const) {
      const c = getTierConfig(tier);
      expect(html).toContain(`$${c.priceMonthly}`);
      expect(html).toContain(c.name);
      if (c.priceAnnual) expect(html).toContain(`$${c.priceAnnual}/seat/mo billed annually`);
    }
    expect(html).toContain("/ seat / mo");
  });

  it("keeps self-hosting free, the cost per run unmeasured, and states the credit rollover", () => {
    expect(html).toContain("Self-hosted");
    expect(html).toContain("Free");
    expect(html).toContain("[MEASURED]");
    expect(html).toMatch(/roll over for one month/);
    expect(html).not.toMatch(/per workspace/);
  });
});
