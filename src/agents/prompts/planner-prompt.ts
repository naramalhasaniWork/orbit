import { buildPrompt, type UserLayerInput } from "@/agents/prompts/prompt-builder";
import type { OperationsMap } from "@/agents/schemas/operations-map";

interface SystemMapExcerpt {
  framework: string;
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    filePath: string;
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
  }>;
}

interface UserConfig {
  focusAreas?: string[];
  excludePaths?: string[];
  priorityJourneys?: string[];
  testMode: "full" | "smoke" | "regression" | "targeted";
  maxTestCases?: number;
}

interface GitChange {
  filePath: string;
  changeType: "added" | "modified" | "deleted";
  diff?: string;
}

interface FailurePatternInput {
  pattern: string;
  category: string;
  occurrences: number;
}

interface TestingNoteInput {
  content: string;
  category: "context" | "instruction" | "known-issue" | "credential-hint";
}

export interface PlannerContext {
  systemMap: SystemMapExcerpt;
  userConfig: UserConfig;
  existingTestNames: string[];
  gitHistory: GitChange[];
  failurePatterns?: FailurePatternInput[];
  projectId: string;
  workspaceName?: string;
  operationsMap?: OperationsMap;
  testingNotes?: TestingNoteInput[];
}

// ~4 chars/token avg; keep prompt under ~120k tokens for the system map portion
const MAX_NODE_CHARS = 300_000;
const MAX_EDGE_CHARS = 100_000;

// Priority tiers: routes/endpoints first, then auth/forms, then the rest
const NODE_PRIORITY: Record<string, number> = {
  route: 0,
  endpoint: 0,
  middleware: 1,
  component: 2,
  model: 3,
  utility: 4,
  config: 5,
};

interface TruncatedMap {
  nodes: SystemMapExcerpt["nodes"];
  edges: SystemMapExcerpt["edges"];
  truncated: boolean;
}

function truncateSystemMap(map: SystemMapExcerpt): TruncatedMap {
  if (map.nodes.length === 0) {
    return { nodes: [], edges: [], truncated: false };
  }

  // Sort nodes by priority: routes/endpoints first, then auth-required, then by type
  const sorted = [...map.nodes].sort((a, b) => {
    const pa = NODE_PRIORITY[a.type] ?? 3;
    const pb = NODE_PRIORITY[b.type] ?? 3;
    if (pa !== pb) return pa - pb;
    const aAuth = a.metadata?.authRequired ? 0 : 1;
    const bAuth = b.metadata?.authRequired ? 0 : 1;
    return aAuth - bAuth;
  });

  // Keep adding nodes until we hit the char budget
  const kept: typeof sorted = [];
  let chars = 0;
  for (const node of sorted) {
    const line = `  - [${node.type}] ${node.id}: ${node.name} (${node.filePath})`;
    if (chars + line.length > MAX_NODE_CHARS) break;
    chars += line.length;
    kept.push(node);
  }

  const keptIds = new Set(kept.map((n) => n.id));

  // Filter edges to only reference kept nodes, within char budget
  const filteredEdges: typeof map.edges = [];
  let edgeChars = 0;
  for (const edge of map.edges) {
    if (!keptIds.has(edge.source) || !keptIds.has(edge.target)) continue;
    const line = `  - ${edge.source} --${edge.relationship}--> ${edge.target}`;
    if (edgeChars + line.length > MAX_EDGE_CHARS) break;
    edgeChars += line.length;
    filteredEdges.push(edge);
  }

  return {
    nodes: kept,
    edges: filteredEdges,
    truncated: kept.length < map.nodes.length,
  };
}

function buildAdversarialThinking(): string {
  return `## Adversarial Thinking — What Would Break This?
For every user-facing form, input, or action, consider:
- **Empty/null inputs:** What happens when required fields are left blank?
- **Boundary values:** 0, -1, MAX_INT, extremely long strings (10,000+ chars), single character
- **Special characters:** XSS payloads, SQL injection strings, path traversal payloads
- **Unicode edge cases:** RTL text, emoji, zero-width characters, homoglyph attacks (e.g., Cyrillic "а" vs Latin "a")
- **Double submission:** What happens if the user clicks Submit twice rapidly?
- **Back button abuse:** Submit form -> press back -> submit again. Is idempotency handled?
- **Expired sessions:** What happens when a session expires mid-flow? Does the app save progress or lose data?
- **Concurrent access:** Two users editing the same resource simultaneously
- **Permission escalation:** Can a regular user access admin-only routes by changing the URL?
- **Rate limiting:** What happens with 100 rapid requests to the same endpoint?`;
}

