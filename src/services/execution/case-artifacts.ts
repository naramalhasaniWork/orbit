import type { Page } from "playwright";
import { saveNetworkLog, saveConsoleLog } from "@/services/execution/evidence-collector";
import type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";
import { analyzeVisualQuality } from "@/agents/prompts/sub-agents/visual-analyzer";
import { runAllInvariants, collectPageState } from "@/services/execution/invariant-checker";
import type { InvariantResult } from "@/services/execution/invariant-checker";

// Stores a finished case's evidence (video, screenshots, logs, DOM) and runs
// the informational invariants. Shared by the agent and replay executors.

interface ArtifactCase {
  id: string;
  name: string;
  projectId: string;
  steps: Array<{ action: string; expected: string }>;
}

interface CollectOptions {
  runId: string;
  testCase: ArtifactCase;
  environmentUrl: string;
  startTime: number;
  /** LLM review of the last screenshot; replay leaves it off to stay at zero model calls */
  analyzeVisual: boolean;
  log: (msg: string) => void;
}

export async function collectCaseArtifacts(
  page: Page, evidenceCollector: EvidenceCollectorInstance, options: CollectOptions
): Promise<{ artifacts: Record<string, string>; invariants?: InvariantResult }> {
  const { runId, testCase } = options;
  const evidence = evidenceCollector.getEvidence();
  const artifacts: Record<string, string> = {};

  // Finalize video recording before closing browser
  const videoUrl = await evidenceCollector.finalizeVideo();
  if (videoUrl) {
    artifacts.videoUrl = videoUrl;
  }

  if (evidence.screenshots.length > 0) {
    artifacts.screenshots = JSON.stringify(evidence.screenshots);
  }

  // Visual quality analysis on last screenshot
  if (options.analyzeVisual && evidence.screenshots.length > 0) {
    try {
      const visualResult = await analyzeVisualQuality(
        evidence.screenshots[evidence.screenshots.length - 1],
        testCase,
        options.environmentUrl,
      );
      artifacts.visualAnalysis = JSON.stringify(visualResult);
    } catch {
      // Visual analysis is non-blocking — don't fail the test
    }
  }

  if (evidence.networkLog.length > 0) {
    artifacts.networkLog = await saveNetworkLog(
      runId, testCase.id, evidence.networkLog, testCase.projectId
    );
  }
  if (evidence.consoleLog.length > 0) {
    artifacts.consoleLog = await saveConsoleLog(
      runId, testCase.id, evidence.consoleLog, testCase.projectId
    );
  }
  if (evidence.domSnapshot) {
    artifacts.domSnapshot = evidence.domSnapshot;
  }

  // Run system invariants (informational — does not affect verdict)
  let invariants: InvariantResult | undefined;
  try {
    invariants = runAllInvariants(await collectPageState(page, evidence, options.startTime));
    if (!invariants.passed) {
      for (const v of invariants.violations) options.log(`  [${v.severity}] ${v.description}`);
    }
    artifacts.invariants = JSON.stringify(invariants);
  } catch { /* non-blocking */ }

  return { artifacts, invariants };
}
