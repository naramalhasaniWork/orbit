import Anthropic from "@anthropic-ai/sdk";
import { getStorage } from "@/lib/storage";
import { getModelForTask } from "@/lib/ai/model-router";
import { recordTokenUsage } from "@/lib/billing/token-tracker";
import { prisma } from "@/lib/db";

// ============================================================
// Types
// ============================================================

export interface BrandIssue {
  severity: "critical" | "warning" | "info";
  category: "color" | "typography" | "spacing" | "layout" | "accessibility";
  description: string;
  element?: string;
  suggestion?: string;
}

export interface BrandCheckResult {
  score: number; // 0-100 brand consistency score
  issues: BrandIssue[];
  passed: boolean;
}

interface BillingContext {
  workspaceId: string;
  projectId?: string;
  runId?: string;
}

const BRAND_PASS_THRESHOLD = 70;

// ============================================================
// Brand Guidelines Loader
// ============================================================

async function loadBrandGuidelines(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) return null;

  const knowledgeFile = await prisma.domainKnowledgeFile.findFirst({
    where: {
      workspaceId: project.workspaceId,
      type: "design_system",
    },
    orderBy: { createdAt: "desc" },
    select: { storageKey: true },
  });

  if (!knowledgeFile) return null;

  try {
    const storage = getStorage();
    const data = await storage.download(knowledgeFile.storageKey);
    return data.toString("utf-8");
  } catch {
    return null;
  }
}

// ============================================================
// Brand Consistency Check via Claude Vision
// ============================================================

export async function checkBrandConsistency(
  screenshotKey: string,
  brandGuidelines?: string,
  projectId?: string,
  billing?: BillingContext
): Promise<BrandCheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for brand checking");
  }

  // Try loading brand guidelines from domain knowledge if not provided
  let guidelines = brandGuidelines;
  if (!guidelines && projectId) {
    guidelines = (await loadBrandGuidelines(projectId)) ?? undefined;
  }

  const storage = getStorage();
  const screenshotData = await storage.download(screenshotKey);
  const screenshotB64 = screenshotData.toString("base64");

  const client = new Anthropic({ apiKey });
  const model = await getModelForTask("visual_analysis");

  const guidelinesContext = guidelines
    ? `\n\nBrand Guidelines:\n${guidelines.slice(0, 4000)}`
    : "\n\nNo brand guidelines provided. Evaluate general UI consistency, accessibility, and common design best practices.";

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    temperature: 0,
    system: `You are a brand identity and UI quality analyst. Evaluate screenshots against brand guidelines and design best practices. Output ONLY valid JSON.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: screenshotB64 },
          },
          {
            type: "text",
            text: `Analyze this screenshot for brand consistency and visual quality.${guidelinesContext}

Evaluate:
1. Color consistency — do colors match the brand palette?
2. Typography — consistent font sizes, weights, families?
3. Spacing — consistent margins, padding, alignment?
4. Layout — proper visual hierarchy, responsive design cues?
5. Accessibility — contrast ratios, text readability, interactive element size?

Output JSON with this exact structure:
{
  "score": <0-100 brand consistency score>,
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "color" | "typography" | "spacing" | "layout" | "accessibility",
      "description": "<what's wrong>",
      "element": "<which element, if identifiable>",
      "suggestion": "<how to fix>"
    }
  ]
}

Score guide: 90-100 = excellent, 70-89 = good, 50-69 = needs work, below 50 = failing.
Only report genuine issues, not subjective preferences.`,
          },
        ],
      },
    ],
  });

  // Track billing
  if (billing) {
    recordTokenUsage({
      workspaceId: billing.workspaceId,
      projectId: billing.projectId,
      runId: billing.runId,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedTokens: 0,
      agentPhase: "executor",
    }).catch((err) => console.error("[BrandChecker] Token tracking error:", err));
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock ? textBlock.text : "{}";

  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned) as { score: number; issues: BrandIssue[] };

  return {
    score: parsed.score,
    issues: parsed.issues ?? [],
    passed: parsed.score >= BRAND_PASS_THRESHOLD,
  };
}
