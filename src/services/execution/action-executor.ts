import type { Page } from "playwright";
import type { ExecutorAction } from "@/agents/schemas/execution-result";
import { healSelector, persistHealing } from "@/services/execution/self-healer";
import { performAction } from "@/services/execution/action-performer";
import { classifyError } from "@/services/execution/error-classifier";
import { prisma } from "@/lib/db";
import type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";

// ============================================================
// Selector Memory Pre-Application
// ============================================================

async function resolveSelector(
  projectId: string,
  originalSelector: string
): Promise<string> {
  const mapping = await prisma.selectorMapping.findFirst({
    where: {
      projectId,
      originalSelector,
      confidence: { gte: 0.85 },
    },
    orderBy: { healCount: "desc" },
  });

  return mapping?.healedSelector ?? originalSelector;
}

// ============================================================
// Action Execution with Retry + Self-Healing
// ============================================================

export interface ActionResult {
  succeeded: boolean;
  actualResult: string;
  durationMs: number;
  wasHealed: boolean;
  healedSelector: string;
}

export async function executeAction(
  page: Page,
  projectId: string,
  action: ExecutorAction,
  maxRetries: number,
  _evidenceCollector: EvidenceCollectorInstance,
  runId?: string
): Promise<ActionResult> {
  const startTime = Date.now();
  let retries = 0;
  let succeeded = false;
  let actualResult = "";
  let wasHealed = false;
  let healedSelector = "";

  // Pre-apply known-good selector from history before attempting action
  if (action.selector) {
    const resolved = await resolveSelector(projectId, action.selector);
    if (resolved !== action.selector) {
      action = { ...action, selector: resolved };
      wasHealed = true;
      healedSelector = resolved;
    }
  }

  while (retries <= maxRetries) {
    try {
      actualResult = await performAction(page, action);
      succeeded = true;
      break;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorClass = classifyError(errorMsg);

      // Assertion and navigation errors are real failures — never heal
      if (errorClass === "assertion" || errorClass === "navigation") {
        actualResult = errorMsg;
        break;
      }

      // Selector not found — use existing healing cascade
      if (errorClass === "selector_not_found" && action.selector) {
        const healing = await healSelector(
          page, projectId, action.selector, action.reason ?? action.action, runId
        );

        if (healing.found) {
          try {
            const healedAction = { ...action, selector: healing.healedSelector };
            actualResult = await performAction(page, healedAction);
            const pageUrl = page.url();
            await persistHealing(
              projectId, action.selector, healing.healedSelector, healing.confidence,
              runId, pageUrl
            );
            healedSelector = healing.healedSelector;
            wasHealed = true;
            succeeded = true;
            break;
          } catch {
            // Healed selector also failed
          }
        }
      }

      // Not interactable — wait for visibility then retry once
      if (errorClass === "not_interactable" && action.selector && retries === 0) {
        try {
          await page.waitForSelector(action.selector, { state: "visible", timeout: 3000 });
          retries++;
          continue;
        } catch {
          // Visibility wait failed — fall through to normal retry
        }
      }

      // Timeout — brief pause then retry with extended patience
      if (errorClass === "timeout" && retries === 0) {
        await page.waitForTimeout(2000);
        retries++;
        continue;
      }

      retries++;
      if (retries <= maxRetries) {
        await page.waitForTimeout(1000);
      } else {
        actualResult = errorMsg;
      }
    }
  }

  return {
    succeeded,
    actualResult,
    durationMs: Date.now() - startTime,
    wasHealed,
    healedSelector,
  };
}
