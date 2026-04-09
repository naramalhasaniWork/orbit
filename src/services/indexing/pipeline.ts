import { prisma } from "@/lib/db";
import {
  emitIndexingProgress,
  emitIndexingPhase,
  emitIndexingStarted,
  emitIndexingNodeDiscovered,
  emitIndexingCompleted,
} from "@/lib/websocket";
import { cloneRepository } from "@/services/indexing/clone";
import { fingerprint } from "@/services/indexing/fingerprint";
import { detectFramework } from "@/services/indexing/framework-detector";
import { parseFiles } from "@/services/indexing/ast-parser";
import { extractRoutes } from "@/services/indexing/route-extractor";
import { buildComponentMap } from "@/services/indexing/component-mapper";
import { generateAndStoreEmbeddings } from "@/services/indexing/embedding-generator";
import { buildSystemMap } from "@/services/indexing/system-map-builder";
import { collectAndStoreGitHistory } from "@/services/indexing/git-history";
import { getStorage } from "@/lib/storage";
import type { SystemMapStats } from "@/services/indexing/system-map-builder";
import type { IndexingPhase } from "@/lib/websocket/channels";

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

async function emitPhase(
  projectId: string,
  phase: IndexingPhase,
  message: string,
  progress: number
): Promise<void> {
  await emitIndexingPhase(projectId, { projectId, phase, message, progress });
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

  // Emit started event
  await emitIndexingStarted(projectId, {
    projectId,
    branch,
    isIncremental: false,
  });

  // Phase 1: Clone & Fingerprint
  await emitPhase(projectId, "clone", "Cloning repository...", 0);
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
  await emitPhase(projectId, "framework", "Detecting framework...", 20);
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
  await emitPhase(projectId, "ast", "Parsing source files...", 35);
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
  await emitPhase(projectId, "routes", "Extracting routes and endpoints...", 55);
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
  await emitPhase(projectId, "components", "Mapping component relationships...", 70);
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
  await emitPhase(projectId, "embeddings", "Generating embeddings...", 90);
  await emitProgress(projectId, {
    phase: "embed",
    message: "Generating embeddings...",
    nodesFound: stats.totalNodes,
    progress: 90,
  });

  const embeddingsGenerated = await generateAndStoreEmbeddings(projectId);

  // Phase 7: Git History Collection
  await emitProgress(projectId, {
    phase: "git_history",
    message: "Collecting recent git history...",
    nodesFound: stats.totalNodes,
    progress: 93,
  });

  let gitHistoryMsg = "Git history collection failed, continuing...";
  try {
    gitHistoryMsg = await collectAndStoreGitHistory(
      projectId,
      project.repoOwner,
      project.repoName,
      branch
    );
  } catch (gitErr) {
    console.warn("[pipeline] Git history collection failed:", gitErr);
  }

  await emitProgress(projectId, {
    phase: "git_history",
    message: gitHistoryMsg,
    nodesFound: stats.totalNodes,
    progress: 96,
  });

  const durationMs = Date.now() - startTime;

  await emitPhase(projectId, "complete", "Indexing complete", 100);
  await emitProgress(projectId, {
    phase: "complete",
    message: `Indexing complete. ${stats.totalNodes} nodes, ${stats.totalEdges} edges, ${embeddingsGenerated} embeddings`,
    nodesFound: stats.totalNodes,
    progress: 100,
  });
  await emitIndexingCompleted(projectId, {
    projectId,
    nodesFound: stats.totalNodes,
    edgesFound: stats.totalEdges,
    durationMs,
  });

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
