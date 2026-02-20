import { prisma } from "@/lib/db";
import { emitIndexingProgress } from "@/lib/websocket";
import { cloneRepository } from "@/services/indexing/clone";
import { fingerprint } from "@/services/indexing/fingerprint";
import { detectFramework } from "@/services/indexing/framework-detector";
import { parseFiles } from "@/services/indexing/ast-parser";
import { extractRoutes } from "@/services/indexing/route-extractor";
import { buildComponentMap } from "@/services/indexing/component-mapper";
import { generateAndStoreEmbeddings } from "@/services/indexing/embedding-generator";
import { buildSystemMap } from "@/services/indexing/system-map-builder";
import { getStorage } from "@/lib/storage";
import type { SystemMapStats } from "@/services/indexing/system-map-builder";

interface PipelineResult {
  projectId: string;
  stats: SystemMapStats;
  framework: string;
  language: string;
  durationMs: number;
  embeddingsGenerated: number;
}

interface PipelineProgress {
  phase: string;
  message: string;
  nodesFound: number;
  progress: number;
}

async function emitProgress(
  projectId: string,
  update: PipelineProgress
): Promise<void> {
  await emitIndexingProgress(projectId, {
    projectId,
    phase: update.phase,
    message: update.message,
    nodesFound: update.nodesFound,
    progress: update.progress,
  });
}

async function loadFileContents(
  localPath: string,
  filePaths: string[]
): Promise<Array<{ path: string; content: string }>> {
  const storage = getStorage();
  const files: Array<{ path: string; content: string }> = [];

  for (const filePath of filePaths) {
    try {
      const storageKey = `${localPath}/${filePath}`;
      const buffer = await storage.download(storageKey);
      files.push({ path: filePath, content: buffer.toString("utf-8") });
    } catch {
      // Skip files that failed to load
      continue;
    }
  }

  return files;
}

export async function runIndexingPipeline(
  projectId: string,
  branch: string
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Load project info
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });

  // Phase 1: Clone & Fingerprint
  await emitProgress(projectId, {
    phase: "clone",
    message: "Cloning repository...",
    nodesFound: 0,
    progress: 0,
  });

  const cloneResult = await cloneRepository(
    projectId,
    project.repoOwner,
    project.repoName,
    branch
  );

  await emitProgress(projectId, {
    phase: "fingerprint",
    message: `Found ${cloneResult.totalFiles} indexable files`,
    nodesFound: 0,
    progress: 15,
  });

  const fp = fingerprint(cloneResult.fileTree);

  // Phase 2: Framework Detection
  await emitProgress(projectId, {
    phase: "framework",
    message: "Detecting framework...",
    nodesFound: 0,
    progress: 20,
  });

  // Load package.json for framework detection
  const filePaths = cloneResult.fileTree
    .filter((f) => f.type === "file")
    .map((f) => f.path);

  const allFiles = await loadFileContents(cloneResult.localPath, filePaths);

  const packageJsonFile = allFiles.find(
    (f) => f.path === "package.json"
  );

  const framework = detectFramework(
    cloneResult.fileTree,
    packageJsonFile?.content ?? null,
    fp
  );

  await emitProgress(projectId, {
    phase: "framework",
    message: `Detected ${framework.name} (${framework.router})`,
    nodesFound: 0,
    progress: 30,
  });

  // Phase 3: AST Parsing
  await emitProgress(projectId, {
    phase: "parse",
    message: "Parsing source files...",
    nodesFound: 0,
    progress: 35,
  });

  const astResults = parseFiles(allFiles);

  await emitProgress(projectId, {
    phase: "parse",
    message: `Parsed ${astResults.length} files`,
    nodesFound: 0,
    progress: 50,
  });

  // Phase 4: Route & Endpoint Extraction
  await emitProgress(projectId, {
    phase: "extract",
    message: "Extracting routes and endpoints...",
    nodesFound: 0,
    progress: 55,
  });

  const routeManifest = extractRoutes(
    cloneResult.fileTree,
    allFiles,
    astResults,
    framework
  );

  const routeCount =
    routeManifest.routes.length + routeManifest.apiEndpoints.length;

  await emitProgress(projectId, {
    phase: "extract",
    message: `Found ${routeCount} routes and endpoints`,
    nodesFound: routeCount,
    progress: 65,
  });

  // Phase 5: Component Mapping
  await emitProgress(projectId, {
    phase: "components",
    message: "Mapping component relationships...",
    nodesFound: routeCount,
    progress: 70,
  });

  const fileContents = new Map<string, string>();
  for (const file of allFiles) {
    fileContents.set(file.path, file.content);
  }

  const componentMap = buildComponentMap(astResults, fileContents);

  const totalNodes = routeCount + componentMap.components.length;

  await emitProgress(projectId, {
    phase: "components",
    message: `Mapped ${componentMap.components.length} components`,
    nodesFound: totalNodes,
    progress: 75,
  });

  // Phase 6: Build System Map (DB)
  await emitProgress(projectId, {
    phase: "build",
    message: "Building system map...",
    nodesFound: totalNodes,
    progress: 80,
  });

  const stats = await buildSystemMap(
    projectId,
    routeManifest,
    componentMap,
    astResults,
    framework
  );

  await emitProgress(projectId, {
    phase: "build",
    message: `System map: ${stats.totalNodes} nodes, ${stats.totalEdges} edges`,
    nodesFound: stats.totalNodes,
    progress: 85,
  });

  // Phase 6b: Generate Embeddings
  await emitProgress(projectId, {
    phase: "embed",
    message: "Generating embeddings...",
    nodesFound: stats.totalNodes,
    progress: 90,
  });

  const embeddingsGenerated = await generateAndStoreEmbeddings(projectId);

  await emitProgress(projectId, {
    phase: "complete",
    message: `Indexing complete. ${stats.totalNodes} nodes, ${stats.totalEdges} edges, ${embeddingsGenerated} embeddings`,
    nodesFound: stats.totalNodes,
    progress: 100,
  });

  const durationMs = Date.now() - startTime;

  return {
    projectId,
    stats,
    framework: framework.name,
    language: framework.language,
    durationMs,
    embeddingsGenerated,
  };
}

export type { PipelineResult };
