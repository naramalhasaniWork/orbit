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

function buildViewportHeuristics(deviceType?: string): string {
  if (!deviceType) return "";

  const heuristics: Record<string, string> = {
    mobile: `### Mobile-Specific Checks
- Hamburger menu visible and functional (no desktop nav visible)
- Touch targets >= 44x44px (Apple HIG) / 48x48dp (Material Design)
- No horizontal scrollbar — content fits viewport width
- Text readable without zooming (>= 16px body text)
- Fixed/sticky elements do not cover critical content
- Bottom navigation does not overlap page content`,
    tablet: `### Tablet-Specific Checks
- Layout adapts between mobile and desktop (may use sidebar + content)
- Touch targets still adequately sized
- Modals/dialogs centered and not overflowing viewport
- Split-view layouts properly proportioned`,
    desktop: `### Desktop-Specific Checks
- Content does not stretch beyond readable width (max ~1200px content area)
- Sidebar navigation visible if expected
- Hover states present on interactive elements
- Multi-column layouts properly aligned`,
  };

  return heuristics[deviceType] ?? "";
}

function buildFewShotExample(): string {
  return `## Example — Visual Analysis Output
**Input:** Login page screenshot. Expected: centered form with email, password fields, and "Sign In" button. Brand: primary=#2563eb, font=Inter.
**Observation:** Form is present but the "Sign In" button appears gray instead of blue. Password field has no visibility toggle.

**Output:**
{
  "overallStatus": "warning",
  "issues": [
    {
      "type": "color",
      "severity": "medium",
      "description": "Sign In button uses gray (#9CA3AF) instead of brand primary blue (#2563EB)",
      "location": "Login form, bottom of form",
      "expected": "Button background #2563EB (brand primary)",
      "actual": "Button background appears gray (#9CA3AF)",
      "confidence": 85
    }
  ],
  "missingElements": [],
  "accessibilityFlags": ["Password field lacks a visibility toggle — users cannot verify their input"],
  "summary": "Login page renders correctly with one brand color deviation on the submit button.",
  "confidence": 88
}`;
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

  const viewportHeuristics = buildViewportHeuristics(viewport?.deviceType);

  const agentInstructions = `## Sub-Agent Role: Visual Analyzer
You analyze screenshot descriptions to detect visual regressions, layout issues, and brand inconsistencies. You compare against expected appearance, baseline (if available), and brand guidelines.

## Chain of Thought
1. **Compare to expectation.** Does the screenshot match the expected appearance? Identify deviations.
2. **Check element presence.** Are all expected UI elements visible? Note any missing or unexpected elements.
3. **Evaluate layout.** Is the layout correct for the viewport? Alignment, spacing, grid structure.
4. **Verify brand compliance.** Do colors, fonts, and spacing match brand guidelines?
5. **Assess accessibility.** Visible contrast issues? Missing focus indicators? Text readability?
6. **Compare to baseline.** If a baseline exists, what changed? Is the change intentional or a regression?
7. **Score confidence.** How certain are you about each finding? Only report with confidence >= 70.

## Anti-Hallucination Rules
- Only report issues you can specifically identify from the screenshot description. Do not invent visual problems.
- If the screenshot description is too vague to assess a particular aspect (e.g., exact colors), say "unable to assess" rather than guessing.
- If no issues are found, return overallStatus "pass" with an empty issues array. Do not fabricate issues.

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

${viewportHeuristics}

## Analysis Checklist
1. **Layout:** Elements properly aligned? Grid/flexbox working? No unexpected gaps or overlaps?
2. **Responsiveness:** Layout fits viewport? No horizontal scrollbar on mobile? Content not cut off?
3. **Missing elements:** All expected elements visible? Interactive elements present and enabled?
4. **Text:** Readable? No overflow, truncation, or overlapping? Correct font and size?
5. **Colors:** Match brand guidelines? Sufficient contrast for text on background?
6. **Spacing:** Consistent with brand guidelines? No elements touching or too far apart?
7. **Accessibility:** Sufficient contrast? Focus indicators visible? Interactive elements distinguishable?
8. **Regression:** If baseline exists, what changed? New elements? Missing elements? Layout shift?

${buildFewShotExample()}

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
      "actual": "What was observed",
      "confidence": 0-100
    }
  ],
  "missingElements": ["elements that should be visible but are not"],
  "accessibilityFlags": ["potential a11y issues spotted"],
  "summary": "One-line visual analysis summary",
  "confidence": 0-100
}`;

  const { systemPrompt } = buildPrompt({
    agentRole: "reporter",
    agentInstructions,
    maxOutputTokens: 500,
  });

  return systemPrompt;
}
