import { prisma } from "@/lib/db";
import { TIER_LIMITS, type WorkspaceTier } from "@/lib/auth/tier-limits";
import { lockCredits, grantMonthlyCredits, addGrantCredits } from "./credit-buckets";

/**
 * Monthly credit periods. Credits are promised per month on every plan, so a
 * credit period is one month even on annual billing: it starts at
 * creditsPeriodStart and ends a month later, or at the billing period end if
 * that comes first. Paid monthly renewals go through handleInvoicePaid; the
 * scheduler drives Free resets and annual months (scheduled-grants.ts).
 */

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

/** The latest monthly anniversary of `anchor` that is not after `now`. */
export function currentPeriodStart(anchor: Date, now: Date): Date {
  let months = 0;
  while (addMonthsUTC(anchor, months + 1) <= now) months++;
  return addMonthsUTC(anchor, months);
}

/** End of the monthly credit period starting at `start`, capped at the billing period end. */
export function creditPeriodEnd(start: Date, billingPeriodEnd: Date | null): Date {
  const monthEnd = addMonthsUTC(start, 1);
  return billingPeriodEnd && billingPeriodEnd < monthEnd ? billingPeriodEnd : monthEnd;
}

/**
 * On downgrade to Free: the paid grant and its rollover expire (with expiry
 * rows), purchased credits stay, and a Free period starts now with the Free
 * allowance.
 */
export async function startFreePeriod(workspaceId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await lockCredits(tx, workspaceId);
    await grantMonthlyCredits(tx, workspaceId, { ...locked, granted: 0 }, TIER_LIMITS.free.monthlyCredits, {
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
  oldSeats: number;
  newSeats: number;
  /** When the paid change took effect (the proration line's start) */
  changedAt: Date;
  stripeInvoiceId: string;
}

/**
 * Only called for a PAID seat-change invoice. Grants the added seats' credits
 * for the rest of the monthly credit period: seats above the period's
 * high-water mark x per-seat credits x the share of the month left, then
 * raises the mark, so cycling seats up, down and up again in one period
 * grants once. Once per invoice. Seat cuts claw nothing back.
 */
export async function grantAddedSeatCredits(increase: SeatIncrease): Promise<number> {
  const { workspaceId, tier, oldSeats, newSeats, changedAt, stripeInvoiceId } = increase;
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
      select: { creditsPeriodStart: true, creditsPeriodPaidSeats: true, billingPeriodEnd: true },
    });
    const mark = Math.max(ws.creditsPeriodPaidSeats, oldSeats);
    const added = newSeats - mark;
    if (added <= 0) return 0;

    const end = creditPeriodEnd(ws.creditsPeriodStart, ws.billingPeriodEnd);
    const length = end.getTime() - ws.creditsPeriodStart.getTime();
    const fraction = length > 0 ? (end.getTime() - changedAt.getTime()) / length : 0;
    const credits = proratedSeatCredits(added, perSeat, fraction);
    if (credits <= 0) return 0;

    await addGrantCredits(tx, workspaceId, locked, credits, {
      description: `Prorated credits for ${added} added seat${added === 1 ? "" : "s"}`,
      metadata: { stripeInvoiceId, seatsAdded: added, prorated: true },
    }, { creditsPeriodPaidSeats: newSeats });
    return credits;
  });
}
