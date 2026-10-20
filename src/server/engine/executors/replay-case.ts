import { closeBrowser, captureStorageState } from "@/services/execution/browser-manager";
import type { BrowserInstance, StorageState } from "@/services/execution/browser-manager";
import { launchCaseBrowser, prepareCasePage } from "@/services/execution/case-session";
import { collectCaseArtifacts } from "@/services/execution/case-artifacts";
import { createEvidenceCollector } from "@/services/execution/evidence-collector";
import { executeTestSteps } from "@/services/execution/step-executor";
import { loadTestingNotes } from "@/agents/prompts/context-loader";
import { isProviderError } from "@/services/execution/error-classifier";
import { isRunAbort } from "@/services/execution/run-abort";
import { splitAccessCredentials } from "@/services/execution/access-headers";
import type { TestCaseForExecution, TestCaseResult } from "@/services/execution/test-case-executor";
import type { ExecutionMeta } from "@/services/execution/test-result-store";
import type { StepResult } from "@/agents/schemas/execution-result";
import { replayActions } from "@/server/engine/replay/replayer";
import { createActionRecorder } from "@/server/engine/replay/recorder";
import { recordReplay } from "@/server/engine/replay/script-store";
import type { StoredScript } from "@/server/engine/replay/script-store";
import type { RecordedRun } from "@/server/engine/replay/types";
import type { CaseRunContext } from "./case-executor";

/**
 * Executes a case from its compiled script. A clean replay makes no model
 * calls. On divergence at step k the same live page goes to the agent loop
 * at step k, seeded with the replayed history: if the agent passes, its
 * recording (replayed steps + agent steps) becomes the next script version;
 * if it fails, the case fails.
 */

export interface ReplayCaseOptions {
  script: StoredScript;
  locatorTimeoutMs: number;
  /** Compile and save a healed recording as the next script version */
  saveHealed: (recorded: RecordedRun) => Promise<void>;
}

export async function replayCase(
  testCase: TestCaseForExecution, ctx: CaseRunContext, options: ReplayCaseOptions
): Promise<TestCaseResult> {
  const { runId, environmentUrl } = ctx;
  // The Cloudflare Access token becomes request headers, never a value replay or the agent types
  const { headers: accessHeaders, credentials } = splitAccessCredentials(ctx.credentials);
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[Replay:${testCase.id.slice(0, 8)}] ${msg}`);
  let instance: BrowserInstance | null = null;
  const execution: ExecutionMeta = { executionMode: "replay", divergedAtStep: null, modelCalls: 0, modelCostUsd: 0 };

  try {
    instance = await launchCaseBrowser(runId, { storageState: ctx.storageState });
    const blocked = await prepareCasePage(
      instance, testCase, environmentUrl, credentials, accessHeaders, !!ctx.storageState, log, startTime
    );
    if (blocked) return blocked;

    const { page, context } = instance;
    const evidenceCollector = createEvidenceCollector(page, runId, testCase.id, context, testCase.projectId);
    evidenceCollector.startCapture();

    const replay = await replayActions({
      page, actions: options.script.actions, steps: testCase.steps, testCaseName: testCase.name,
      projectId: testCase.projectId, environmentUrl, credentials, locatorTimeoutMs: options.locatorTimeoutMs,
    });
    await recordReplay(options.script.id, replay.status === "diverged");

    let verdict = "pass";
    let steps: StepResult[] = replay.steps;
    let healedSelectors: string[] = [];
    if (replay.status === "diverged") {
      execution.executionMode = "replay_healed";
      execution.divergedAtStep = replay.stepIndex;
      log(`Diverged at step ${replay.stepIndex + 1} (${replay.reason}); handing the page to the agent`);
      const recorder = createActionRecorder(environmentUrl, credentials);
      recorder.seed(replay.completed);
      const testingNotes = await loadTestingNotes(testCase.projectId);
      const agent = await executeTestSteps({
        page, projectId: testCase.projectId, testCaseId: testCase.id, testCaseName: testCase.name, runId,
        steps: testCase.steps.map((s) => ({ action: s.action, expected: s.expected, selectorHint: s.selector })),
        environmentUrl, credentials, evidenceCollector, maxRetries: 1,
        testingNotes: testingNotes.length > 0 ? testingNotes : undefined,
        recorder,
        resumeFrom: { stepIndex: replay.stepIndex, previousActions: replay.previousActions },
      });
      verdict = agent.verdict;
      steps = [...replay.steps, ...agent.steps];
      healedSelectors = agent.healedSelectors;
      if (verdict === "pass" || verdict === "healed") await options.saveHealed(recorder.result());
    } else {
      log(`Replayed ${replay.steps.length} steps with no model calls`);
    }

    evidenceCollector.stopCapture();
    await evidenceCollector.captureScreenshot("replay-final");
    let storageState: StorageState | undefined;
    if (verdict === "pass" || verdict === "healed") {
      storageState = await captureStorageState(context).catch(() => undefined);
    }
    const { artifacts, invariants } = await collectCaseArtifacts(page, evidenceCollector, {
      runId, testCase, environmentUrl, startTime, analyzeVisual: false, log,
    });

    return {
      verdict,
      durationMs: Date.now() - startTime,
      steps: steps as unknown as Array<Record<string, unknown>>,
      artifacts,
      healedSelectors,
      storageState,
      invariants,
      execution,
    };
  } catch (err) {
    if (isRunAbort(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    log(`REPLAY ERROR: ${msg}`);
    // Same shapes as the agent executor, so the runner's abort guards still apply
    const step = isProviderError(msg)
      ? { action: "ai_provider", expected: "Orbit's AI provider responds to executor requests", actual: `Orbit platform error (not an app failure): ${msg}` }
      : { action: "execution_setup", expected: "Browser launched and navigated", actual: `Execution failed: ${msg}` };
    return {
      verdict: isProviderError(msg) ? "environment_error" : "fail",
      durationMs: Date.now() - startTime,
      steps: [{ stepIndex: 0, ...step, status: "failed", durationMs: Date.now() - startTime }],
      artifacts: {},
      healedSelectors: [],
      execution,
    };
  } finally {
    if (instance) await closeBrowser(instance);
  }
}
