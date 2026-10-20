import { z } from "zod";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { parseLlmJson } from "@/lib/utils/json-parse";
import type { ReplayAssertion, StepSnapshot } from "./types";

/**
 * Turns a step's `expected` prose into a deterministic assertion, for steps
 * whose recorded action asserted nothing (e.g. a click). One cheap model
 * call covers every such step of a case, each with the page text captured
 * right after it. A proposed assertion is kept only if it already holds on
 * that captured page, so a hallucinated check can never be compiled.
 */

export interface StepToDerive {
  stepIndex: number;
  action: string;
  expected: string;
  snapshot: StepSnapshot;
}

export interface DeriveBilling {
  workspaceId: string;
  projectId: string;
  runId?: string;
}

const DerivedSchema = z.object({
  assertions: z.array(z.object({
    stepIndex: z.number().int(),
    type: z.enum(["text_contains", "url_matches", "visible"]),
    expected: z.string(),
  }).nullable()),
});

const MIN_EXPECTED_LENGTH = 3;

const SYSTEM_PROMPT = [
  "You convert end-to-end test expectations into deterministic browser assertions.",
  "For each step you get what was done, what was expected, and the page URL and visible text right after the step.",
  "Pick ONE assertion per step that proves the expectation, quoting text exactly as it appears on the page:",
  '  {"stepIndex": n, "type": "text_contains", "expected": "<exact visible text>"}',
  '  {"stepIndex": n, "type": "url_matches", "expected": "<distinctive URL path fragment>"}',
  '  {"stepIndex": n, "type": "visible", "expected": "<exact visible text of the element>"}',
  "Use null for a step when nothing on the page proves the expectation.",
  'Output ONLY JSON: {"assertions": [ ... ]}. No markdown, no prose.',
].join("\n");

export async function deriveAssertions(
  steps: StepToDerive[], billing: DeriveBilling
): Promise<Map<number, ReplayAssertion>> {
  const derived = new Map<number, ReplayAssertion>();
  if (steps.length === 0) return derived;

  const model = await getModelForTask("assertion_derivation");
  const result = await createTrackedCompletion(
    {
      model,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(steps.map(describe), null, 2) }],
      maxTokens: 150 + steps.length * 60,
      temperature: 0,
    },
    { ...billing, agentPhase: "executor" }
  );

  let raw: unknown;
  try {
    raw = parseLlmJson(result.content);
  } catch {
    return derived;
  }
  const parsed = DerivedSchema.safeParse(raw);
  if (!parsed.success) return derived;

  for (const proposal of parsed.data.assertions) {
    const step = proposal && steps.find((s) => s.stepIndex === proposal.stepIndex);
    if (!proposal || !step) continue;
    const assertion: ReplayAssertion = { type: proposal.type, expected: proposal.expected.trim() };
    if (assertionHoldsOnSnapshot(assertion, step.snapshot)) derived.set(step.stepIndex, assertion);
  }
  return derived;
}

function describe(step: StepToDerive) {
  return {
    stepIndex: step.stepIndex,
    did: step.action,
    expected: step.expected,
    url: step.snapshot.url,
    title: step.snapshot.title,
    pageText: step.snapshot.visibleText,
  };
}

/** Deterministic check of a derived assertion against the page captured after its step. */
export function assertionHoldsOnSnapshot(assertion: ReplayAssertion, snapshot: StepSnapshot): boolean {
  const expected = assertion.expected.trim();
  // Scrubbed credential text differs on the live page, so it can never be asserted
  if (expected.length < MIN_EXPECTED_LENGTH || expected.includes("{{credential:")) return false;
  switch (assertion.type) {
    case "text_contains":
    case "visible":
      return snapshot.visibleText.includes(expected);
    case "url_matches":
      return expected !== "/" && snapshot.url.includes(expected);
    default:
      return false;
  }
}
