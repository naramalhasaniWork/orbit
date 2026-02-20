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

function buildDomainHeuristics(framework: string): string {
  const heuristics: string[] = [];

  heuristics.push(`### E-Commerce Patterns (if applicable)
- Cart: Add to cart -> update quantity -> remove item -> verify totals recalculate
- Checkout: Cart -> shipping address -> shipping method -> payment -> confirmation
- Payment: NEVER submit real payment info. Use test card 4242424242424242.
- Inventory: What happens when item goes out of stock during checkout?
- Coupons: Valid code, expired code, already-used code, invalid format`);

  heuristics.push(`### Form Flow Patterns
- Multi-step forms: Can the user skip steps? Go back without losing data? Submit from any step?
- Validation timing: Does validation happen on blur, on submit, or in real-time?
- Error recovery: After a validation error, can the user correct and resubmit without re-entering everything?
- File uploads: File too large, wrong type, upload interrupted, multiple files
- Autosave: Is form progress saved? What happens on accidental page close?`);

  heuristics.push(`### Auth-Protected Journey Patterns
- Session expiry mid-journey: Does the app save progress and resume after re-login?
- Permission boundaries: What if user's role changes mid-journey (admin demoted)?
- Token refresh: Does a long-running journey survive a token refresh?`);

  if (framework.toLowerCase().includes("next")) {
    heuristics.push(`### Next.js-Specific Journey Considerations
- Server Component data fetching: Do loading states show correctly during navigation?
- Client-side navigation vs full page reload: Does the journey work with both?
- Route groups: Do layout transitions work correctly when navigating between route groups?
- Parallel routes: Are modals and intercepting routes handled correctly?`);
  }

  return heuristics.join("\n\n");
}

function buildFewShotScenario(): string {
  return `## Example — Well-Formed Scenario
{
  "name": "Checkout with expired session mid-payment",
  "description": "Tests that a user's checkout progress is preserved when their session expires during the payment step",
  "path": ["route:/cart", "route:/checkout/shipping", "route:/checkout/payment"],
  "type": "edge-case",
  "priority": 88,
  "confidence": 82,
  "steps": [
    { "action": "Navigate to /cart with items already added", "expected": "Cart page shows items with correct totals", "nodeId": "route:/cart" },
    { "action": "Click 'Proceed to Checkout'", "expected": "Shipping form appears", "nodeId": "route:/checkout/shipping" },
    { "action": "Fill shipping address and click Continue", "expected": "Payment form appears", "nodeId": "route:/checkout/payment" },
    { "action": "Simulate session expiry (clear auth cookies)", "expected": "App detects expired session", "nodeId": "route:/checkout/payment" },
    { "action": "Re-authenticate with test credentials", "expected": "User is returned to payment step with shipping info preserved", "nodeId": "route:/checkout/payment" }
  ],
  "edgeCases": ["Session expires between payment submission and confirmation", "Multiple tabs with same session"],
  "risks": ["Cart data lost on session expiry", "Payment submitted without valid session", "Shipping info must be re-entered"]
}`;
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

  const domainHeuristics = buildDomainHeuristics(framework);

  const agentInstructions = `## Sub-Agent Role: Journey Analyzer
You break down complex multi-step user journeys into testable scenarios, identify edge cases, find branching paths, and detect potential failure points. You think like a QA lead who has seen every way a user flow can break.

## Chain of Thought — Follow This Process
1. **Trace the happy path.** What is the most common successful flow through this journey?
2. **Identify branching points.** Where do user decisions or conditions create different paths? (e.g., "logged in vs guest", "valid vs invalid input", "item in stock vs out of stock")
3. **Find error states.** What happens when things go wrong at each step? Network error, validation failure, auth redirect, server error.
4. **Consider auth boundaries.** Where is auth required? What happens if unauthenticated? What about permission levels?
5. **Check data flow.** How does data pass between nodes? Where could data be lost, corrupted, or stale?
6. **Map failure patterns.** Correlate known failures (below) to specific nodes in this journey.
7. **Adversarial thinking.** What would a confused or malicious user do at each step?
8. **Prioritize by risk.** Auth/payment/data paths score highest. Cosmetic paths score lowest.

## Anti-Hallucination Rules
- Every scenario's path must only reference node IDs that exist in the journey graph below.
- Do not create scenarios for features not represented in the nodes. If a feature seems implied but has no node, note it as a coverage gap instead.
- Every step's nodeId must be a valid node ID from the graph.
- Only suggest tests with confidence >= 70. Mark uncertain scenarios explicitly.

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

${domainHeuristics}

${buildFewShotScenario()}

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
      "confidence": 0-100,
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
}`;

  const { systemPrompt } = buildPrompt({
    agentRole: "planner",
    agentInstructions,
    maxOutputTokens: 2000,
  });

  return systemPrompt;
}