function buildTestingNotesSection(notes?: TestingNoteInput[]): string {
  if (!notes || notes.length === 0) return "";

  const categoryLabels: Record<string, string> = {
    context: "Context",
    instruction: "Instruction",
    "known-issue": "Known Issue",
    "credential-hint": "Credential Hint",
  };

  const formatted = notes
    .map((n) => `  - [${categoryLabels[n.category] ?? "Note"}] ${n.content}`)
    .join("\n");

  return `
## Project Testing Notes (from the user)
The project owner has provided these notes. Treat them as high-priority context:
${formatted}

**Rules for interpreting notes:**
- "Instruction" notes override default behavior (e.g., "skip login tests" means do NOT generate login tests)
- "Known Issue" notes should be excluded from test failure expectations (don't test broken features unless the note says to)
- "Context" notes provide information the system map might not capture (e.g., "admin panel is at /admin")
- "Credential Hint" notes inform which credentials or roles are available
`;
}

function buildOperationsMapSection(operationsMap?: OperationsMap): string {
  if (!operationsMap || operationsMap.operations.length === 0) return "";

  const opsStr = operationsMap.operations
    .map((op) => `  - [${op.type}] ${op.id}: ${op.name} (entry: ${op.entryPoint}, inputs: ${op.requiredInputs.join(", ") || "none"}, outputs: ${op.producedOutputs.join(", ") || "none"})`)
    .join("\n");

  const flowsStr = operationsMap.flows
    .map((f) => `  - ${f.criticalPath ? "[CRITICAL] " : ""}${f.id}: ${f.name} — ${f.operations.join(" → ")}`)
    .join("\n");

  const depsStr = operationsMap.dependencies
    .map((d) => `  - ${d.operationId} depends on [${d.dependsOn.join(", ")}]: ${d.reason}`)
    .join("\n");

  return `
## Operations Map (dependency-aware test ordering)
The following business operations and their dependencies have been identified. Use this to:
1. **Order tests by dependency chain** — test prerequisite operations before dependent ones (e.g., "Create Invoice" before "Submit Invoice for Approval").
2. **Create flow-based test sequences** — for each critical flow, generate an end-to-end journey test that walks through the operations in order.
3. **Boost critical path scores** — operations in critical flows should have higher criticality and priorityScore values.
4. **Test dependency violations** — generate edge case tests that attempt dependent operations without their prerequisites (e.g., submit without creating first).

**Operations (${operationsMap.metadata.totalOperations} total):**
${opsStr}

**Flows (${operationsMap.metadata.totalFlows} total, ${operationsMap.metadata.criticalFlows} critical):**
${flowsStr}

**Dependencies (max depth: ${operationsMap.metadata.maxDependencyDepth}):**
${depsStr || "  (none)"}`;
}

function buildFewShotExample(): string {
  return `## Example — Well-Formed Test Case
{
  "id": "tc-auth-login-valid-credentials",
  "name": "Login with valid email and password",
  "type": "auth",
  "journey": "authentication",
  "priorityScore": 95,
  "criticality": 100,
  "risk": 90,
  "coverageGap": 95,
  "confidence": 95,
  "steps": [
    { "action": "Navigate to /login", "expected": "Login page loads with email and password fields visible", "selectorHint": null },
    { "action": "Enter 'testuser@orbit.run' in the email input", "expected": "Email field shows 'testuser@orbit.run'", "selectorHint": "input[name='email']" },
    { "action": "Enter 'TestPassword123!' in the password input", "expected": "Password field shows masked characters", "selectorHint": "input[name='password']" },
    { "action": "Click the 'Sign In' button", "expected": "Form submits, loading indicator appears", "selectorHint": "button[type='submit']" },
    { "action": "Wait for navigation to complete", "expected": "URL changes to /dashboard, page title contains 'Dashboard'", "selectorHint": null }
  ],
  "rationale": "Login is the gateway to the entire application. A broken login blocks all authenticated functionality. This test verifies the happy path with valid credentials.",
  "edgeCases": ["Login with email containing '+' character", "Login immediately after password reset", "Login on mobile viewport"]
}`;
}

