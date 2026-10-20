import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { parseFile } from "@/services/indexing/ast-parser";
import { generateEmbeddingForNode } from "@/services/indexing/embedding-generator";
import { emitIndexingProgress } from "@/lib/websocket";
import type { ASTResult } from "@/services/indexing/ast-parser";
import { repoStorageKey, assertSafeRepoPath } from "@/lib/github/repo-paths";
import { markScriptsSuspect } from "@/server/engine/replay/invalidation";

interface IncrementalResult {
  updatedNodes: number;
  deletedNodes: number;
  newNodes: number;
  reprocessedFiles: number;
}

interface ChangedFileInfo {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

function toChangedFileInfos(changedFiles: string[]): ChangedFileInfo[] {
  return changedFiles.map((path) => ({
    path,
    status: "modified" as const,
  }));
}

function getDirectDependents(
  filePath: string,
  allNodes: Array<{ id: string; name: string; filePath: string }>
): string[] {
  // Find nodes in the same file
  return allNodes
    .filter((n) => n.filePath === filePath)
    .map((n) => n.id);
}

async function loadFileContent(
  localPath: string,
  filePath: string
): Promise<string | null> {
  try {
    const storage = getStorage();
    const buffer = await storage.download(`${localPath}/${assertSafeRepoPath(filePath)}`);
    return buffer.toString("utf-8");
  } catch {
    return null;
  }
}

async function updateNodeFromAST(
  nodeId: string,
  ast: ASTResult
): Promise<void> {
  await prisma.systemMapNode.update({
    where: { id: nodeId },
    data: {
      metadata: {
        exports: ast.exports,
        functions: ast.functions.map((f) => f.name),
        components: ast.components,
        envVars: ast.envVars,
        lastIncrementalUpdate: new Date().toISOString(),
      },
      lastIndexedAt: new Date(),
    },
  });

  // Clear the pgvector embedding so it gets regenerated
  await prisma.$executeRawUnsafe(
    `UPDATE system_map_nodes SET embedding = NULL WHERE id = $1::uuid`,
    nodeId
  );

  // Regenerate embedding
  await generateEmbeddingForNode(nodeId);
}

export async function runIncrementalIndex(
  projectId: string,
  branch: string,
  changedFiles: string[]
): Promise<IncrementalResult> {
  // Validate project exists
  await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const localPath = repoStorageKey(projectId, branch);

  await emitIndexingProgress(projectId, {
    projectId,
    phase: "incremental",
    message: `Re-indexing ${changedFiles.length} changed files...`,
    nodesFound: 0,
    progress: 10,
  });

  const changes = toChangedFileInfos(changedFiles);

  // Before nodes for deleted files go away: flag replay scripts covering the change
  const suspect = await markScriptsSuspect(projectId, changedFiles).catch((err) => {
    console.warn("[Incremental] Could not flag replay scripts:", err);
    return 0;
  });
  if (suspect > 0) console.log(`[Incremental] ${suspect} replay script(s) marked suspect`);

  // Load all existing nodes for this project
  const existingNodes = await prisma.systemMapNode.findMany({
    where: { projectId },
    select: { id: true, name: true, filePath: true },
  });

  let updatedNodes = 0;
  let deletedNodes = 0;
  let newNodes = 0;
  let reprocessedFiles = 0;

  for (const change of changes) {
    const affectedNodeIds = getDirectDependents(
      change.path,
      existingNodes
    );

    if (change.status === "deleted") {
      // Remove nodes for deleted files
      if (affectedNodeIds.length > 0) {
        // First delete edges referencing these nodes
        await prisma.systemMapEdge.deleteMany({
          where: {
            projectId,
            OR: [
              { sourceNodeId: { in: affectedNodeIds } },
              { targetNodeId: { in: affectedNodeIds } },
            ],
          },
        });

        await prisma.systemMapNode.deleteMany({
          where: { id: { in: affectedNodeIds } },
        });

        deletedNodes += affectedNodeIds.length;
      }
      continue;
    }

    // For added/modified files, re-parse and update
    const content = await loadFileContent(localPath, change.path);
    if (!content) continue;

    const ast = parseFile(change.path, content);
    reprocessedFiles++;

    if (affectedNodeIds.length > 0) {
      // Update existing nodes
      for (const nodeId of affectedNodeIds) {
        await updateNodeFromAST(nodeId, ast);
        updatedNodes++;
      }
    } else if (change.status === "added") {
      // Create new nodes for added files
      // Determine node type from AST
      if (ast.components.length > 0) {
        for (const comp of ast.components) {
          await prisma.systemMapNode.create({
            data: {
              projectId,
              type: "component",
              name: `component:${comp}`,
              filePath: change.path,
              metadata: {
                exports: ast.exports,
                isIncremental: true,
              },
            },
          });
          newNodes++;
        }
      }

      if (ast.exports.some((e) => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(e))) {
        await prisma.systemMapNode.create({
          data: {
            projectId,
            type: "endpoint",
            name: `endpoint:${change.path}`,
            filePath: change.path,
            metadata: {
              exports: ast.exports,
              isIncremental: true,
            },
          },
        });
        newNodes++;
      }
    }

    await emitIndexingProgress(projectId, {
      projectId,
      phase: "incremental",
      message: `Processed ${reprocessedFiles}/${changes.length} files`,
      nodesFound: updatedNodes + newNodes,
      progress: 10 + Math.round((reprocessedFiles / changes.length) * 80),
    });
  }

  // Update project timestamp
  await prisma.project.update({
    where: { id: projectId },
    data: { lastIndexedAt: new Date() },
  });

  await emitIndexingProgress(projectId, {
    projectId,
    phase: "complete",
    message: `Incremental index complete: ${updatedNodes} updated, ${newNodes} new, ${deletedNodes} deleted`,
    nodesFound: updatedNodes + newNodes,
    progress: 100,
  });

  return { updatedNodes, deletedNodes, newNodes, reprocessedFiles };
}

export type { IncrementalResult, ChangedFileInfo };
