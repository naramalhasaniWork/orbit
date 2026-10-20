import { prisma } from "@/lib/db";
import { executeTestCase } from "@/services/execution/test-case-executor";
import type { TestCaseForExecution, TestCaseResult } from "@/services/execution/test-case-executor";
import { compileRecording } from "@/server/engine/replay/compile";
import { createActionRecorder } from "@/server/engine/replay/recorder";
import { decideExecution, shouldCompile, type ExecutionDecision } from "@/server/engine/replay/replay-policy";
import { buildEnvKey, stepsHash } from "@/server/engine/replay/script-keys";
import {
  findCurrentScript, markVerifiedByAgent, recentReplayDivergences, retireScript, saveScriptVersion,
} from "@/server/engine/replay/script-store";
import type { RecordedRun } from "@/server/engine/replay/types";
import { isRunAbort } from "@/services/execution/run-abort";
import type { CaseExecutor, CaseRunContext } from "./case-executor";
import { replayCase } from "./replay-case";

/**
 * Browser cases: replay the compiled script when the policy allows,
 * otherwise run the LLM agent, recording it so a pass can be compiled.
 * Without an environment id (ad-hoc runs) there is no script key, so the
 * agent runs exactly as before.
 */
export const browserExecutor: CaseExecutor = {
  kind: "browser",
  canRun: () => true,
  run: (testCase, ctx) => ctx.environmentId
    ? runWithReplay(testCase, ctx, ctx.environmentId)
    : executeTestCase(ctx.runId, testCase, ctx.environmentUrl, ctx.credentials, { storageState: ctx.storageState }),
};

interface ScriptKeys {
  envKey: string;
  stepsHash: string;
}

async function runWithReplay(
  testCase: TestCaseForExecution, ctx: CaseRunContext, environmentId: string
): Promise<TestCaseResult> {
  const keys: ScriptKeys = { envKey: buildEnvKey(environmentId, testCase.requiredRole), stepsHash: stepsHash(testCase.steps) };
  const decision = await decide(testCase.id, environmentId, keys);

  if (decision.use === "replay") {
    return replayCase(testCase, ctx, {
      script: decision.script,
      locatorTimeoutMs: decision.locatorTimeoutMs,
      saveHealed: (recorded) => compileAndSave(testCase, ctx, keys, recorded),
    });
  }

  const recorder = shouldCompile(decision) ? createActionRecorder(ctx.environmentUrl, ctx.credentials) : undefined;
  const result = await executeTestCase(
    ctx.runId, testCase, ctx.environmentUrl, ctx.credentials, { storageState: ctx.storageState, recorder }
  );
  const passed = result.verdict === "pass" || result.verdict === "healed";

  if (decision.reason === "reverify" && decision.script) {
    // A script the agent can no longer pass may be asserting too little: drop it and recompile
    await (passed ? markVerifiedByAgent(decision.script.id) : retireScript(decision.script.id)).catch(logStoreError);
  }
  if (passed && recorder) await compileAndSave(testCase, ctx, keys, recorder.result());
  return result;
}

/** Replay lookups must never break a run: on a store error, run the agent without compiling. */
async function decide(testCaseId: string, environmentId: string, keys: ScriptKeys): Promise<ExecutionDecision> {
  try {
    const [script, recentDivergences] = await Promise.all([
      findCurrentScript(testCaseId, keys.envKey),
      recentReplayDivergences(testCaseId, environmentId),
    ]);
    return decideExecution({
      script, stepsHash: keys.stepsHash, recentDivergences, now: new Date(), random: Math.random,
    });
  } catch (err) {
    logStoreError(err);
    return { use: "agent", reason: "store_unavailable" };
  }
}

async function compileAndSave(
  testCase: TestCaseForExecution, ctx: CaseRunContext, keys: ScriptKeys, recorded: RecordedRun
): Promise<void> {
  try {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: testCase.projectId }, select: { workspaceId: true },
    });
    const outcome = await compileRecording({
      steps: testCase.steps,
      recorded,
      billing: { workspaceId: project.workspaceId, projectId: testCase.projectId, runId: ctx.runId },
    });
    if (!outcome.compiled) {
      console.log(`[Replay:${testCase.id.slice(0, 8)}] Not compiled, stays agent-only: ${outcome.reason}`);
      return;
    }
    const version = await saveScriptVersion({
      projectId: testCase.projectId, testCaseId: testCase.id, envKey: keys.envKey,
      stepsHash: keys.stepsHash, actions: outcome.actions, sourceRunId: ctx.runId,
    });
    console.log(`[Replay:${testCase.id.slice(0, 8)}] Compiled script v${version} (${outcome.actions.length} steps)`);
  } catch (err) {
    logStoreError(err);
  }
}

/** Store and compile failures never affect the case, but run aborts (shutdown, budget, lock) propagate. */
function logStoreError(err: unknown): void {
  if (isRunAbort(err)) throw err;
  console.error("[Replay] Script store error (case unaffected):", err instanceof Error ? err.message : err);
}
