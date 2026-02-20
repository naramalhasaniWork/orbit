import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, framework: true, lastIndexedAt: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const nodes = await prisma.systemMapNode.findMany({
      where: { projectId },
      select: {
        id: true,
        type: true,
        name: true,
        filePath: true,
        metadata: true,
        lastIndexedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const edges = await prisma.systemMapEdge.findMany({
      where: { projectId },
      select: {
        id: true,
        sourceNodeId: true,
        targetNodeId: true,
        relationship: true,
        metadata: true,
      },
    });

    // Build summary stats
    const typeCounts = new Map<string, number>();
    for (const node of nodes) {
      typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
    }

    return apiSuccess({
      projectId,
      framework: project.framework,
      lastIndexedAt: project.lastIndexedAt,
      nodes,
      edges,
      summary: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        routes: typeCounts.get("route") ?? 0,
        components: typeCounts.get("component") ?? 0,
        endpoints: typeCounts.get("endpoint") ?? 0,
        models: typeCounts.get("model") ?? 0,
        middleware: typeCounts.get("middleware") ?? 0,
        authStrategies: typeCounts.get("auth_strategy") ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
