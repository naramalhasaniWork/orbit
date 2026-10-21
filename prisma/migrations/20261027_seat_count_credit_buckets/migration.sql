-- Per-seat member limits and credit buckets (monthly grant, one-month rollover, purchased packs).
-- credit_balance stays as the sum of the three buckets so existing readers keep working.

-- AlterEnum: rows that record rolled-over or monthly credits expiring
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'expiry';

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "credits_current" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "credits_rollover" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "credits_purchased" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "credits_granted" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "rollover_expires_at" TIMESTAMP(3),
ADD COLUMN     "seat_count" INTEGER NOT NULL DEFAULT 1;

-- Backfill buckets. History cannot say which credits a balance came from, so a
-- balance up to the workspace's lifetime pack purchases counts as purchased
-- (never expires) and the rest as the current grant. A negative balance is
-- debt and sits in the purchased bucket, so a new monthly grant cannot erase it.
UPDATE "workspaces" w SET
  "credits_purchased" = CASE
    WHEN w."credit_balance" < 0 THEN w."credit_balance"
    ELSE LEAST(w."credit_balance", COALESCE((
      SELECT SUM(ct."amount") FROM "credit_transactions" ct
      WHERE ct."workspace_id" = w."id" AND ct."type" = 'purchase'
    ), 0))
  END,
  "credits_granted" = w."monthly_credits";

UPDATE "workspaces" SET
  "credits_current" = "credit_balance" - "credits_purchased",
  "credits_rollover" = 0;

-- Backfill seats on seat-based tiers from the last invoice grant (which records
-- the billed quantity), else the current member count so nobody is blocked
-- before the next subscription sync sets the real quantity.
UPDATE "workspaces" w SET "seat_count" = GREATEST(1, COALESCE(
  (
    SELECT (ct."metadata"->>'seats')::int FROM "credit_transactions" ct
    WHERE ct."workspace_id" = w."id" AND ct."type" = 'monthly_grant' AND ct."metadata" ? 'seats'
    ORDER BY ct."created_at" DESC LIMIT 1
  ),
  (SELECT COUNT(*)::int FROM "workspace_members" m WHERE m."workspace_id" = w."id")
))
WHERE w."tier" IN ('starter', 'professional');
