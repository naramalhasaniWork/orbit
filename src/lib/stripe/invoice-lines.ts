import type Stripe from "stripe";
import { getTierFromPriceId } from "./prices";
import type { WorkspaceTier } from "@/lib/auth/tier-limits";

interface SubscriptionLine {
  tier: WorkspaceTier | null;
  priceId: string | null;
  itemId: string | null;
  proration: boolean;
  quantity: number;
  amount: number;
  /** Price per seat in cents, when Stripe reports it */
  unitAmount: number | null;
  period: { start: Date; end: Date };
}

/** Every subscription line on the invoice, with its tier when its price maps to one. */
function subscriptionLines(invoice: Stripe.Invoice): SubscriptionLine[] {
  const lines: SubscriptionLine[] = [];
  for (const line of invoice.lines?.data ?? []) {
    const item = line.parent?.subscription_item_details;
    if (!item) continue;
    const price = line.pricing?.price_details?.price;
    const priceId = (typeof price === "string" ? price : price?.id) ?? null;
    const unit = line.pricing?.unit_amount_decimal;
    lines.push({
      tier: priceId ? getTierFromPriceId(priceId) : null,
      priceId,
      itemId: item.subscription_item ?? null,
      proration: item.proration,
      quantity: line.quantity ?? 1,
      amount: line.amount,
      unitAmount: unit != null && Number.isFinite(Number(unit)) ? Number(unit) : null,
      period: { start: new Date(line.period.start * 1000), end: new Date(line.period.end * 1000) },
    });
  }
  return lines;
}

/** Tier, seat count and period a renewal invoice billed: its first non-proration plan line. */
export function getInvoicedPlan(
  invoice: Stripe.Invoice
): { tier: WorkspaceTier; seats: number; period: { start: Date; end: Date } } | null {
  const line = subscriptionLines(invoice).find((l) => !l.proration && l.tier);
  return line?.tier ? { tier: line.tier, seats: line.quantity, period: line.period } : null;
}

/** Allowed gap between what a seat increase billed and what its quantities imply: 2% or $0.50. */
function amountMatches(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= Math.max(Math.abs(expected) * 0.02, 50);
}

export type SeatIncrease = { tier: WorkspaceTier; oldSeats: number; newSeats: number; changedAt: Date };

/**
 * Seat counts a paid seat-change invoice billed. Stripe bills an increase as
 * exactly two proration lines on the same item and price: an "unused time"
 * credit for the old quantity and a "remaining time" charge for the new one.
 * Anything else (extra or missing lines, a plan change, a decrease, amounts
 * that don't match the quantities) returns null with the reason, so no
 * credits are granted for an invoice we can't account for.
 */
export function getSeatIncrease(invoice: Stripe.Invoice): { increase: SeatIncrease } | { rejected: string } {
  const proration = subscriptionLines(invoice).filter((l) => l.proration);
  const charges = proration.filter((l) => l.amount > 0);
  const credits = proration.filter((l) => l.amount < 0);
  if (charges.length !== 1 || credits.length !== 1 || proration.length !== 2) {
    return { rejected: `expected one charge and one credit proration line, got ${proration.length} line(s)` };
  }
  const [charge, credit] = [charges[0], credits[0]];
  if (!charge.itemId || charge.itemId !== credit.itemId || !charge.priceId || charge.priceId !== credit.priceId) {
    return { rejected: "proration lines are on different items or prices" };
  }
  if (!charge.tier || charge.tier !== credit.tier) return { rejected: "proration lines are not on one plan" };
  const added = charge.quantity - credit.quantity;
  if (added <= 0) return { rejected: "not a seat increase" };
  if (!charge.unitAmount || charge.unitAmount <= 0) return { rejected: "no unit price on the proration line" };

  // Stripe prorates both lines by the same fraction of the period
  const fraction = charge.amount / (charge.quantity * charge.unitAmount);
  if (!(fraction > 0 && fraction <= 1.0001)) return { rejected: `proration fraction ${fraction.toFixed(4)} out of range` };
  const expectedNet = added * charge.unitAmount * fraction;
  if (!amountMatches(charge.amount + credit.amount, expectedNet)) {
    return { rejected: `net ${charge.amount + credit.amount} does not match ${Math.round(expectedNet)} for ${added} added seat(s)` };
  }
  return { increase: { tier: charge.tier, oldSeats: credit.quantity, newSeats: charge.quantity, changedAt: charge.period.start } };
}
