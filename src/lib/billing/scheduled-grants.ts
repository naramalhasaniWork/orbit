import { prisma } from "@/lib/db";
import { isSelfHosted } from "@/lib/self-host";
import { TIER_LIMITS, tierDisplayName } from "@/lib/auth/tier-limits";
import { getAllTierConfigs, getMonthlyCreditGrant } from "@/lib/stripe/prices";
import type { Prisma } from "@/generated/prisma/client";
import { lockCredits, grantMonthlyCredits, type LockedCredits } from "./credit-buckets";
import { addMonthsUTC, currentPeriodStart, creditPeriodEnd } from "./credit-periods";

/**
 * Monthly grants no invoice triggers, run from the scheduler tick:
 *  - Free: reset to the Free cap, no rollover
 *  - annual Pro/Team: the next month's grant, with rollover (the yearly
 *    invoice only grants month 1)
 * Each workspace is re-checked under its row lock, so overlapping ticks grant once.
 */

const BATCH = 500;

type Tx = Prisma.TransactionClient;
/** Grants for one due workspace inside its locked transaction; returns whether it granted. */
type DueGrant = (tx: Tx, id: string, locked: LockedCredits, now: Date) => Promise<boolean>;

async function grantDue(where: Prisma.WorkspaceWhereInput, grant: DueGrant, now: Date): Promise<number> {
  if (isSelfHosted()) return 0;
  const due = await prisma.workspace.findMany({
    where: { ...where, deletedAt: null, creditsPeriodStart: { lte: addMonthsUTC(now, -1) } },
    select: { id: true },
    take: BATCH,
  });
  let granted = 0;
  for (const { id } of due) {
    const done = await prisma.$transaction(async (tx) => grant(tx, id, await lockCredits(tx, id), now));
    if (done) granted++;
  }
  return granted;
}

/** Reset Free workspaces whose month ended: unused allowance expires, current = Free cap, purchased stays. */
export function resetDueFreeCredits(now: Date = new Date()): Promise<number> {
  return grantDue({ tier: "free" }, async (tx, id, locked) => {
    const ws = await tx.workspace.findUniqueOrThrow({
      where: { id },
      select: { tier: true, creditsPeriodStart: true },
    });
    if (ws.tier !== "free" || addMonthsUTC(ws.creditsPeriodStart, 1) > now) return false;

    const start = currentPeriodStart(ws.creditsPeriodStart, now);
    await grantMonthlyCredits(tx, id, { ...locked, granted: 0 }, TIER_LIMITS.free.monthlyCredits, {
      start,
      end: addMonthsUTC(start, 1),
    }, { description: "Monthly credit grant (Free plan)", metadata: { tier: "free" } });
    return true;
  }, now);
}

function annualPriceIds(): string[] {
  return Object.values(getAllTierConfigs())
    .map((c) => c.stripePriceIdAnnual)
    .filter((id): id is string => !!id);
}

/**
 * Grant annual subscribers' next month: per-seat credits for the current
 * seats, with last month's unused grant rolling over. Months are anchored on
 * the billing period start; the month the yearly renewal starts is left to
 * its invoice.
 */
export function grantDueAnnualCredits(now: Date = new Date()): Promise<number> {
  const priceIds = annualPriceIds();
  if (priceIds.length === 0) return Promise.resolve(0);

  return grantDue({ stripePriceId: { in: priceIds } }, async (tx, id, locked) => {
    const ws = await tx.workspace.findUniqueOrThrow({
      where: { id },
      select: {
        tier: true, stripePriceId: true, stripeSubscriptionId: true, seatCount: true,
        creditsPeriodStart: true, billingPeriodStart: true, billingPeriodEnd: true,
      },
    });
    if (!ws.stripePriceId || !priceIds.includes(ws.stripePriceId)) return false;
    if (addMonthsUTC(ws.creditsPeriodStart, 1) > now) return false;

    const subscription = ws.stripeSubscriptionId
      ? await tx.subscription.findFirst({ where: { stripeSubscriptionId: ws.stripeSubscriptionId }, select: { status: true } })
      : null;
    if (subscription?.status !== "active" && subscription?.status !== "trialing") return false;

    const start = currentPeriodStart(ws.billingPeriodStart ?? ws.creditsPeriodStart, now);
    if (ws.billingPeriodEnd && start >= ws.billingPeriodEnd) return false; // the renewal invoice grants
    if (start <= ws.creditsPeriodStart) return false;

    const grant = getMonthlyCreditGrant(ws.tier, ws.seatCount);
    if (!grant || grant <= 0) return false;

    const seatsLabel = ws.seatCount > 1 ? `, ${ws.seatCount} seats` : "";
    await grantMonthlyCredits(tx, id, locked, grant, {
      start,
      end: creditPeriodEnd(start, ws.billingPeriodEnd),
      paidSeats: ws.seatCount,
    }, {
      description: `Monthly credit grant (${tierDisplayName(ws.tier)} plan, annual${seatsLabel})`,
      metadata: { tier: ws.tier, seats: ws.seatCount, annual: true, periodStart: start.toISOString() },
    });
    return true;
  }, now);
}
