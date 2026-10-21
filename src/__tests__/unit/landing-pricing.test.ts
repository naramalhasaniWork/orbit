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

describe("site metadata", () => {
  it("sitemap lists only public pages, robots keeps the app private", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const { default: robots } = await import("@/app/robots");
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    expect(urls).toContain("/pricing");
    expect(urls.some((u) => /dashboard|admin|blog|docs|changelog/.test(u))).toBe(false);
    const rules = robots().rules as { disallow: string[] };
    expect(rules.disallow).toEqual(expect.arrayContaining(["/dashboard", "/admin", "/api"]));
  });

  it("robots and sitemap are rendered per request, so one image serves hosted and self-hosted", async () => {
    // Prerendered at build, a self-hosted image would serve the hosted robots.txt.
    expect((await import("@/app/robots")).dynamic).toBe("force-dynamic");
    expect((await import("@/app/sitemap")).dynamic).toBe("force-dynamic");
  });

  it("JSON-LD offers mirror the billing config and invent no ratings", async () => {
    const { softwareApplicationJsonLd } = await import("@/lib/marketing/json-ld");
    const ld = softwareApplicationJsonLd();
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.offers.map((o) => o.price)).toEqual(["0", String(getTierConfig("starter").priceMonthly), String(getTierConfig("professional").priceMonthly)]);
    expect(Object.keys(ld)).not.toEqual(expect.arrayContaining(["aggregateRating"]));
    expect(Object.keys(ld)).not.toContain("review");
  });
});
