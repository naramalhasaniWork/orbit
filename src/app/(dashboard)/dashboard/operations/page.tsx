import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OperationsFlowClient } from "@/components/dashboard/operations-flow-client";
import type { Operation, Flow, Dependency } from "@/components/dashboard/operations-flow-types";

export const dynamic = "force-dynamic";

interface OperationsMapData {
  operations: Operation[];
  flows: Flow[];
  dependencies: Dependency[];
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const params = await searchParams;

  let project: { id: string; name: string } | null = null;

  if (params.project) {
    project = await prisma.project.findFirst({
      where: { id: params.project, workspaceId },
      select: { id: true, name: true },
    });
  }

  if (!project) {
    project = await prisma.project.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
  }

  if (!project) redirect("/dashboard");

  // Extract operations data from latest active test plan metadata
  const operationsData = await getOperationsData(project.id);

  return (
    <OperationsFlowClient
      projectId={project.id}
      projectName={project.name}
      operations={operationsData.operations}
      flows={operationsData.flows}
      dependencies={operationsData.dependencies}
    />
  );
}

async function getOperationsData(projectId: string): Promise<OperationsMapData> {
  const empty: OperationsMapData = { operations: [], flows: [], dependencies: [] };

  const plan = await prisma.testPlan.findFirst({
    where: { projectId, isActive: true, deletedAt: null },
    orderBy: { version: "desc" },
    select: { summary: true },
  });

  if (!plan?.summary) return empty;

  const summary = plan.summary as Record<string, unknown>;
  const opsMap = summary.operationsMap as OperationsMapData | undefined;

  if (!opsMap || !Array.isArray(opsMap.operations)) return empty;

  return {
    operations: opsMap.operations ?? [],
    flows: opsMap.flows ?? [],
    dependencies: opsMap.dependencies ?? [],
  };
}
