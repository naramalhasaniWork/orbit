import type Stripe from "stripe";
import { getTierFromPriceId } from "./prices";
import type { WorkspaceTier } from "@/lib/auth/tier-limits";

interface LinePlan {
  tier: WorkspaceTier;
  quantity: number;
  amount: number;
  period: { start: Date; end: Date };
}

/** Subscription lines whose price maps to a tier, split into regular and proration lines. */
function planLines(invoice: Stripe.Invoice): { regular: LinePlan[]; proration: LinePlan[] } {
  const regular: LinePlan[] = [];
  const proration: LinePlan[] = [];
  for (const line of invoice.lines?.data ?? []) {
    const item = line.parent?.subscription_item_details;
    if (!item) continue;
    const price = line.pricing?.price_details?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    const tier = priceId ? getTierFromPriceId(priceId) : null;
    if (!tier) continue;
    const plan = {
      tier,
      quantity: line.quantity ?? 1,
      amount: line.amount,
      period: { start: new Date(line.period.start * 1000), end: new Date(line.period.end * 1000) },
    };
    (item.proration ? proration : regular).push(plan);
  }
  return { regular, proration };
}

/** Tier, seat count and period a renewal invoice billed: its first non-proration plan line. */
export function getInvoicedPlan(
  invoice: Stripe.Invoice
): { tier: WorkspaceTier; seats: number; period: { start: Date; end: Date } } | null {
  const line = planLines(invoice).regular[0];
  return line ? { tier: line.tier, seats: line.quantity, period: line.period } : null;
}

/**
 * Seat counts a seat-change invoice billed: Stripe bills an increase as an
 * "unused time" credit for the old quantity and a "remaining time" charge for
 * the new one, starting when the change took effect. null for decreases,
 * plan changes or anything else.
 */
export function getSeatIncrease(
  invoice: Stripe.Invoice
): { tier: WorkspaceTier; oldSeats: number; newSeats: number; changedAt: Date } | null {
  const { proration } = planLines(invoice);
  const charge = proration.find((l) => l.amount > 0);
  const credit = proration.find((l) => l.amount < 0);
  if (!charge || !credit || charge.tier !== credit.tier || charge.quantity <= credit.quantity) return null;
  return { tier: charge.tier, oldSeats: credit.quantity, newSeats: charge.quantity, changedAt: charge.period.start };
}
