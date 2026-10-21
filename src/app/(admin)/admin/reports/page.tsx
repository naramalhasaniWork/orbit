import { ReportsClient } from "@/components/admin/bug-reports/reports-client";
import { listBugReports } from "@/server/data/bug-report-repo";

export default async function AdminReportsPage({ searchParams }: { searchParams: { report?: string } }) {
  const reports = await listBugReports("open");
  return <ReportsClient initialReports={reports} initialSelectedId={searchParams.report ?? null} />;
}
