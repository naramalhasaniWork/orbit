/**
 * Visual Analyzer Sub-Agent Prompt
 * Analyzes screenshots for visual regressions and brand consistency.
 * Used by the reporter when comparing test run screenshots.
 */

import { buildPrompt } from "@/agents/prompts/prompt-builder";

export interface VisualAnalyzerContext {
  /** Description of the current screenshot */
  screenshotDescription: string;
  /** URL of the page in the screenshot */
  pageUrl: string;
  /** What the page should look like (from test case expected outcome) */
  expectedAppearance: string;
  /** Baseline screenshot description (if available) */
  baselineDescription?: string;
  /** Key UI elements that should be visible */
  expectedElements?: string[];
  /** Brand guidelines (colors, fonts, spacing) */
  brandGuidelines?: {
    primaryColor?: string;
    fontFamily?: string;
    spacing?: string;
  };
  /** Device/viewport context */
  viewport?: {
    width: number;
    height: number;
    deviceType: "desktop" | "tablet" | "mobile";
  };
}

export function buildVisualAnalyzerPrompt(
  context: VisualAnalyzerContext
): string {
  const {
    screenshotDescription,
    pageUrl,
    expectedAppearance,
    baselineDescription,
    expectedElements,
    brandGuidelines,
    viewport,
  } = context;

  const elementsStr = expectedElements?.length
    ? expectedElements.map((el) => `  - ${el}`).join("\n")
    : "  (none specified)";

  const brandStr = brandGuidelines
    ? [
        brandGuidelines.primaryColor
          ? `  - Primary color: ${brandGuidelines.primaryColor}`
          : null,
        brandGuidelines.fontFamily
          ? `  - Font family: ${brandGuidelines.fontFamily}`
          : null,
        brandGuidelines.spacing
          ? `  - Spacing: ${brandGuidelines.spacing}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "  (none provided)";

  const viewportStr = viewport
    ? `${viewport.width}x${viewport.height} (${viewport.deviceType})`
    : "unknown";

  const baselineSection = baselineDescription
    ? `\n## Baseline (Previous Known-Good State)\n${baselineDescription}`
    : "";

  const agentInstructions = `## Sub-Agent Role: Visual Analyzer
You analyze screenshot descriptions to detect visual regressions, layout issues, and brand inconsistencies.

## Page Under Analysis
- **URL:** ${pageUrl}
- **Viewport:** ${viewportStr}

## Current Screenshot
${screenshotDescription}
${baselineSection}

## Expected Appearance
${expectedAppearance}

## Expected UI Elements
${elementsStr}

## Brand Guidelines
${brandStr}

## Output Schema
Your response MUST be valid JSON:
{
  "overallStatus": "pass | fail | warning",
  "issues": [
    {
      "type": "layout | color | typography | spacing | missing-element | extra-element | responsive | accessibility",
      "severity": "critical | high | medium | low",
      "description": "What is wrong",
      "location": "Where on the page (e.g. 'top navigation', 'main content area')",
      "expected": "What was expected",
      "actual": "What was observed"
    }
  ],
  "missingElements": ["elements that should be visible but are not"],
  "accessibilityFlags": ["potential a11y issues spotted"],
  "summary": "One-line visual analysis summary"
}

## Analysis Checklist
1. **Layout:** Are elements properly aligned? Is the grid/flexbox working correctly?
2. **Responsiveness:** Does the layout fit the viewport? No horizontal scrollbar on mobile?
3. **Missing elements:** Are all expected elements visible?
4. **Text:** Is text readable? No overflow, truncation, or overlapping?
5. **Colors:** Do colors match brand guidelines?
6. **Spacing:** Is spacing consistent with brand guidelines?
7. **Accessibility:** Sufficient contrast? Interactive elements have visible focus states?
8. **Regression:** If baseline exists, what changed? Is the change intentional?`;

  const { systemPrompt } = buildPrompt({
    agentRole: "reporter",
    agentInstructions,
    maxOutputTokens: 500,
  });

  return systemPrompt;
}
