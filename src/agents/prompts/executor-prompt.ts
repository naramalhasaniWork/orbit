import { getOperatorPrompt } from "@/agents/prompts/operator-layer";
import { EXECUTOR_RULES } from "@/agents/prompts/executor-rules";
import {
  CREDENTIAL_PLACEHOLDER_INSTRUCTIONS,
  describeCredentialPlaceholders,
  redactCredentials,
} from "@/lib/utils/credentials";

interface TestStep {
  action: string;
  expected: string;
  selectorHint?: string;
}

interface PageState {
  url: string;
  title: string;
  visibleText: string;
  interactiveElements: Array<{
    tag: string;
    text?: string;
    selector: string;
    type?: string;
    role?: string;
  }>;
}

interface TestingNoteInput {
  content: string;
  category: "context" | "instruction" | "known-issue" | "credential-hint";
}

export interface ExecutorContext {
  testCaseId: string;
  testCaseName: string;
  currentStepIndex: number;
  steps: TestStep[];
  pageState: PageState;
  screenshotDescription: string;
  previousActions: Array<{
    action: string;
    result: string;
  }>;
  testCredentials?: Record<string, string>;
  workspaceName?: string;
  testingNotes?: TestingNoteInput[];
  /** Tools from the workspace's connected MCP servers (formatToolsForPrompt) */
  mcpToolsPrompt?: string;
}

/**
 * The executor prompt in three parts, ordered from most to least stable so the
 * provider can cache the prefix:
 *  - rules: operator layer + static rules + action schema. Identical for every call.
 *  - testCase: workspace, test case, steps, credential placeholders, notes, MCP tools.
 *    Identical for every call within one test case.
 *  - turn: progress, page state and recent actions. Changes every call.
 */
export interface ExecutorPrompt {
  rules: string;
  testCase: string;
  turn: string;
}

const MAX_OUTPUT_TOKENS = 500;

/** Built once per process: the rules block must be byte-identical across calls. */
const RULES = `${getOperatorPrompt({ agentRole: "executor", maxOutputTokens: MAX_OUTPUT_TOKENS })}\n\n${EXECUTOR_RULES}`;

export function buildExecutorPrompt(context: ExecutorContext): ExecutorPrompt {
  const {
    testCaseId,
    testCaseName,
    currentStepIndex,
    steps,
    pageState,
    screenshotDescription,
    previousActions,
    testCredentials,
    testingNotes,
    mcpToolsPrompt,
    workspaceName,
  } = context;

  // Secret values never reach the model: it sees credential placeholders, and any value
  // that leaks in via page content, action history, plan steps or user notes is scrubbed
  // back to its placeholder.
  const scrub = (text: string) => redactCredentials(text, testCredentials);

  const stepsStr = scrub(
    steps
      .map(
        (s, i) => `  ${i + 1}. Action: ${s.action}${s.selectorHint ? ` (hint: ${s.selectorHint})` : ""}
     Expected: ${s.expected}`
      )
      .join("\n")
  );

  const notesStr =
    testingNotes && testingNotes.length > 0
      ? scrub(testingNotes.map((n) => `  - [${n.category}] ${n.content}`).join("\n"))
      : "";

  const testCase = `${workspaceName ? `## Workspace\nYou are operating on behalf of workspace "${workspaceName}".\n\n` : ""}## Test Case
- **ID:** ${testCaseId}
- **Name:** ${testCaseName}
- **Steps:** ${steps.length}

## Test Steps
${stepsStr}

## Test Credentials
You do not have access to the credential values, only to placeholders. ${CREDENTIAL_PLACEHOLDER_INSTRUCTIONS}
${describeCredentialPlaceholders(testCredentials)}
${notesStr ? `
## Project Testing Notes (from the user — high priority)
${notesStr}
Respect these notes. If an "instruction" note says to skip something, skip it. If a "known-issue" note describes a broken feature, expect it to be broken. If a "context" note gives navigation hints, use them.
` : ""}${mcpToolsPrompt ? `
${mcpToolsPrompt}
Use tool_call only for tools listed above and only when a step needs data or setup the browser cannot provide (e.g. reading a verification code, seeding a record). A tool call does not complete the current step; the result appears in Previous Actions.
` : ""}`;

  const current = steps[currentStepIndex];
  const elementsStr = scrub(
    pageState.interactiveElements
      .slice(0, 30)
      .map(
        (el) =>
          `  - <${el.tag}${el.role ? ` role="${el.role}"` : ""}${el.type ? ` type="${el.type}"` : ""}> "${el.text ?? ""}" -> ${el.selector}`
      )
      .join("\n")
  );
  const historyStr =
    previousActions.length > 0
      ? scrub(previousActions.map((a) => `  - Action: ${a.action} -> Result: ${a.result}`).join("\n"))
      : "  (none)";

  const turn = `## Progress
Step ${currentStepIndex + 1} of ${steps.length} is CURRENT${currentStepIndex > 0 ? ` (steps 1-${currentStepIndex} are DONE)` : ""}.
${current ? scrub(`Current step: ${current.action}${current.selectorHint ? ` (hint: ${current.selectorHint})` : ""}\nExpected: ${current.expected}`) : ""}

## Current Page State
- **URL:** ${scrub(pageState.url)}
- **Title:** ${scrub(pageState.title)}
- **Visible Text (excerpt):** ${scrub(pageState.visibleText.slice(0, 500))}

## Screenshot Description
${scrub(screenshotDescription)}

## Interactive Elements on Page
${elementsStr}

## Previous Actions in This Test
${historyStr}

Decide the next action.`;

  return { rules: RULES, testCase, turn };
}
