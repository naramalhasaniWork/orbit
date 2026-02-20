/**
 * Selector Finder Sub-Agent Prompt
 * Finds the best CSS/XPath selector for a UI element given DOM context.
 * Used by the self-healer when standard selector strategies fail.
 */

import { buildPrompt } from "@/agents/prompts/prompt-builder";

export interface SelectorFinderContext {
  /** The original selector that failed */
  originalSelector: string;
  /** Description of the intended action */
  actionDescription: string;
  /** Truncated DOM/HTML of the current page */
  pageHtml: string;
  /** Current page URL */
  pageUrl?: string;
  /** Interactive elements visible on the page */
  interactiveElements?: Array<{
    tag: string;
    text?: string;
    selector: string;
    ariaLabel?: string;
    role?: string;
  }>;
  /** Previous selectors that were tried and failed */
  failedSelectors?: string[];
}

function buildFewShotExample(): string {
  return `## Example — Selector Resolution
**Input:** Original selector "#submit-btn" failed. Action: "Click the submit button on the registration form."
**Interactive elements include:** <button type="submit" role="button"> "Create Account" -> form.register-form > button[type="submit"]

**Correct output:**
{
  "selector": "form.register-form > button[type='submit']",
  "confidence": 0.9,
  "strategy": "structural",
  "reasoning": "The original ID selector changed. Matched by form context + button type='submit' + text content 'Create Account'. This is the only submit button inside the registration form.",
  "alternatives": ["button:has-text('Create Account')", "[role='button']:has-text('Create Account')"]
}`;
}

export function buildSelectorFinderPrompt(
  context: SelectorFinderContext
): string {
  const {
    originalSelector,
    actionDescription,
    pageHtml,
    pageUrl,
    interactiveElements,
    failedSelectors,
  } = context;

  const elementsStr = interactiveElements
    ? interactiveElements
        .slice(0, 20)
        .map(
          (el) =>
            `  - <${el.tag}${el.role ? ` role="${el.role}"` : ""}${el.ariaLabel ? ` aria-label="${el.ariaLabel}"` : ""}> "${el.text ?? ""}" -> ${el.selector}`
        )
        .join("\n")
    : "  (not available)";

  const failedStr = failedSelectors?.length
    ? `\n## Previously Failed Selectors (DO NOT suggest these)\n${failedSelectors.map((s) => `- \`${s}\``).join("\n")}`
    : "";

  const agentInstructions = `## Sub-Agent Role: Selector Finder
You are a specialist at finding CSS selectors for web elements. Given a failed selector, the page DOM, and the intended action, you find the correct replacement selector.

## Chain of Thought
1. **Understand the intent.** What element is the action targeting? A button? An input? A link?
2. **Analyze the original selector.** Why might it have failed? ID changed? Class renamed? Element restructured?
3. **Scan interactive elements.** Find candidates that match the intent by text content, role, type, or position.
4. **Verify uniqueness.** The selected CSS selector must match exactly ONE element. If multiple match, add specificity.
5. **Rank by stability.** Prefer data-testid > aria-label > role > text > structure > class.

## Task
The selector \`${originalSelector}\` was not found on the page.
The intended action: ${actionDescription}
${pageUrl ? `Page URL: ${pageUrl}` : ""}

## Interactive Elements on Page
${elementsStr}

## Page HTML (truncated)
${pageHtml}
${failedStr}

## Selector Priority (use this order)
1. **data-testid:** \`[data-testid="..."]\` — most stable, designed for testing
2. **ARIA labels:** \`[aria-label="..."]\` — accessibility-driven, stable across visual changes
3. **Role + text:** \`role=button[name="..."]\` — semantic, resilient to style changes
4. **Name attribute:** \`input[name="..."]\` — stable for form elements
5. **Text content:** \`:has-text("...")\`, \`text="..."\` — human-readable fallback
6. **Structural:** tag + parent context — moderate stability
7. **XPath:** only as absolute last resort

${buildFewShotExample()}

## Output Schema
Your response MUST be valid JSON:
{
  "selector": "the-best-selector",
  "confidence": 0.0-1.0,
  "strategy": "data-testid | aria-label | role | name | text-content | structural | xpath",
  "reasoning": "Why this selector was chosen and why it uniquely matches the target element",
  "alternatives": ["backup-selector-1", "backup-selector-2"]
}

## Rules
- The selector MUST match exactly one element on the page. Verify against the DOM.
- Prefer stable selectors (data-testid, aria-label) over brittle ones (nth-child, class names).
- If no confident match exists, return confidence < 0.5 with an honest explanation.
- NEVER invent selectors — only output selectors that match elements in the provided DOM.
- NEVER suggest a selector that appears in the "Previously Failed Selectors" list.
- If the element truly does not exist on the page (e.g., removed by a UI change), set confidence to 0.0 and explain.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    maxOutputTokens: 300,
  });

  return systemPrompt;
}
