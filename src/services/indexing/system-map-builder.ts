import { prisma } from "@/lib/db";
import type { RouteManifest } from "@/services/indexing/route-extractor";
import type { ComponentMap } from "@/services/indexing/component-mapper";
import type { ASTResult } from "@/services/indexing/ast-parser";
import type { FrameworkDetection } from "@/services/indexing/framework-detector";
import type { SystemMapNodeType } from "@/generated/prisma/enums";

interface SystemMapStats {
  totalNodes: number;
  totalEdges: number;
  routes: number;
  components: number;
  endpoints: number;
  models: number;
  middleware: number;
  authStrategies: number;
}

interface NodeInput {
  type: SystemMapNodeType;
  name: string;
  filePath: string;
  metadata: Record<string, unknown>;
}

interface EdgeInput {
  sourceNodeName: string;
  targetNodeName: string;
  relationship: string;
  metadata?: Record<string, unknown>;
}

function buildNodesFromRoutes(manifest: RouteManifest): NodeInput[] {
  const nodes: NodeInput[] = [];

  for (const route of manifest.routes) {
    nodes.push({
      type: "route",
      name: `route:${route.route}`,
      filePath: route.filePath,
      metadata: {
        httpMethod: route.method,
        params: route.params,
        authRequired: route.authRequired,
        routeType: route.type,
      },
    });
  }

  for (const endpoint of manifest.apiEndpoints) {
    nodes.push({
      type: "endpoint",
      name: `endpoint:${endpoint.method}:${endpoint.route}`,
      filePath: endpoint.filePath,
      metadata: {
        httpMethod: endpoint.method,
        params: endpoint.params,
        authRequired: endpoint.authRequired,
        validation: endpoint.validation,
        middleware: endpoint.middleware,
      },
    });
  }

  for (const mw of manifest.middleware) {
    nodes.push({
      type: "middleware",
      name: `middleware:${mw.split("/").pop()?.replace(/\.(ts|js|tsx|jsx)$/, "") ?? mw}`,
      filePath: mw,
      metadata: {},
    });
  }

  return nodes;
}

function buildNodesFromComponents(componentMap: ComponentMap): NodeInput[] {
  return componentMap.components.map((comp) => ({
    type: "component" as SystemMapNodeType,
    name: `component:${comp.name}`,
    filePath: comp.filePath,
    metadata: {
      isInteractive: comp.isInteractive,
      isExported: comp.isExported,
      childCount: comp.children.length,
    },
  }));
}

function buildNodesFromModels(astResults: ASTResult[]): NodeInput[] {
  const nodes: NodeInput[] = [];
  const seen = new Set<string>();

  for (const ast of astResults) {
    // Detect Prisma model usage
    const prismaImport = ast.imports.find(
      (i) => i.source === "@prisma/client" || i.source.includes("prisma")
    );

    if (prismaImport) {
      for (const spec of prismaImport.specifiers) {
        if (/^[A-Z]/.test(spec) && !seen.has(spec)) {
          seen.add(spec);
          nodes.push({
            type: "model",
            name: `model:${spec}`,
            filePath: ast.filePath,
            metadata: { orm: "prisma" },
          });
        }
      }
    }

    // Detect schema/model type definitions
    for (const typeName of ast.types) {
      if (
        (typeName.endsWith("Schema") || typeName.endsWith("Model")) &&
        !seen.has(typeName)
      ) {
        seen.add(typeName);
        nodes.push({
          type: "model",
          name: `model:${typeName}`,
          filePath: ast.filePath,
          metadata: {},
        });
      }
    }
  }

  return nodes;
}

function buildEdgesFromComponents(componentMap: ComponentMap): EdgeInput[] {
  return componentMap.relationships.map((rel) => ({
    sourceNodeName: `component:${rel.parent}`,
    targetNodeName: `component:${rel.child}`,
    relationship: rel.type,
  }));
}

