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
    ? `\n## Previously Failed Selectors\n${failedSelectors.map((s) => `- ${s}`).join("\n")}`
    : "";

  const agentInstructions = `## Sub-Agent Role: Selector Finder
You are a specialist at finding CSS selectors for web elements. Given a failed selector, the page DOM, and the intended action, you find the correct selector.

## Task
The selector "${originalSelector}" was not found on the page.
The intended action: ${actionDescription}
${pageUrl ? `Page URL: ${pageUrl}` : ""}

## Interactive Elements on Page
${elementsStr}

## Page HTML (truncated)
${pageHtml}
${failedStr}

## Selector Priority (use this order)
1. data-testid attributes: [data-testid="..."]
2. ARIA labels: [aria-label="..."]
3. Role selectors: role=button, role=link
4. Text content: :has-text("..."), text="..."
5. Structural: tag + class combination
6. XPath: only as last resort

## Output Schema
Your response MUST be valid JSON:
{
  "selector": "the-best-selector",
  "confidence": 0.0-1.0,
  "strategy": "data-testid | aria-label | role | text-content | structural | xpath",
  "reasoning": "brief explanation of why this selector was chosen",
  "alternatives": ["backup-selector-1", "backup-selector-2"]
}

## Rules
- The selector MUST match exactly one element on the page.
- Prefer stable selectors (data-testid, aria-label) over brittle ones (nth-child, class names).
- If no confident match exists, return confidence < 0.5.
- Never invent selectors — only output selectors that match elements in the provided DOM.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    maxOutputTokens: 300,
  });

  return systemPrompt;
}