function buildOutputSchema(projectId: string): string {
  return `## Output Schema
Your response MUST be valid JSON matching this exact structure:
{
  "projectId": "${projectId}",
  "version": 1,
  "generatedAt": "ISO 8601 timestamp",
  "testCases": [{
    "id": "tc-{journey}-{description}",
    "name": "Short descriptive name",
    "type": "journey | api_contract | auth | form_validation | edge_case | regression",
    "journey": "Journey name (e.g. 'authentication', 'checkout')",
    "priorityScore": 0-100,
    "criticality": 0-100,
    "risk": 0-100,
    "coverageGap": 0-100,
    "confidence": 0-100,
    "requiredRole": "User role needed (e.g. 'admin', 'user', 'manager'). Omit for unauthenticated flows.",
    "steps": [{
      "action": "Specific action (e.g. 'Click the Sign Up button in the top nav')",
      "expected": "Specific expected outcome (e.g. 'Registration form appears with email, password, and name fields')",
      "selectorHint": "Optional CSS/aria selector (e.g. 'button[data-testid=signup]')"
    }],
    "rationale": "Why this test exists and what risk it mitigates",
    "edgeCases": ["Specific edge cases to consider"]
  }],
  "metadata": {
    "totalTests": "number",
    "coverageByJourney": { "journey_name": "count" },
    "coverageByType": { "type_name": "count" },
    "estimatedCredits": "number"
  }
}`;
}

