import { prisma } from "@/lib/db";
import { JobsClient } from "@/components/admin/jobs-client";

export default async function AdminJobsPage() {
  const [failures, total] = await Promise.all([
    prisma.jobFailure.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.jobFailure.count({ where: { status: "open" } }),
  ]);
  return <JobsClient initialFailures={JSON.parse(JSON.stringify(failures))} initialTotal={total} />;
}
