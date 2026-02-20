/**
 * Sub-Agent Healing — delegates selector finding to the selector-finder
 * sub-agent for richer DOM analysis when heuristic strategies fail.
 */

import type { Page } from "playwright";
import { prisma } from "@/lib/db";
import { spawnSubAgent } from "@/services/agents/executor";

interface HealingResult {
  found: boolean;
  healedSelector: string;
  confidence: number;
  strategy: string;
}

interface SubAgentSelectorResult {
  selector: string;
  confidence: number;
  strategy: string;
  alternatives?: string[];
}

const CONFIDENCE_THRESHOLD = 0.85;

function isSubAgentSelectorResult(
  value: unknown
): value is SubAgentSelectorResult {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.selector === "string" && typeof obj.confidence === "number"
  );
}

/**
 * Gather interactive elements from the page for richer sub-agent context.
 */
async function gatherInteractiveElements(page: Page) {
  return page.evaluate(() => {
    const query =
      "a, button, input, select, textarea, [role], [data-testid], [aria-label]";
    const els = document.querySelectorAll(query);
    return Array.from(els)
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 80) ?? "",
        selector: el.getAttribute("data-testid")
          ? `[data-testid="${el.getAttribute("data-testid")}"]`
          : `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`,
        ariaLabel: el.getAttribute("aria-label") ?? undefined,
        role: el.getAttribute("role") ?? undefined,
      }));
  });
}

/**
 * Try to find a new selector using the selector-finder sub-agent.
 * Provides richer context (interactive elements, page HTML, failed selectors)
 * than the simple LLM healing strategy.
 */
export async function trySubAgentHealing(
  page: Page,
  originalSelector: string,
  actionDescription: string,
  projectId: string,
  runId?: string
): Promise<HealingResult | null> {
  const [pageContent, interactiveElements, project] = await Promise.all([
    page.evaluate(() => document.body?.innerHTML?.slice(0, 5000) ?? ""),
    gatherInteractiveElements(page),
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { workspaceId: true },
    }),
  ]);

  const result = await spawnSubAgent({
    parentRunId: runId ?? `heal-${Date.now()}`,
    projectId,
    agentType: "selector-finder",
    workspaceId: project.workspaceId,
    context: {
      originalSelector,
      actionDescription,
      pageHtml: pageContent,
      pageUrl: page.url(),
      interactiveElements,
      failedSelectors: [originalSelector],
    },
  });

  if (!result.success || !isSubAgentSelectorResult(result.output)) {
    return null;
  }

  const parsed = result.output;

  if (parsed.confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }

  // Validate the primary selector
  try {
    const count = await page.locator(parsed.selector).count();
    if (count >= 1) {
      return {
        found: true,
        healedSelector: parsed.selector,
        confidence: parsed.confidence,
        strategy: "sub_agent_selector_finder",
      };
    }
  } catch {
    // Selector validation failed
  }

  // Try alternatives if primary selector didn't match
  for (const alt of parsed.alternatives ?? []) {
    try {
      const count = await page.locator(alt).count();
      if (count >= 1) {
        return {
          found: true,
          healedSelector: alt,
          confidence: parsed.confidence * 0.9,
          strategy: "sub_agent_selector_finder_alt",
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}
