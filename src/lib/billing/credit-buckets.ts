import type { Prisma } from "@/generated/prisma/client";

/**
 * Credit buckets on the workspace row. creditBalance is always their sum, so
 * readers of creditBalance (limits, dashboards, alerts) need no change.
 *  - current:   what is left of this period's monthly grant
 *  - rollover:  last period's unused grant; expires at the next grant
 *  - purchased: credit packs; never expire (also holds any overspend debt)
 *
 * Every write locks the workspace row (SELECT ... FOR UPDATE) inside the
 * caller's transaction, then writes absolute values, so concurrent charges
 * and grants serialize instead of overwriting each other.
 */
export interface CreditBuckets {
  current: number;
  rollover: number;
  purchased: number;
}

export interface LockedCredits {
  buckets: CreditBuckets;
  /** The grant the current bucket started from (caps what can roll over). */
  granted: number;
}

type Tx = Prisma.TransactionClient;

export function bucketTotal(b: CreditBuckets): number {
  return b.current + b.rollover + b.purchased;
}

/**
 * Spend credits soonest-to-expire first: rollover, then current, then
 * purchased. A run is charged after it executes, so a shortfall beyond every
 * bucket is recorded as debt in purchased, where a new grant cannot erase it.
 */
export function debitBuckets(b: CreditBuckets, amount: number): CreditBuckets {
  const fromRollover = Math.min(Math.max(b.rollover, 0), amount);
  const fromCurrent = Math.min(Math.max(b.current, 0), amount - fromRollover);
  return {
    rollover: b.rollover - fromRollover,
    current: b.current - fromCurrent,
    purchased: b.purchased - (amount - fromRollover - fromCurrent),
  };
}

export interface GrantOutcome {
  buckets: CreditBuckets;
  rolledOver: number;
  /** Last period's rollover, now expired. */
  expiredRollover: number;
  /** Unused current credits above the previous grant (only possible for backfilled balances). */
  expiredCurrent: number;
}

/** New monthly grant: unused current (capped at the previous grant) rolls over; older rollover expires. */
export function applyGrantToBuckets(b: CreditBuckets, previousGrant: number, grant: number): GrantOutcome {
  const unused = Math.max(b.current, 0);
  const rolledOver = Math.min(unused, Math.max(previousGrant, 0));
  return {
    buckets: { current: grant, rollover: rolledOver, purchased: b.purchased },
    rolledOver,
    expiredRollover: Math.max(b.rollover, 0),
    expiredCurrent: unused - rolledOver,
  };
}

/** Lock the workspace row for the rest of the transaction and read its buckets. */
export async function lockCredits(tx: Tx, workspaceId: string): Promise<LockedCredits> {
  await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
  const w = await tx.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { creditsCurrent: true, creditsRollover: true, creditsPurchased: true, creditsGranted: true },
  });
  return {
    buckets: { current: w.creditsCurrent, rollover: w.creditsRollover, purchased: w.creditsPurchased },
    granted: w.creditsGranted,
  };
}

function bucketData(b: CreditBuckets) {
  return {
    creditsCurrent: b.current,
    creditsRollover: b.rollover,
    creditsPurchased: b.purchased,
    creditBalance: bucketTotal(b),
  };
}

interface LedgerEntry {
  description: string;
  testRunId?: string;
  metadata?: Prisma.InputJsonObject;
}

/** Charge credits (caller holds the lock). Returns the new balance. */
export async function chargeCredits(
  tx: Tx,
  workspaceId: string,
  locked: LockedCredits,
  amount: number,
  entry: LedgerEntry
): Promise<number> {
  const before = locked.buckets;
  const after = debitBuckets(before, amount);
  await tx.workspace.update({ where: { id: workspaceId }, data: bucketData(after) });
  await tx.creditTransaction.create({
    data: {
      workspaceId,
      type: "consumption",
      amount: -amount,
      balance: bucketTotal(after),
      description: entry.description,
      testRunId: entry.testRunId,
      metadata: {
        ...entry.metadata,
        fromRollover: before.rollover - after.rollover,
        fromCurrent: before.current - after.current,
        fromPurchased: before.purchased - after.purchased,
      },
    },
  });
  return bucketTotal(after);
}

