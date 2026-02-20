/**
 * Journey Analyzer Sub-Agent Prompt
 * Analyzes complex multi-step user journeys and identifies edge cases.
 * Used by the planner when a journey has many nodes (>5) and needs
 * deeper analysis for comprehensive test coverage.
 */

import { buildPrompt } from "@/agents/prompts/prompt-builder";

interface JourneyNode {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  filePath: string;
  metadata?: Record<string, unknown>;
}

interface JourneyEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface JourneyAnalyzerContext {
  /** Name of the journey being analyzed */
  journeyName: string;
  /** Human-readable description */
  journeyDescription: string;
  /** Nodes in this journey */
  nodes: JourneyNode[];
  /** Edges connecting nodes */
  edges: JourneyEdge[];
  /** Framework of the target application */
  framework: string;
  /** Known failure patterns for this journey */
  failurePatterns?: Array<{
    pattern: string;
    category: string;
    occurrences: number;
  }>;
  /** Existing test names to avoid duplication */
  existingTestNames?: string[];
}

export function buildJourneyAnalyzerPrompt(
  context: JourneyAnalyzerContext
): string {
  const {
    journeyName,
    journeyDescription,
    nodes,
    edges,
    framework,
    failurePatterns,
    existingTestNames,
  } = context;

  const nodesStr = nodes
    .map(
      (n) =>
        `  - [${n.nodeType}] ${n.nodeId}: ${n.nodeName} (${n.filePath})${
          n.metadata?.authRequired ? " [AUTH]" : ""
        }${n.metadata?.httpMethod ? ` [${n.metadata.httpMethod}]` : ""}`
    )
    .join("\n");

  const edgesStr = edges
    .map((e) => `  - ${e.source} --${e.relationship}--> ${e.target}`)
    .join("\n");

  const failureStr = failurePatterns?.length
    ? failurePatterns
        .map((fp) => `  - [${fp.category}] (${fp.occurrences}x) ${fp.pattern}`)
        .join("\n")
    : "  (none)";

  const existingStr = existingTestNames?.length
    ? existingTestNames.map((n) => `  - ${n}`).join("\n")
    : "  (none)";

  const agentInstructions = `## Sub-Agent Role: Journey Analyzer
You are a specialist at analyzing complex multi-step user journeys. You break down a journey into testable scenarios, identify edge cases, find branching paths, and detect potential failure points.

## Journey: ${journeyName}
${journeyDescription}

## Framework: ${framework}

## Journey Graph
**Nodes (${nodes.length}):**
${nodesStr}

**Edges:**
${edgesStr}

## Known Failure Patterns
${failureStr}

## Existing Tests (do not duplicate)
${existingStr}

## Output Schema
Your response MUST be valid JSON:
{
  "scenarios": [
    {
      "name": "descriptive scenario name",
      "description": "what this scenario tests",
      "path": ["node-id-1", "node-id-2", "node-id-3"],
      "type": "happy-path | error-handling | edge-case | security | performance",
      "priority": 1-100,
      "steps": [
        {
          "action": "specific user action",
          "expected": "specific expected outcome",
          "nodeId": "node this step corresponds to"
        }
      ],
      "edgeCases": ["specific edge case descriptions"],
      "risks": ["what could go wrong"]
    }
  ],
  "branchingPoints": [
    {
      "nodeId": "node where paths diverge",
      "branches": ["description of each branch"],
      "testImplication": "why this branching matters for testing"
    }
  ],
  "coverageGaps": ["areas not covered by existing tests"],
  "summary": "Overall journey complexity assessment"
}

## Analysis Process
1. **Trace the happy path** — the most common successful flow through the journey.
2. **Identify branching points** — where user decisions or conditions create different paths.
3. **Find error states** — what happens when things go wrong at each step.
4. **Consider auth boundaries** — where auth is required, what happens if unauthenticated.
5. **Check data flow** — how data passes between nodes, where validation gaps exist.
6. **Map failure patterns** — correlate known failures to specific nodes.
7. **Prioritize by risk** — auth/payment/data paths score highest.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "planner",
    agentInstructions,
    maxOutputTokens: 2000,
  });

  return systemPrompt;
}
