import type { Page } from "playwright";
import { prisma } from "@/lib/db";
import { createCompletion } from "@/lib/ai";
import { getModelForTask } from "@/lib/ai/model-router";

// ============================================================
// Types
// ============================================================

interface HealingResult {
  found: boolean;
  healedSelector: string;
  confidence: number;
  strategy: string;
}

const CONFIDENCE_THRESHOLD = 0.85;

// ============================================================
// Selector Healing Strategies
// ============================================================

async function tryStoredMapping(
  projectId: string,
  originalSelector: string
): Promise<HealingResult | null> {
  const mapping = await prisma.selectorMapping.findFirst({
    where: {
      projectId,
      originalSelector,
      confidence: { gte: CONFIDENCE_THRESHOLD },
    },
    orderBy: { healCount: "desc" },
  });

  if (!mapping) return null;

  return {
    found: true,
    healedSelector: mapping.healedSelector,
    confidence: mapping.confidence,
    strategy: "stored_mapping",
  };
}

async function tryTextContent(
  page: Page,
  originalSelector: string
): Promise<HealingResult | null> {
  // Extract potential text from the original selector
  const textMatch = originalSelector.match(/:has-text\("([^"]+)"\)/);
  if (!textMatch) return null;

  const text = textMatch[1];
  const candidates = [
    `text="${text}"`,
    `*:has-text("${text}")`,
    `button:has-text("${text}")`,
    `a:has-text("${text}")`,
  ];

  for (const candidate of candidates) {
    try {
      const count = await page.locator(candidate).count();
      if (count === 1) {
        return {
          found: true,
          healedSelector: candidate,
          confidence: 0.9,
          strategy: "text_content",
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function tryAriaLabel(
  page: Page,
  _originalSelector: string
): Promise<HealingResult | null> {
  // Try to find a similar element by aria-label by extracting tag name
  const tagMatch = _originalSelector.match(/^(\w+)/);
  if (!tagMatch) return null;

  const tag = tagMatch[1];
  const ariaElements = await page.evaluate((targetTag: string) => {
    const els = document.querySelectorAll(`${targetTag}[aria-label]`);
    return Array.from(els).map((el) => ({
      label: el.getAttribute("aria-label") ?? "",
      tag: el.tagName.toLowerCase(),
    }));
  }, tag);

  if (ariaElements.length === 1) {
    return {
      found: true,
      healedSelector: `${tag}[aria-label="${ariaElements[0].label}"]`,
      confidence: 0.88,
      strategy: "aria_label",
    };
  }

  return null;
}

async function tryRoleBasedSelector(
  page: Page,
  originalSelector: string
): Promise<HealingResult | null> {
  // Map common tags to ARIA roles
  const roleMap: Record<string, string> = {
    button: "button",
    a: "link",
    input: "textbox",
    select: "combobox",
    nav: "navigation",
  };

  const tagMatch = originalSelector.match(/^(\w+)/);
  if (!tagMatch) return null;

  const tag = tagMatch[1];
  const role = roleMap[tag];
  if (!role) return null;

  const roleSelector = `role=${role}`;
  try {
    const count = await page.getByRole(role as Parameters<Page["getByRole"]>[0]).count();
    if (count === 1) {
      return {
        found: true,
        healedSelector: roleSelector,
        confidence: 0.87,
        strategy: "role_based",
      };
    }
  } catch {
    // Role not supported or failed
  }

  return null;
}

async function tryLlmHealing(
  page: Page,
  originalSelector: string,
  actionDescription: string
): Promise<HealingResult | null> {
  const pageContent = await page.evaluate(() => {
    return document.body?.innerHTML?.slice(0, 3000) ?? "";
  });

  const model = getModelForTask("browser_execution");

  const result = await createCompletion({
    model,
    systemPrompt:
      "You identify CSS selectors for web elements. Output ONLY valid JSON. " +
      "No markdown, no prose.",
    messages: [
      {
        role: "user",
        content: [
          `The selector "${originalSelector}" was not found on the page.`,
          `The intended action: ${actionDescription}`,
          `Page HTML (truncated):\n${pageContent}`,
          "",
          "Find the most likely matching element and return:",
          '{"selector": "css-selector-here", "confidence": 0.0-1.0, "reasoning": "why"}',
        ].join("\n"),
      },
    ],
    maxTokens: 200,
    temperature: 0,
  });

  try {
    const parsed = JSON.parse(result.content) as {
      selector: string;
      confidence: number;
    };

    if (parsed.confidence >= CONFIDENCE_THRESHOLD) {
      const count = await page.locator(parsed.selector).count();
      if (count >= 1) {
        return {
          found: true,
          healedSelector: parsed.selector,
          confidence: parsed.confidence,
          strategy: "llm_healing",
        };
      }
    }
  } catch {
    // LLM output parsing failed
  }

  return null;
}

// ============================================================
// Main Healing Function
// ============================================================

export async function healSelector(
  page: Page,
  projectId: string,
  originalSelector: string,
  actionDescription: string
): Promise<HealingResult> {
  // Try strategies in order of speed and reliability
  const strategies = [
    () => tryStoredMapping(projectId, originalSelector),
    () => tryTextContent(page, originalSelector),
    () => tryAriaLabel(page, originalSelector),
    () => tryRoleBasedSelector(page, originalSelector),
    () => tryLlmHealing(page, originalSelector, actionDescription),
  ];

  for (const strategy of strategies) {
    const result = await strategy();
    if (result?.found) {
      return result;
    }
  }

  return {
    found: false,
    healedSelector: originalSelector,
    confidence: 0,
    strategy: "none",
  };
}

// ============================================================
// Persist Healing Result
// ============================================================

export async function persistHealing(
  projectId: string,
  originalSelector: string,
  healedSelector: string,
  confidence: number
): Promise<void> {
  const existing = await prisma.selectorMapping.findFirst({
    where: { projectId, originalSelector, healedSelector },
  });

  if (existing) {
    await prisma.selectorMapping.update({
      where: { id: existing.id },
      data: {
        healCount: existing.healCount + 1,
        confidence: Math.max(existing.confidence, confidence),
      },
    });
  } else {
    await prisma.selectorMapping.create({
      data: {
        projectId,
        originalSelector,
        healedSelector,
        confidence,
      },
    });
  }
}

export type { HealingResult };
