import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, handleApiError } from "@/lib/utils/api";
import { getWorkspaceApiKey } from "@/lib/ai/model-router";
import { ensureModelRegistryFresh } from "@/server/ai/openrouter-registry";
import type { AgentPhase } from "@/generated/prisma/client";

interface ModelInfo {
  modelId: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  capabilities: Record<string, unknown> | null;
  isRecommended: boolean;
  recommendedFor: AgentPhase[];
}

// Built-in models available when platform API keys are configured
const BUILTIN_MODELS: ModelInfo[] = [
  {
    modelId: "claude-opus-5-5",
    provider: "anthropic",
    displayName: "Claude Opus 5.5",
    contextWindow: 1000000,
    inputCostPer1M: 4,
    outputCostPer1M: 20,
    capabilities: { vision: true, tools: true, adaptive_thinking: true, structured_outputs: true },
    isRecommended: false,
    recommendedFor: [],
  },
  {
    modelId: "claude-sonnet-5-5",
    provider: "anthropic",
    displayName: "Claude Sonnet 5.5",
    contextWindow: 1000000,
    inputCostPer1M: 2,
    outputCostPer1M: 10,
    capabilities: { vision: true, tools: true, adaptive_thinking: true, structured_outputs: true },
    isRecommended: true,
    recommendedFor: ["planner", "auditor"],
  },
  {
    modelId: "claude-haiku-5-5",
    provider: "anthropic",
    displayName: "Claude Haiku 5.5",
    contextWindow: 1000000,
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.5,
    capabilities: { vision: true, tools: true, adaptive_thinking: true, structured_outputs: true },
    isRecommended: true,
    recommendedFor: ["analyst", "executor", "reporter"],
  },
  {
    modelId: "gpt-5.2",
    provider: "openai",
    displayName: "GPT-5.2",
    contextWindow: 400000,
    inputCostPer1M: 1.75,
    outputCostPer1M: 14,
    capabilities: { vision: true, tools: true, reasoning: true },
    isRecommended: false,
    recommendedFor: [],
  },
  {
    modelId: "gpt-4.1",
    provider: "openai",
    displayName: "GPT-4.1",
    contextWindow: 1047576,
    inputCostPer1M: 2,
    outputCostPer1M: 8,
    capabilities: { vision: true, tools: true },
    isRecommended: false,
    recommendedFor: [],
  },
  {
    modelId: "o4-mini",
    provider: "openai",
    displayName: "o4-mini",
    contextWindow: 200000,
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    capabilities: { vision: true, tools: true, reasoning: true },
    isRecommended: false,
    recommendedFor: [],
  },
];

// Tier hierarchy for comparison
const TIER_HIERARCHY: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.view");

    // Get workspace tier
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { tier: true },
    });

    // Check which built-in providers have platform keys
    const hasPlatformAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasPlatformOpenAI = !!process.env.OPENAI_API_KEY;
    const hasPlatformOpenRouter = !!process.env.OPENROUTER_API_KEY;

    // Keep the OpenRouter model registry fresh (no-op when synced <24h ago).
    // Uses the workspace key if configured, otherwise the platform key.
    const workspaceOpenRouterKey = await getWorkspaceApiKey(workspaceId, "openrouter");
    if (workspaceOpenRouterKey || hasPlatformOpenRouter) {
      await ensureModelRegistryFresh(workspaceOpenRouterKey ?? undefined);
    }

    // Get all models from the registry (synced from OpenRouter etc.)
    const registryModels = await prisma.modelRegistry.findMany({
      where: { isActive: true },
    });

    // Get global model policies
    const policies = await prisma.globalModelPolicy.findMany();
    const policyMap = new Map(
      policies.map((p) => [`${p.provider}:${p.modelId}`, p])
    );

    // Get which providers the workspace has configured
    const providerConfigs = await prisma.providerConfig.findMany({
      where: { workspaceId, isActive: true },
      select: { provider: true },
    });
    const activeProviders = new Set(providerConfigs.map((p) => p.provider));

    const workspaceTierLevel = TIER_HIERARCHY[workspace.tier] ?? 0;
    const models: ModelInfo[] = [];

    // Add built-in models if platform keys exist or workspace has own key
    for (const model of BUILTIN_MODELS) {
      const hasPlatformKey =
        (model.provider === "anthropic" && hasPlatformAnthropic) ||
        (model.provider === "openai" && hasPlatformOpenAI);
      const hasWorkspaceKey = activeProviders.has(model.provider);

      if (!hasPlatformKey && !hasWorkspaceKey) continue;

      const policy = policyMap.get(`${model.provider}:${model.modelId}`);
      if (policy && !policy.isAllowed) continue;
      if (policy?.requiredTier) {
        const requiredLevel = TIER_HIERARCHY[policy.requiredTier] ?? 0;
        if (workspaceTierLevel < requiredLevel) continue;
      }

      models.push(model);
    }

    // Add registry models (OpenRouter, custom providers)
    for (const reg of registryModels) {
      const hasWorkspaceKey = activeProviders.has(reg.provider);
      const hasPlatformKey =
        reg.provider === "openrouter" && hasPlatformOpenRouter;
      if (!hasWorkspaceKey && !hasPlatformKey) continue;

      const policy = policyMap.get(`${reg.provider}:${reg.modelId}`);
      if (policy && !policy.isAllowed) continue;
      if (policy?.requiredTier) {
        const requiredLevel = TIER_HIERARCHY[policy.requiredTier] ?? 0;
        if (workspaceTierLevel < requiredLevel) continue;
      }

      // Avoid duplicates if a registry entry matches a built-in
      const isDuplicate = models.some(
        (m) => m.modelId === reg.modelId && m.provider === reg.provider
      );
      if (isDuplicate) continue;

      models.push({
        modelId: reg.modelId,
        provider: reg.provider,
        displayName: reg.displayName,
        contextWindow: reg.contextWindow,
        inputCostPer1M: reg.inputCostPer1M,
        outputCostPer1M: reg.outputCostPer1M,
        capabilities: reg.capabilities as Record<string, unknown> | null,
        isRecommended: false,
        recommendedFor: [],
      });
    }

    return apiSuccess(models);
  } catch (error) {
    return handleApiError(error);
  }
}
