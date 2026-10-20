import { prisma } from "@/lib/db";
import { patchProjectSettings } from "@/server/data/settings-repo";
import { emitIndexingNodeDiscovered } from "@/lib/websocket";
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
      uiElements: comp.uiElements,
      formFields: comp.uiElements.filter((el) =>
        ["input", "select", "textarea"].includes(el.tag)
      ),
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
  // Snapshot existing nodes for diff detection
  const previousNodes = await prisma.systemMapNode.findMany({
    where: { projectId },
    select: { name: true, filePath: true, type: true },
  });
  const previousNodeMap = new Map(
    previousNodes.map((n) => [n.name, { filePath: n.filePath, type: n.type }])
  );

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

  // Compute diff: added, modified, removed
  const diff: { added: string[]; modified: string[]; removed: string[] } = {
    added: [],
    modified: [],
    removed: [],
  };

  Array.from(uniqueNodes.entries()).forEach(([name, node]) => {
    const prev = previousNodeMap.get(name);
    if (!prev) {
      diff.added.push(name);
    } else if (prev.filePath !== node.filePath || prev.type !== node.type) {
      diff.modified.push(name);
    }
  });

  Array.from(previousNodeMap.keys()).forEach((name) => {
    if (!uniqueNodes.has(name)) {
      diff.removed.push(name);
    }
  });

  // Create nodes in DB with change status in metadata
  const nodeNameToId = new Map<string, string>();

  for (const [name, node] of Array.from(uniqueNodes.entries())) {
    const changeStatus = diff.added.includes(name)
      ? "added"
      : diff.modified.includes(name)
      ? "modified"
      : previousNodeMap.size > 0
      ? "unchanged"
      : undefined;

    const metaObj = {
      ...node.metadata,
      framework: framework.name,
      ...(changeStatus ? { changeStatus } : {}),
    };

    const created = await prisma.systemMapNode.create({
      data: {
        projectId,
        type: node.type,
        name,
        filePath: node.filePath,
        metadata: JSON.parse(JSON.stringify(metaObj)),
      },
    });
    nodeNameToId.set(name, created.id);

    // Emit real-time node discovery event
    await emitIndexingNodeDiscovered(projectId, {
      projectId,
      nodeId: created.id,
      nodeType: node.type,
      nodeName: name,
      filePath: node.filePath,
    });
  }

  // Store diff summary in project.settings for UI consumption
  if (previousNodeMap.size > 0) {
    const hasChanges = diff.added.length > 0 || diff.modified.length > 0 || diff.removed.length > 0;
    if (hasChanges) {
      await patchProjectSettings(projectId, {
        lastSyncDiff: {
          added: diff.added.length,
          modified: diff.modified.length,
          removed: diff.removed.length,
          addedNodes: diff.added.slice(0, 50),
          modifiedNodes: diff.modified.slice(0, 50),
          removedNodes: diff.removed.slice(0, 50),
          syncedAt: new Date().toISOString(),
        },
      });
    }
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
