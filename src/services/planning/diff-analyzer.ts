import { prisma } from "@/lib/db";
import { scriptCoverage } from "@/server/engine/replay/script-store";

// ============================================================
// Diff-Based Testing — Analyze git diffs to scope test runs
// ============================================================

interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

interface AffectedTestCase {
  testCaseId: string;
  testCaseName: string;
  reason: string;
  confidence: number;
}

export interface DiffAnalysis {
  changedFiles: DiffFile[];
  affectedNodeIds: string[];
  affectedTestCases: AffectedTestCase[];
  recommendedMode: "smoke" | "regression" | "full";
  scopeSummary: string;
}

export async function analyzeDiff(
  projectId: string,
  changedFiles: DiffFile[]
): Promise<DiffAnalysis> {
  if (changedFiles.length === 0) {
    return {
      changedFiles: [],
      affectedNodeIds: [],
      affectedTestCases: [],
      recommendedMode: "smoke",
      scopeSummary: "No changes detected",
    };
  }

  // Get all system map nodes for the project
  const nodes = await prisma.systemMapNode.findMany({
    where: { projectId },
    select: { id: true, name: true, filePath: true, type: true },
  });

  // Find nodes affected by the changed files
  const changedPaths = new Set(changedFiles.map((f) => f.path));
  const affectedNodes = nodes.filter((node) => {
    // Direct file match
    if (changedPaths.has(node.filePath)) return true;
    // Directory-level match (e.g., changes in a component's directory)
    return changedFiles.some((f) => {
      const fileDir = f.path.split("/").slice(0, -1).join("/");
      const nodeDir = node.filePath.split("/").slice(0, -1).join("/");
      return fileDir === nodeDir;
    });
  });

  const affectedNodeIds = affectedNodes.map((n) => n.id);

  // Find dependent nodes via edges
  const dependentEdges = affectedNodeIds.length > 0
    ? await prisma.systemMapEdge.findMany({
        where: {
          projectId,
          OR: [
            { sourceNodeId: { in: affectedNodeIds } },
            { targetNodeId: { in: affectedNodeIds } },
          ],
        },
        select: { sourceNodeId: true, targetNodeId: true },
      })
    : [];

  const dependentNodeIds = new Set(affectedNodeIds);
  for (const edge of dependentEdges) {
    dependentNodeIds.add(edge.sourceNodeId);
    dependentNodeIds.add(edge.targetNodeId);
  }

  // Find test cases covering affected nodes
  const [allTestCases, coverage] = await Promise.all([
    prisma.testCase.findMany({
      where: { projectId, isEnabled: true },
      select: { id: true, name: true, journey: true, steps: true, isCritical: true },
    }),
    scriptCoverage(projectId),
  ]);

  const affectedNodeNames = Array.from(new Set(
    nodes.filter((n) => dependentNodeIds.has(n.id)).map((n) => n.name.toLowerCase())
  ));

  const affectedTestCases: AffectedTestCase[] = [];

  for (const tc of allTestCases) {
    // A compiled script knows exactly which routes the case visits: use that, not name matching
    const covered = coverage.get(tc.id);
    if (covered) {
      const hits = covered.filter((id) => dependentNodeIds.has(id)).length;
      if (hits > 0) {
        affectedTestCases.push({
          testCaseId: tc.id, testCaseName: tc.name, confidence: 0.95,
          reason: `Replay script covers ${hits} affected route${hits !== 1 ? "s" : ""}`,
        });
      }
      continue;
    }

    const tcNameLower = tc.name.toLowerCase();
    const steps = Array.isArray(tc.steps) ? tc.steps : [];
    const stepsStr = JSON.stringify(steps).toLowerCase();

    // Check if the test case name or steps reference any affected node
    let matched = false;
    let reason = "";
    let confidence = 0;

    for (const nodeName of affectedNodeNames) {
      if (tcNameLower.includes(nodeName) || nodeName.includes(tcNameLower)) {
        matched = true;
        reason = `Test name matches affected node "${nodeName}"`;
        confidence = 0.9;
        break;
      }
      if (stepsStr.includes(nodeName)) {
        matched = true;
        reason = `Test steps reference affected node "${nodeName}"`;
        confidence = 0.7;
        break;
      }
    }

    // Also match by changed file paths in steps
    if (!matched) {
      for (const file of changedFiles) {
        const fileName = file.path.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
        if (fileName && (tcNameLower.includes(fileName) || stepsStr.includes(fileName))) {
          matched = true;
          reason = `Test references changed file "${file.path}"`;
          confidence = 0.6;
          break;
        }
      }
    }

    if (matched) {
      affectedTestCases.push({
        testCaseId: tc.id,
        testCaseName: tc.name,
        reason,
        confidence,
      });
    }
  }

  // Determine recommended mode
  const hasCriticalChanges = changedFiles.some((f) =>
    /auth|login|payment|checkout|api\/.*route/i.test(f.path)
  );
  const isLargeChange = changedFiles.length > 20;
  const hasConfigChanges = changedFiles.some((f) =>
    /package\.json|next\.config|tsconfig|\.env/i.test(f.path)
  );

  let recommendedMode: "smoke" | "regression" | "full" = "regression";
  if (isLargeChange || hasConfigChanges) {
    recommendedMode = "full";
  } else if (affectedTestCases.length <= 3 && !hasCriticalChanges) {
    recommendedMode = "smoke";
  }

  const scopeSummary = buildScopeSummary(changedFiles, affectedTestCases, affectedNodeIds);

  return {
    changedFiles,
    affectedNodeIds: Array.from(dependentNodeIds),
    affectedTestCases: affectedTestCases.sort((a, b) => b.confidence - a.confidence),
    recommendedMode,
    scopeSummary,
  };
}

function buildScopeSummary(
  changedFiles: DiffFile[],
  affectedTests: AffectedTestCase[],
  affectedNodes: string[]
): string {
  const parts: string[] = [];
  parts.push(`${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""} changed`);
  parts.push(`${affectedNodes.length} system map node${affectedNodes.length !== 1 ? "s" : ""} affected`);
  parts.push(`${affectedTests.length} test case${affectedTests.length !== 1 ? "s" : ""} to run`);
  return parts.join(", ");
}

export async function getAffectedTestCaseIds(
  projectId: string,
  changedFiles: string[]
): Promise<string[]> {
  const diffFiles: DiffFile[] = changedFiles.map((path) => ({
    path,
    status: "modified",
    additions: 0,
    deletions: 0,
  }));

  const analysis = await analyzeDiff(projectId, diffFiles);
  return analysis.affectedTestCases.map((tc) => tc.testCaseId);
}
