import { prisma } from "@/lib/db";
import { artifactFileUrl } from "@/lib/storage/artifact-url";
import type { VisualDiffData } from "@/components/runs/visual-diff-viewer";

interface StoredVisualMetadata {
  routePath?: string;
  checksum?: string;
  isBaselineCapture?: boolean;
  baselineKey?: string | null;
  diff?: VisualDiffData["diff"] | null;
  brandCheck?: VisualDiffData["brandCheck"] | null;
}

/**
 * Visual QA results for a run, read back from the screenshot artifacts that
 * runVisualTest annotates. Artifacts without a recorded route (written before
 * results were persisted) are skipped.
 */
export async function loadRunVisualResults(
  projectId: string,
  runId: string
): Promise<VisualDiffData[]> {
  const artifacts = await prisma.runArtifact.findMany({
    where: {
      projectId,
      testRunId: runId,
      type: "screenshot",
      metadata: { path: ["source"], equals: "visual-qa" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, storageKey: true, metadata: true },
  });

  const results: VisualDiffData[] = [];
  for (const artifact of artifacts) {
    const meta = (artifact.metadata ?? {}) as StoredVisualMetadata;
    if (!meta.routePath) continue;

    let baselineUrl: string | undefined;
    if (meta.baselineKey) {
      const baseline = await prisma.runArtifact.findFirst({
        where: { projectId, storageKey: meta.baselineKey },
        select: { id: true, testRunId: true },
      });
      if (baseline) {
        baselineUrl = artifactFileUrl(projectId, baseline.testRunId, baseline.id);
      }
    }

    results.push({
      routePath: meta.routePath,
      screenshotKey: artifact.storageKey,
      checksum: meta.checksum,
      isBaselineCapture: meta.isBaselineCapture ?? false,
      baselineUrl,
      currentUrl: artifactFileUrl(projectId, runId, artifact.id),
      diff: meta.diff ?? undefined,
      brandCheck: meta.brandCheck ?? undefined,
    });
  }
  return results;
}
