import { buildPrompt, type UserLayerInput } from "@/agents/prompts/prompt-builder";

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

export interface PlannerContext {
  systemMap: SystemMapExcerpt;
  userConfig: UserConfig;
  existingTestNames: string[];
  gitHistory: GitChange[];
  failurePatterns?: FailurePatternInput[];
  projectId: string;
  workspaceName?: string;
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
  } = context;

  const nodesStr = systemMap.nodes
    .map(
      (n) =>
        `  - [${n.type}] ${n.id}: ${n.name} (${n.filePath})${n.metadata?.authRequired ? " [AUTH]" : ""}${n.metadata?.httpMethod ? ` [${n.metadata.httpMethod}]` : ""}`
    )
    .join("\n");

  const edgesStr = systemMap.edges
    .map((e) => `  - ${e.source} --${e.relationship}--> ${e.target}`)
    .join("\n");

  const existingStr =
    existingTestNames.length > 0
      ? existingTestNames.map((n) => `  - ${n}`).join("\n")
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
You are the Planner agent. Your job is to generate a comprehensive, prioritized test plan based on the application's System Map.

## Chain of Thought — Follow This Process Exactly
1. **Identify critical user journeys.** Map the routes and components to real user flows: signup -> onboard -> core action -> success; login -> dashboard -> perform action -> logout; form fill -> validate -> submit -> confirm.
2. **Consider what can break at each step.** For each journey: auth failures, form validation errors, API timeouts, empty states, permission issues, missing data, concurrent access, expired sessions.
3. **Think adversarially.** Ask "What would a malicious or confused user do on this screen?" — XSS payloads in inputs, extremely long strings, special characters, rapid double-clicks on submit, navigating back mid-flow.
4. **Prioritize by risk.** Auth, payment, and data integrity tests score highest. Cosmetic or low-traffic features score lower.
5. **Avoid duplication.** Check existing test names below and do not regenerate tests that already exist.
6. **Generate test cases.** For each case, define clear, specific steps with concrete actions and verifiable expected outcomes.
7. **Consider regression.** If git history shows recent changes, generate tests targeting those areas with higher risk scores.
8. **Learn from failures.** If failure patterns are listed below, increase the priority and risk scores for tests covering those areas. Generate additional test cases targeting recurring failure categories.

## Test Types to Generate
- **User Journey Tests**: Multi-step browser flows simulating real user behavior
- **API Contract Tests**: Valid payload, invalid payload, and unauthenticated request per endpoint
- **Authentication Flow Tests**: Login, logout, token refresh, protected route access, session expiry
- **Form Validation Tests**: Required fields, format validation, length limits, valid submission
- **Edge Case Tests**: XSS, long strings, special chars, double-submit, empty states, boundary values
- **Regression Tests**: Tests specifically targeting recently changed code paths

## System Map
**Framework:** ${systemMap.framework}

**Nodes:**
${nodesStr}

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

## Output Schema
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
}

## Scoring Formula
priorityScore = (criticality * 0.4) + (risk * 0.35) + (coverageGap * 0.25)

## Mode-Specific Rules
- **full**: Generate comprehensive coverage across all journeys and endpoints.
- **smoke**: Limit to top 10 highest-priority tests covering critical paths only.
- **regression**: Focus exclusively on tests covering recently changed files. Mark all as type "regression".
- **targeted**: Generate tests only for the specified focus areas.

## Quality Checks
- Each test case MUST have a unique ID following "tc-{journey}-{description}".
- Steps must be specific: NOT "fill the form" but "Enter 'test@orbit.run' in the email field".
- Include selector hints when the System Map provides component info.
- Every test must have at least one assertion step.
- Estimate ~1 credit per test case for estimatedCredits.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "planner",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 8192,
  });

  return systemPrompt;
}
