import { prisma } from "@/lib/db";
import { isSelfHosted } from "@/lib/self-host";
import { TIER_LIMITS, type WorkspaceTier } from "@/lib/auth/tier-limits";
import { lockCredits, grantMonthlyCredits, addGrantCredits } from "./credit-buckets";

/**
 * Credit period transitions that Stripe invoices don't drive: the Free
 * monthly reset, the switch to Free on downgrade, and prorated credits for
 * seats added mid-period. Paid renewals go through handleInvoicePaid.
 */

const FREE_RESET_BATCH = 500;

/** Same day next month in UTC, clamped to the month's last day (Jan 31 -> Feb 28). */
export function addMonthsUTC(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** The latest monthly anniversary of `start` that is not after `now`. */
export function currentPeriodStart(start: Date, now: Date): Date {
  let months = 0;
  while (addMonthsUTC(start, months + 1) <= now) months++;
  return addMonthsUTC(start, months);
}

function freeGrant(): number {
  return TIER_LIMITS.free.monthlyCredits;
}

/**
 * Reset every Free workspace whose credit period ended: unused allowance
 * expires (Free has no rollover), current is set to the Free cap, purchased
 * is untouched. Re-checked under the row lock, so overlapping ticks reset a
 * workspace once. Returns how many workspaces were reset.
 */
export async function resetDueFreeCredits(now: Date = new Date()): Promise<number> {
  if (isSelfHosted()) return 0;
  const due = await prisma.workspace.findMany({
    where: { tier: "free", deletedAt: null, creditsPeriodStart: { lte: addMonthsUTC(now, -1) } },
    select: { id: true },
    take: FREE_RESET_BATCH,
  });

  let reset = 0;
  for (const { id } of due) {
    const done = await prisma.$transaction(async (tx) => {
      const locked = await lockCredits(tx, id);
      const ws = await tx.workspace.findUniqueOrThrow({
        where: { id },
        select: { tier: true, creditsPeriodStart: true },
      });
      if (ws.tier !== "free" || addMonthsUTC(ws.creditsPeriodStart, 1) > now) return false;

      const start = currentPeriodStart(ws.creditsPeriodStart, now);
      await grantMonthlyCredits(tx, id, { ...locked, granted: 0 }, freeGrant(), {
        start,
        end: addMonthsUTC(start, 1),
      }, { description: "Monthly credit grant (Free plan)", metadata: { tier: "free" } });
      return true;
    });
    if (done) reset++;
  }
  return reset;
}

/**
 * On downgrade to Free: the paid grant and its rollover expire (with expiry
 * rows), purchased credits stay, and a Free period starts now with the Free
 * allowance.
 */
export async function startFreePeriod(workspaceId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await lockCredits(tx, workspaceId);
    await grantMonthlyCredits(tx, workspaceId, { ...locked, granted: 0 }, freeGrant(), {
      start: now,
      end: addMonthsUTC(now, 1),
    }, { description: "Downgraded to Free: monthly credit grant (Free plan)", metadata: { tier: "free" } });
  });
}

/** Credits for seats added with `remainingFraction` of the period left (rounded down). */
export function proratedSeatCredits(addedSeats: number, perSeat: number, remainingFraction: number): number {
  if (addedSeats <= 0) return 0;
  return Math.floor(addedSeats * perSeat * Math.min(1, Math.max(0, remainingFraction)));
}

interface SeatIncrease {
  workspaceId: string;
  tier: WorkspaceTier;
  addedSeats: number;
  /** The proration window: from the change to the end of the period */
  period: { start: Date; end: Date };
  stripeInvoiceId: string;
}

/**
 * When a seat increase's proration invoice is paid, grant the added seats'
 * credits for the rest of the period: added seats x per-seat credits x the
 * share of the billing period left. Once per invoice. Seat cuts claw nothing
 * back; the seat count itself is synced from the subscription.
 */
export async function grantAddedSeatCredits(increase: SeatIncrease): Promise<number> {
  const { workspaceId, tier, addedSeats, period, stripeInvoiceId } = increase;
  const perSeat = TIER_LIMITS[tier].monthlyCredits;
  if (!TIER_LIMITS[tier].seatBased || perSeat === Infinity) return 0;

  return prisma.$transaction(async (tx) => {
    const locked = await lockCredits(tx, workspaceId);
    const seen = await tx.creditTransaction.findFirst({
      where: { workspaceId, type: "monthly_grant", metadata: { path: ["stripeInvoiceId"], equals: stripeInvoiceId } },
      select: { id: true },
    });
    if (seen) return 0;

    const ws = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { billingPeriodStart: true, billingPeriodEnd: true },
    });
    if (!ws.billingPeriodStart || !ws.billingPeriodEnd) return 0;
    const length = ws.billingPeriodEnd.getTime() - ws.billingPeriodStart.getTime();
    const fraction = length > 0 ? (period.end.getTime() - period.start.getTime()) / length : 0;
    const credits = proratedSeatCredits(addedSeats, perSeat, fraction);
    if (credits <= 0) return 0;

    await addGrantCredits(tx, workspaceId, locked, credits, {
      description: `Prorated credits for ${addedSeats} added seat${addedSeats === 1 ? "" : "s"}`,
      metadata: { stripeInvoiceId, seatsAdded: addedSeats, prorated: true },
    });
    return credits;
  });
}
