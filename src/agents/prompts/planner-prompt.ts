import { getOperatorPrompt } from "@/agents/prompts/operator-layer";

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

export interface PlannerContext {
  systemMap: SystemMapExcerpt;
  userConfig: UserConfig;
  existingTestNames: string[];
  gitHistory: GitChange[];
  projectId: string;
}

const OUTPUT_SCHEMA = `{
  "projectId": "string",
  "version": "number (integer, start at 1)",
  "generatedAt": "string (ISO 8601 timestamp)",
  "testCases": [
    {
      "id": "string (unique, e.g. 'tc-auth-login-happy')",
      "name": "string (short descriptive name)",
      "type": "journey | api_contract | auth | form_validation | edge_case | regression",
      "journey": "string (user journey name, e.g. 'authentication')",
      "priorityScore": "number (0-100)",
      "criticality": "number (0-100, business impact)",
      "risk": "number (0-100, likelihood of breakage)",
      "coverageGap": "number (0-100, coverage this adds)",
      "steps": [
        {
          "action": "string (specific action to perform)",
          "expected": "string (expected outcome)",
          "selectorHint": "string (optional CSS/a11y selector hint)"
        }
      ],
      "rationale": "string (why this test exists)",
      "edgeCases": ["string (edge cases to consider)"]
    }
  ],
  "metadata": {
    "totalTests": "number",
    "coverageByJourney": { "journey_name": "number (count)" },
    "coverageByType": { "type_name": "number (count)" },
    "estimatedCredits": "number"
  }
}`;

export function buildPlannerPrompt(
  context: PlannerContext,
  userContext?: string
): string {
  const {
    systemMap,
    userConfig,
    existingTestNames,
    gitHistory,
    projectId,
  } = context;

  const operatorPrompt = getOperatorPrompt();

  const nodesStr = systemMap.nodes
    .map(
      (n) =>
        `  - [${n.type}] ${n.id}: ${n.name} (${n.filePath})${n.metadata?.authRequired ? " [AUTH]" : ""}`
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
          .map((g) => `  - [${g.changeType}] ${g.filePath}`)
          .join("\n")
      : "  (no recent changes)";

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

  return `${operatorPrompt}

## Agent Role: Planner
You are the Planner agent. Your job is to generate a comprehensive, prioritized test plan based on the application's System Map.

## Chain of Thought — Follow This Process
1. **Identify critical user journeys.** Map the routes and components to real user flows (login, signup, dashboard, settings, etc.).
2. **Consider breakpoints.** For each journey, think about where things can go wrong: auth failures, form validation errors, API timeouts, empty states, permission issues.
3. **Prioritize by risk.** Tests that cover auth, payment, and data integrity should score highest. Tests for cosmetic or low-traffic features score lower.
4. **Avoid duplication.** Check existing test names and do not regenerate tests that already exist.
5. **Generate test cases.** For each case, define clear steps with specific actions and expected outcomes.
6. **Consider regression.** If git history shows recent changes, generate tests targeting those areas.

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

## Output Schema
Your response MUST be valid JSON matching this exact schema:
${OUTPUT_SCHEMA}

Use projectId: "${projectId}"

## Rules
- Each test case must have a unique ID following the pattern "tc-{journey}-{description}".
- Steps must be specific and actionable — not vague instructions.
- Include selector hints when the System Map provides enough info.
- priorityScore = (criticality * 0.4) + (risk * 0.35) + (coverageGap * 0.25).
- Estimate ~1 credit per test case for the estimatedCredits field.
- For "smoke" mode, limit to the top 10 highest-priority tests.
- For "regression" mode, focus on tests covering recently changed files.
- For "targeted" mode, focus on the specified focus areas only.${userContext ? `

## User-Provided Context
${userContext}` : ""}`;
}
