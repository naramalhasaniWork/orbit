-- When the user finished or skipped the dashboard tour. NULL: show it after their first run.
ALTER TABLE "users" ADD COLUMN "onboarding_tour_completed_at" TIMESTAMP(3);
