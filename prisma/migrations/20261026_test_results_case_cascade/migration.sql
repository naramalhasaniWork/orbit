-- A test case's results go with it. Without the cascade, deleting a test case, a project or a
-- workspace that has run results failed on this constraint.
ALTER TABLE "test_results" DROP CONSTRAINT "test_results_test_case_id_fkey";
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