/** Add a credit pack to the purchased bucket (caller holds the lock). */
export async function addPurchasedCredits(
  tx: Tx,
  workspaceId: string,
  locked: LockedCredits,
  credits: number,
  entry: LedgerEntry
): Promise<void> {
  const after = { ...locked.buckets, purchased: locked.buckets.purchased + credits };
  await tx.workspace.update({ where: { id: workspaceId }, data: bucketData(after) });
  await tx.creditTransaction.create({
    data: {
      workspaceId,
      type: "purchase",
      amount: credits,
      balance: bucketTotal(after),
      description: entry.description,
      metadata: entry.metadata,
    },
  });
}

/**
 * Start a new monthly period (caller holds the lock): expire last period's
 * rollover, roll the unused grant over until `period.end` (the next grant),
 * and set current to the new grant. Pass `locked.granted = 0` for no rollover
 * (Free, downgrades): all unused credits then expire. Writes one expiry row
 * per source so the credit history explains every change in balance.
 */
export async function grantMonthlyCredits(
  tx: Tx,
  workspaceId: string,
  locked: LockedCredits,
  grant: number,
  period: { start: Date; end: Date },
  entry: LedgerEntry
): Promise<GrantOutcome> {
  const outcome = applyGrantToBuckets(locked.buckets, locked.granted, grant);
  let balance = bucketTotal(locked.buckets);

  const expiries = [
    { amount: outcome.expiredRollover, source: "rollover", text: "Rolled-over credits from last month expired" },
    { amount: outcome.expiredCurrent, source: "current", text: "Unused monthly credits expired" },
  ];
  for (const e of expiries) {
    if (e.amount <= 0) continue;
    balance -= e.amount;
    await tx.creditTransaction.create({
      data: {
        workspaceId,
        type: "expiry",
        amount: -e.amount,
        balance,
        description: e.text,
        metadata: { ...entry.metadata, source: e.source },
      },
    });
  }

  const rolloverNote = outcome.rolledOver > 0
    ? `; ${outcome.rolledOver} unused credits roll over until ${period.end.toISOString().slice(0, 10)}`
    : "";
  await tx.creditTransaction.create({
    data: {
      workspaceId,
      type: "monthly_grant",
      amount: grant,
      balance: bucketTotal(outcome.buckets),
      description: `${entry.description}${rolloverNote}`,
      metadata: { ...entry.metadata, rolledOver: outcome.rolledOver },
    },
  });
  await tx.workspace.update({
    where: { id: workspaceId },
    data: {
      ...bucketData(outcome.buckets),
      creditsGranted: grant,
      creditsPeriodStart: period.start,
      rolloverExpiresAt: outcome.rolledOver > 0 ? period.end : null,
    },
  });
  return outcome;
}

/**
 * Add credits to the current period's grant mid-period (caller holds the
 * lock), e.g. for seats added after the period started. They roll over like
 * the rest of the grant.
 */
export async function addGrantCredits(
  tx: Tx,
  workspaceId: string,
  locked: LockedCredits,
  credits: number,
  entry: LedgerEntry
): Promise<void> {
  const after = { ...locked.buckets, current: locked.buckets.current + credits };
  await tx.workspace.update({
    where: { id: workspaceId },
    data: { ...bucketData(after), creditsGranted: locked.granted + credits },
  });
  await tx.creditTransaction.create({
    data: {
      workspaceId,
      type: "monthly_grant",
      amount: credits,
      balance: bucketTotal(after),
      description: entry.description,
      metadata: entry.metadata,
    },
  });
}