export function buildPlannerPrompt(
  context: PlannerContext,
  userLayer?: UserLayerInput
): string {
  const {
    systemMap,
    userConfig,
    existingTestNames,
    gitHistory,
    failurePatterns,
    projectId,
    operationsMap,
  } = context;

  const truncatedMap = truncateSystemMap(systemMap);

  const nodesStr = truncatedMap.nodes
    .map((n) => {
      const uiElements = n.metadata?.uiElements as
        | Array<{
            tag: string;
            text?: string;
            type?: string;
            name?: string;
          }>
        | undefined;
      const uiStr = uiElements?.length
        ? ` [UI: ${uiElements
            .slice(0, 3)
            .map(
              (el) =>
                `<${el.tag}${el.type ? ` type="${el.type}"` : ""}${el.name ? ` name="${el.name}"` : ""}${el.text ? ` "${el.text}"` : ""}`
            )
            .join(", ")}${uiElements.length > 3 ? ` +${uiElements.length - 3} more` : ""}]`
        : "";
      return `  - [${n.type}] ${n.id}: ${n.name} (${n.filePath})${n.metadata?.authRequired ? " [AUTH]" : ""}${n.metadata?.httpMethod ? ` [${n.metadata.httpMethod}]` : ""}${uiStr}`;
    })
    .join("\n");

  const edgesStr = truncatedMap.edges
    .map((e) => `  - ${e.source} --${e.relationship}--> ${e.target}`)
    .join("\n");

  const truncationNote = truncatedMap.truncated
    ? `\n  (Showing ${truncatedMap.nodes.length} of ${systemMap.nodes.length} nodes, prioritized by testability)`
    : "";

  const cappedExistingNames = existingTestNames.slice(0, 200);
  const existingStr =
    cappedExistingNames.length > 0
      ? cappedExistingNames.map((n) => `  - ${n}`).join("\n") +
        (existingTestNames.length > 200 ? `\n  ... and ${existingTestNames.length - 200} more` : "")
      : "  (none)";

  const gitStr =
    gitHistory.length > 0
      ? gitHistory
          .map((g) => `  - [${g.changeType}] ${g.filePath}${g.diff ? `\n    ${g.diff.slice(0, 200)}` : ""}`)
          .join("\n")
      : "  (no recent changes)";

  const failurePatternsStr =
    failurePatterns && failurePatterns.length > 0
      ? failurePatterns
          .map((fp) => `  - [${fp.category}] (${fp.occurrences}x) ${fp.pattern}`)
          .join("\n")
      : "  (none)";

  const operationsMapStr = buildOperationsMapSection(operationsMap);
  const testingNotesStr = buildTestingNotesSection(context.testingNotes);

  const configStr = [
    `- Test mode: ${userConfig.testMode}`,
    userConfig.focusAreas?.length
      ? `- Focus areas: ${userConfig.focusAreas.join(", ")}`
      : null,
    userConfig.excludePaths?.length
      ? `- Exclude paths: ${userConfig.excludePaths.join(", ")}`
      : null,
    userConfig.priorityJourneys?.length
      ? `- Priority journeys: ${userConfig.priorityJourneys.join(", ")}`
      : null,
    userConfig.maxTestCases
      ? `- Max test cases: ${userConfig.maxTestCases}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const agentInstructions = `## Agent Role: Planner
You are the Planner agent. Your job is to generate a comprehensive, prioritized test plan based on the application's System Map. You think like a senior QA engineer who has seen every way software can break.

## Chain of Thought — Follow This Process Exactly
1. **Map critical user journeys.** Trace routes and components to real user flows: signup -> onboard -> core action -> success; login -> dashboard -> action -> logout; form fill -> validate -> submit -> confirm.
2. **Assess what can break at each step.** For each journey: auth failures, form validation errors, API timeouts, empty states, permission issues, missing data, concurrent access, expired sessions, network failures.
3. **Think adversarially.** For every input and action, ask: "What would a malicious or confused user do here?" See the adversarial thinking section below.
4. **Prioritize by risk and impact.** Auth, payment, and data integrity score highest. Cosmetic or low-traffic features score lower. Recently changed code scores higher (regression risk).
5. **Deduplicate.** Check existing test names below. Do not regenerate tests that already exist. If an existing test partially covers a scenario, create a complementary test covering the gap.
6. **Generate test cases.** For each case: clear, specific steps with concrete actions, concrete expected outcomes, and selector hints when available. No vague steps.
7. **Detect user roles.** Analyze the System Map for role-based routes (e.g. admin panel, user dashboard, manager views), auth middleware with role checks, and different user types. Set the "requiredRole" field for each test to the role needed (e.g. "admin", "user", "manager"). Omit for unauthenticated tests. Group related tests by role so they can share credentials.
8. **Regression targeting.** If git history shows recent changes, generate tests targeting those exact code paths with elevated risk scores.
9. **Learn from failures.** If failure patterns are listed, increase priority/risk for tests covering those areas. Create additional tests specifically targeting recurring failure categories.

## Anti-Hallucination Rules
- NEVER invent test cases for features not present in the System Map. Every test must trace back to at least one node.
- NEVER assume endpoints or routes exist that are not in the nodes list. If a journey seems incomplete (e.g., no API endpoint for a form submission), note the gap in the test rationale but do not fabricate the endpoint.
- Every selector hint must reference a component or element type that exists in the System Map nodes.
- If confidence in a test case is below 70 (e.g., the feature is ambiguously defined), include it only if it covers a critical path (auth/payment/data). Otherwise omit.
- When component nodes include uiElements metadata, use these to generate precise selector hints and form field validation tests. This is ground-truth data from the source code — prefer it over guessing.

${buildAdversarialThinking()}

## Test Types to Generate
- **User Journey Tests**: Multi-step browser flows simulating real user behavior end-to-end
- **API Contract Tests**: Valid payload, invalid payload, missing auth, and malformed request per endpoint
- **Authentication Flow Tests**: Login, logout, token refresh, protected route access, session expiry, role-based access
- **Form Validation Tests**: Required fields, format validation, length limits, XSS payloads, valid submission, error state display
- **Edge Case Tests**: Empty states, boundary values, double-submit, back-button navigation, concurrent modifications
- **Regression Tests**: Tests specifically targeting recently changed code paths
- **Visual/UI Tests**: When component nodes include UI elements (buttons, forms, inputs), generate tests that verify element presence, correct labels, form field validation, and accessibility attributes

## System Map
**Framework:** ${systemMap.framework}

**Nodes:**
${nodesStr}${truncationNote}

**Edges:**
${edgesStr}

## Configuration
${configStr}

## Existing Tests (do not duplicate)
${existingStr}

## Recent Git Changes
${gitStr}

## Known Failure Patterns (prioritize testing these areas)
${failurePatternsStr}
${testingNotesStr}${operationsMapStr}
${buildFewShotExample()}

${buildOutputSchema(projectId)}

## Scoring Formula
priorityScore = (criticality * 0.4) + (risk * 0.35) + (coverageGap * 0.25)

## Mode-Specific Rules
- **full**: Generate comprehensive coverage across all journeys and endpoints. Aim for >= 3 tests per critical journey.
- **smoke**: Limit to top 10 highest-priority tests covering critical paths only. One happy-path test per core journey.
- **regression**: Focus exclusively on tests covering recently changed files. Mark all as type "regression". Every changed file should have at least one test.
- **targeted**: Generate tests only for the specified focus areas. Ignore nodes outside focus areas unless they are direct dependencies.

## Quality Checks Before Outputting
- Each test case MUST have a unique ID following "tc-{journey}-{description}".
- Steps must be specific: NOT "fill the form" but "Enter 'test@orbit.run' in the email field".
- Include selector hints when the System Map provides component info.
- Every test must have at least one assertion step with a concrete expected outcome.
- Estimate ~1 credit per test case for estimatedCredits.
- Verify: does every test trace back to at least one System Map node? If not, remove it.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "planner",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 8192,
  });

  return systemPrompt;
}
