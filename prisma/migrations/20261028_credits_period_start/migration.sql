-- Start of each workspace's credit period. The scheduler resets Free
-- workspaces' monthly allowance one month after it.
ALTER TABLE "workspaces" ADD COLUMN "credits_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
