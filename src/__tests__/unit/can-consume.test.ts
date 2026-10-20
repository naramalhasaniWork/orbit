import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    project: { count: vi.fn() },
    workspaceMember: { count: vi.fn() },
    workspaceInvitation: { count: vi.fn() },
    testRun: { count: vi.fn() },
  },
}));

vi.mock("@/lib/billing/usage-aggregator", () => ({
  checkBudgetLimit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { checkBudgetLimit } from "@/lib/billing/usage-aggregator";
import { canConsume, TIER_LIMITS } from "@/lib/auth/tenant";
import { getAllTierConfigs, getMonthlyCreditGrant } from "@/lib/stripe/prices";
import pricingContent from "@/app/(marketing)/content/pricing.json";

const db = prisma as unknown as {
  workspace: { findUnique: ReturnType<typeof vi.fn> };
  project: { count: ReturnType<typeof vi.fn> };
  workspaceMember: { count: ReturnType<typeof vi.fn> };
  workspaceInvitation: { count: ReturnType<typeof vi.fn> };
  testRun: { count: ReturnType<typeof vi.fn> };
};
const budget = checkBudgetLimit as ReturnType<typeof vi.fn>;

describe("canConsume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.workspace.findUnique.mockResolvedValue({ tier: "free", creditBalance: 50 });
    db.testRun.count.mockResolvedValue(0);
    budget.mockResolvedValue({ budgetLimit: null, usagePercent: 0 });
  });

  it("allows a run with credits and runs remaining", async () => {
    expect(await canConsume("ws-1", "run")).toEqual({ allowed: true });
  });

  it("blocks a run at zero credit balance", async () => {
    db.workspace.findUnique.mockResolvedValue({ tier: "free", creditBalance: 0 });
    const decision = await canConsume("ws-1", "run");
    expect(decision).toMatchObject({ allowed: false, code: "INSUFFICIENT_CREDITS" });
  });

  it("blocks a run once the tier's monthly run limit is reached", async () => {
    db.testRun.count.mockResolvedValue(TIER_LIMITS.free.runsPerMonth);
    const decision = await canConsume("ws-1", "run");
    expect(decision).toMatchObject({ allowed: false, code: "LIMIT_REACHED" });
  });

  it("does not count the run itself when checking credits for an existing run", async () => {
    db.testRun.count.mockResolvedValue(TIER_LIMITS.free.runsPerMonth);
    expect(await canConsume("ws-1", "credits")).toEqual({ allowed: true });
    expect(db.testRun.count).not.toHaveBeenCalled();
  });

  it("blocks when the AI token budget is exhausted", async () => {
    budget.mockResolvedValue({ budgetLimit: 10, usagePercent: 100 });
    const decision = await canConsume("ws-1", "credits");
    expect(decision).toMatchObject({ allowed: false, code: "BUDGET_EXCEEDED" });
  });

  it("never blocks unlimited-credit tiers on balance", async () => {
    db.workspace.findUnique.mockResolvedValue({ tier: "enterprise", creditBalance: 0 });
    expect(await canConsume("ws-1", "run")).toEqual({ allowed: true });
  });

  it("reads limits from tier for projects and members", async () => {
    db.project.count.mockResolvedValue(TIER_LIMITS.free.projects);
    expect(await canConsume("ws-1", "project")).toMatchObject({ allowed: false });

    db.workspaceMember.count.mockResolvedValue(1);
    db.workspaceInvitation.count.mockResolvedValue(TIER_LIMITS.free.members - 1);
    expect(await canConsume("ws-1", "member")).toMatchObject({ allowed: false });
  });
});

describe("advertised limits match TIER_LIMITS", () => {
  it("Stripe grants use TIER_LIMITS credits, multiplied by seats on seat-based tiers", () => {
    expect(getMonthlyCreditGrant("starter", 3)).toBe(TIER_LIMITS.starter.monthlyCredits * 3);
    expect(getMonthlyCreditGrant("professional", 0)).toBe(TIER_LIMITS.professional.monthlyCredits);
    expect(getMonthlyCreditGrant("free", 5)).toBe(TIER_LIMITS.free.monthlyCredits);
    expect(getMonthlyCreditGrant("enterprise")).toBeNull();
  });

  it("plan feature lists carry the enforced numbers and no nonexistent products", () => {
    const configs = getAllTierConfigs();
    const freeCredits = `${TIER_LIMITS.free.monthlyCredits.toLocaleString("en-US")} credits/month`;
    expect(configs.free.features).toContain(freeCredits);
    const proCredits = `${TIER_LIMITS.starter.monthlyCredits.toLocaleString("en-US")} credits/month per seat`;
    expect(configs.starter.features).toContain(proCredits);

    for (const config of Object.values(configs)) {
      const text = config.features.join(" ");
      expect(text).not.toMatch(/VS Code|CLI/);
    }
  });

  it("pricing.json does not hardcode numeric limits", () => {
    for (const tier of pricingContent.tiers) {
      const text = tier.features.join(" ");
      expect(text).not.toMatch(/\d[\d,]* credits|\d+ projects?\b|\d+ team members?/);
      expect(text).not.toMatch(/VS Code|CLI/);
      expect(Object.keys(TIER_LIMITS)).toContain(tier.tier);
    }
  });

  it("does not count expired pending invitations against member seats", async () => {
    db.workspaceMember.count.mockResolvedValue(1);
    db.workspaceInvitation.count.mockResolvedValue(0);
    await canConsume("ws-1", "member");
    expect(db.workspaceInvitation.count).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", status: "pending", expiresAt: { gt: expect.any(Date) } },
    });
  });
});
