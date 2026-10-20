import { z } from "zod";
import { prisma } from "@/lib/db";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { parseLlmJson } from "@/lib/utils/json-parse";
import { substituteCredentials } from "@/lib/utils/credentials";
import { safeFetch } from "@/lib/utils/ssrf";
import { isProviderError } from "@/services/execution/test-case-executor";
import type { TestCaseForExecution, TestCaseResult } from "@/services/execution/test-case-executor";
import { isBudgetExceeded } from "@/server/ai/errors";

// ============================================================
// API Test Executor
// ============================================================
// Executes api_contract test cases directly over HTTP — no browser,
// no per-step LLM loop. One LLM call translates the natural-language
// steps into a deterministic request plan, then plain fetch executes
// and asserts it. Orders of magnitude cheaper and faster than driving
// a browser at an API surface.

const RequestPlanSchema = z.object({
  requiresUi: z
    .boolean()
    .describe("True when the scenario genuinely needs a browser"),
  requests: z
    .array(
      z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
        path: z.string().describe("Path relative to the environment URL"),
        headers: z.record(z.string()).default({}),
        body: z.string().nullable().default(null),
        expectStatus: z
          .array(z.number().int())
          .min(1)
          .describe("Acceptable HTTP status codes"),
        expectBodyContains: z.string().nullable().default(null),
        description: z.string(),
      })
    )
    .default([]),
});

type RequestPlan = z.infer<typeof RequestPlanSchema>;

const REQUEST_TIMEOUT_MS = 15_000;

function buildTranslationPrompt(
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>
): string {
  const steps = testCase.steps
    .map((s, i) => `${i + 1}. ${s.action} — expect: ${s.expected}`)
    .join("\n");
  const credentialKeys = Object.keys(credentials);

  return `You translate an API contract test into concrete HTTP requests.

Application base URL: ${environmentUrl}
Test: ${testCase.name}
Steps:
${steps}

Available credentials (values provided at execution time, reference as {{credential:KEY}} in headers or body): ${credentialKeys.length > 0 ? credentialKeys.join(", ") : "none"}

Rules:
- Emit the minimal request sequence that verifies the contract described by the steps.
- For unauthenticated-access tests, send NO credentials and expect 401/403 (or a 3xx redirect to login).
- Never invent endpoints not implied by the steps; if the steps don't name a concrete endpoint or the scenario truly requires a browser (rendering, multi-page UI flow), set requiresUi: true and return no requests.
- expectStatus lists every acceptable status for the assertion.

Respond with ONLY JSON:
{"requiresUi": boolean, "requests": [{"method": "GET", "path": "/api/...", "headers": {}, "body": null, "expectStatus": [401, 403], "expectBodyContains": null, "description": "why this request"}]}`;
}

async function translateToRequestPlan(
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>,
  runId: string
): Promise<RequestPlan> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: testCase.projectId },
    select: { workspaceId: true },
  });

  const model = await getModelForTask("browser_execution", project.workspaceId);
  const result = await createTrackedCompletion(
    {
      model,
      systemPrompt: buildTranslationPrompt(testCase, environmentUrl, credentials),
      messages: [{ role: "user", content: "Produce the request plan." }],
      maxTokens: 1500,
      temperature: 0,
    },
    {
      workspaceId: project.workspaceId,
      projectId: testCase.projectId,
      runId,
      agentPhase: "executor",
    }
  );

  return RequestPlanSchema.parse(parseLlmJson(result.content));
}

/**
 * Execute an api_contract test case over HTTP.
 * Returns null when the plan says the scenario needs a browser —
 * the caller should fall back to browser execution.
 */
export async function executeApiTestCase(
  runId: string,
  testCase: TestCaseForExecution,
  environmentUrl: string,
  credentials: Record<string, string>
): Promise<TestCaseResult | null> {
  const startTime = Date.now();
  const log = (msg: string) =>
    console.log(`[ApiTest:${testCase.id.slice(0, 8)}] ${msg}`);

  let plan: RequestPlan;
  try {
    plan = await translateToRequestPlan(testCase, environmentUrl, credentials, runId);
  } catch (err) {
    if (isBudgetExceeded(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    log(`Translation failed: ${msg}`);
    if (isProviderError(msg)) {
      return {
        verdict: "environment_error",
        durationMs: Date.now() - startTime,
        steps: [{
          stepIndex: 0,
          action: "ai_provider",
          expected: "Orbit's AI provider responds to executor requests",
          actual: `Orbit platform error (not an app failure): ${msg}`,
          status: "failed",
          durationMs: Date.now() - startTime,
        }],
        artifacts: {},
        healedSelectors: [],
      };
    }
    // Translation failed for non-provider reasons — let the browser try
    return null;
  }

  if (plan.requiresUi || plan.requests.length === 0) {
    log("Plan requires UI — falling back to browser execution");
    return null;
  }

  const base = environmentUrl.replace(/\/$/, "");
  const stepResults: TestCaseResult["steps"] = [];
  let allPassed = true;

  for (let index = 0; index < plan.requests.length; index++) {
    const req = plan.requests[index];
    const stepStart = Date.now();
    const url = `${base}${req.path.startsWith("/") ? req.path : `/${req.path}`}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers ?? {})) {
      headers[k] = substituteCredentials(String(v), credentials);
    }
    const body = req.body ? substituteCredentials(req.body, credentials) : undefined;
    if (body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    let actual: string;
    let passed = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      // Environment URL + LLM-chosen path: SSRF-guarded, redirects reported (3xx) not followed
      const response = await safeFetch(
        url,
        { method: req.method, headers, body, signal: controller.signal },
        { followRedirects: false }
      );
      clearTimeout(timer);

      const statusOk = req.expectStatus.includes(response.status);
      let bodyOk = true;
      let bodyNote = "";
      if (req.expectBodyContains) {
        const text = await response.text();
        bodyOk = text.includes(req.expectBodyContains);
        bodyNote = bodyOk
          ? ""
          : `; body missing "${req.expectBodyContains}"`;
      }
      passed = statusOk && bodyOk;
      actual = `status ${response.status}${bodyNote}`;
    } catch (err) {
      actual = `request failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (!passed) allPassed = false;
    stepResults.push({
      stepIndex: index,
      action: `${req.method} ${req.path} — ${req.description}`,
      expected: `status in [${req.expectStatus.join(", ")}]${req.expectBodyContains ? ` and body contains "${req.expectBodyContains}"` : ""}`,
      actual,
      status: passed ? "passed" : "failed",
      durationMs: Date.now() - stepStart,
    });
    log(`${req.method} ${req.path} -> ${actual} (${passed ? "pass" : "FAIL"})`);
  }

  return {
    verdict: allPassed ? "pass" : "fail",
    durationMs: Date.now() - startTime,
    steps: stepResults,
    artifacts: {
      apiRequestPlan: JSON.stringify(plan.requests, null, 2),
    },
    healedSelectors: [],
  };
}