function buildEdgesFromImports(
  astResults: ASTResult[],
  nodeNames: Set<string>
): EdgeInput[] {
  const edges: EdgeInput[] = [];

  for (const ast of astResults) {
    const sourceComponents = ast.components;
    const sourceExports = ast.exports;

    // Find what this file's components/exports reference
    for (const imp of ast.imports) {
      for (const spec of imp.specifiers) {
        const possibleTargets = [
          `component:${spec}`,
          `model:${spec}`,
          `middleware:${spec}`,
        ];

        for (const target of possibleTargets) {
          if (!nodeNames.has(target)) continue;

          const sourceNode =
            sourceComponents[0]
              ? `component:${sourceComponents[0]}`
              : sourceExports[0]
                ? `route:${ast.filePath}`
                : null;

          if (sourceNode && nodeNames.has(sourceNode)) {
            edges.push({
              sourceNodeName: sourceNode,
              targetNodeName: target,
              relationship: "imports",
            });
          }
        }
      }
    }
  }

  return edges;
}

export async function buildSystemMap(
  projectId: string,
  manifest: RouteManifest,
  componentMap: ComponentMap,
  astResults: ASTResult[],
  framework: FrameworkDetection
): Promise<SystemMapStats> {
  // Clear existing system map for this project
  await prisma.systemMapEdge.deleteMany({ where: { projectId } });
  await prisma.systemMapNode.deleteMany({ where: { projectId } });

  // Collect all nodes
  const allNodeInputs = [
    ...buildNodesFromRoutes(manifest),
    ...buildNodesFromComponents(componentMap),
    ...buildNodesFromModels(astResults),
  ];

  // Deduplicate by name
  const uniqueNodes = new Map<string, NodeInput>();
  for (const node of allNodeInputs) {
    if (!uniqueNodes.has(node.name)) {
      uniqueNodes.set(node.name, node);
    }
  }

  // Create nodes in DB
  const nodeNameToId = new Map<string, string>();

  for (const [name, node] of Array.from(uniqueNodes.entries())) {
    const created = await prisma.systemMapNode.create({
      data: {
        projectId,
        type: node.type,
        name,
        filePath: node.filePath,
        metadata: { ...node.metadata, framework: framework.name },
      },
    });
    nodeNameToId.set(name, created.id);
  }

  // Collect all edges
  const nodeNames = new Set(uniqueNodes.keys());
  const allEdgeInputs = [
    ...buildEdgesFromComponents(componentMap),
    ...buildEdgesFromImports(astResults, nodeNames),
  ];

  // Create edges in DB (only for valid source/target pairs)
  let edgeCount = 0;
  const seenEdges = new Set<string>();

  for (const edge of allEdgeInputs) {
    const sourceId = nodeNameToId.get(edge.sourceNodeName);
    const targetId = nodeNameToId.get(edge.targetNodeName);
    if (!sourceId || !targetId || sourceId === targetId) continue;

    const edgeKey = `${sourceId}:${targetId}:${edge.relationship}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    await prisma.systemMapEdge.create({
      data: {
        projectId,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        relationship: edge.relationship,
        metadata: (edge.metadata ?? {}) as Record<string, string>,
      },
    });
    edgeCount++;
  }

  // Update project framework
  await prisma.project.update({
    where: { id: projectId },
    data: {
      framework: framework.name,
      lastIndexedAt: new Date(),
    },
  });

  // Count by type
  const stats: SystemMapStats = {
    totalNodes: uniqueNodes.size,
    totalEdges: edgeCount,
    routes: 0,
    components: 0,
    endpoints: 0,
    models: 0,
    middleware: 0,
    authStrategies: 0,
  };

  for (const node of Array.from(uniqueNodes.values())) {
    switch (node.type) {
      case "route": stats.routes++; break;
      case "component": stats.components++; break;
      case "endpoint": stats.endpoints++; break;
      case "model": stats.models++; break;
      case "middleware": stats.middleware++; break;
      case "auth_strategy": stats.authStrategies++; break;
    }
  }

  return stats;
}

export type { SystemMapStats };
