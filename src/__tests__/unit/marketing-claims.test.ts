import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { TIER_LIMITS } from "@/lib/auth/tenant";
import { getTierConfig } from "@/lib/stripe/prices";

const contentDir = join(process.cwd(), "src/app/(marketing)/content");
const content = Object.fromEntries(
  readdirSync(contentDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(".json", ""), readFileSync(join(contentDir, f), "utf8")])
);
const pricing = JSON.parse(content.pricing) as {
  tiers: Array<{ name: string; credits: string; features: string[]; badge?: string }>;
  faq: Array<{ question: string }>;
  subheadline: string;
};

describe("marketing copy matches the product", () => {
  const free = pricing.tiers.find((t) => t.name === "Free")!;

  it("free tier numbers come from TIER_LIMITS", () => {
    expect(free.credits).toBe(`${TIER_LIMITS.free.monthlyCredits} credits/month`);
    expect(free.features).toContain(`${TIER_LIMITS.free.members} team members`);
    expect(free.features).toContain(`${TIER_LIMITS.free.projects} project`);
  });

  it("billing tier config agrees with TIER_LIMITS for free", () => {
    const config = getTierConfig("free");
    expect(config.creditsPerSeat).toBe(TIER_LIMITS.free.monthlyCredits);
    expect(config.maxMembers).toBe(TIER_LIMITS.free.members);
  });

  it("does not claim a badge, per-seat reassurance or QA salary comparison", () => {
    expect(pricing.tiers.some((t) => t.badge)).toBe(false);
    expect(pricing.subheadline).not.toMatch(/per-seat/i);
    expect(pricing.faq.some((f) => /QA engineer/i.test(f.question))).toBe(false);
  });

  it.each(["VS Code", "plugin marketplace", "SOC 2", "Bitbucket", "read-only", "read access"])(
    "does not mention unshipped capability %s",
    (phrase) => {
      const hits = Object.entries(content).filter(([, text]) =>
        text.toLowerCase().includes(phrase.toLowerCase())
      );
      expect(hits.map(([name]) => name)).toEqual([]);
    }
  );

  it("has no invented About stats", () => {
    expect(JSON.parse(content.about).stats).toBeUndefined();
  });
});
