-- Seats already credited in the current credit period. A paid seat increase
-- grants prorated credits only above this mark, so cycling seats up, down and
-- up again in one period cannot grant twice. Reset at every period grant.
ALTER TABLE "workspaces" ADD COLUMN "credits_period_paid_seats" INTEGER NOT NULL DEFAULT 0;

-- The current period's grant already covered the current seats
UPDATE "workspaces" SET "credits_period_paid_seats" = "seat_count";
