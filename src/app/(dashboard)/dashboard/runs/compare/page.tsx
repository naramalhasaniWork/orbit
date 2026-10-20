import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RunComparison } from "@/components/runs/run-comparison";

interface RunComparePageProps {
  searchParams: Promise<{ runA?: string; runB?: string }>;
}

export default async function RunComparePage({ searchParams }: RunComparePageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const { runA, runB } = await searchParams;
  if (!runA || !runB) notFound();

  const project = await prisma.project.findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!project) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/runs/${runB}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-medium text-foreground">Compare runs</h1>
      </div>
      <RunComparison projectId={project.id} runAId={runA} runBId={runB} />
    </div>
  );
}
