-- workspace.tier is authoritative for plan limits (TIER_LIMITS in
-- src/lib/auth/tier-limits.ts). The legacy plan string and the per-workspace
-- limit columns were never read for enforcement. No backfill.
ALTER TABLE "workspaces" DROP COLUMN "plan",
DROP COLUMN "run_limit",
DROP COLUMN "member_limit",
DROP COLUMN "project_limit";
