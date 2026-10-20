-- Human-readable run numbers per project (#1, #2, ...).
-- The number is assigned by a BEFORE INSERT trigger so every code path that creates a
-- run gets one. The trigger bumps projects.run_counter, and that row lock serialises
-- concurrent inserts for the same project, so numbers are unique and gap-free.

-- AlterTable
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "run_counter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "test_runs" ADD COLUMN IF NOT EXISTS "sequence_number" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing runs in creation order (id breaks ties deterministically).
UPDATE "test_runs" r
SET "sequence_number" = n.rn
FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "created_at", "id") AS rn
    FROM "test_runs"
) n
WHERE r."id" = n."id" AND r."sequence_number" = 0;

UPDATE "projects" p
SET "run_counter" = m.max_seq
FROM (
    SELECT "project_id", MAX("sequence_number") AS max_seq FROM "test_runs" GROUP BY "project_id"
) m
WHERE p."id" = m."project_id";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "test_runs_project_id_sequence_number_key" ON "test_runs"("project_id", "sequence_number");

-- Sequence assignment
CREATE OR REPLACE FUNCTION assign_test_run_sequence_number() RETURNS trigger AS $$
BEGIN
    UPDATE "projects"
    SET "run_counter" = "run_counter" + 1
    WHERE "id" = NEW."project_id"
    RETURNING "run_counter" INTO NEW."sequence_number";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS test_runs_assign_sequence_number ON "test_runs";
CREATE TRIGGER test_runs_assign_sequence_number
    BEFORE INSERT ON "test_runs"
    FOR EACH ROW EXECUTE FUNCTION assign_test_run_sequence_number();
