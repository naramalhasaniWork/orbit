import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
  };
}

export async function POST() {
  try {
    await requireSuperAdmin();

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      return apiError(
        `OpenRouter API returned ${response.status}`,
        "OPENROUTER_ERROR",
        502
      );
    }

    const json = (await response.json()) as { data: OpenRouterModel[] };
    const models = json.data;

    if (!Array.isArray(models)) {
      return apiError("Invalid response from OpenRouter", "OPENROUTER_ERROR", 502);
    }

    let created = 0;
    let updated = 0;

    for (const model of models) {
      const provider = model.id.split("/")[0] ?? "unknown";
      const inputCost = parseFloat(model.pricing?.prompt ?? "0") * 1_000_000;
      const outputCost = parseFloat(model.pricing?.completion ?? "0") * 1_000_000;

      const existing = await prisma.modelRegistry.findUnique({
        where: { model_registry_unique: { provider, modelId: model.id } },
      });

      if (existing) {
        await prisma.modelRegistry.update({
          where: { id: existing.id },
          data: {
            displayName: model.name || model.id,
            contextWindow: model.context_length || 0,
            inputCostPer1M: inputCost,
            outputCostPer1M: outputCost,
            capabilities: model.architecture ?? Prisma.JsonNull,
            lastSyncedAt: new Date(),
          },
        });
        updated++;
      } else {
        await prisma.modelRegistry.create({
          data: {
            provider,
            modelId: model.id,
            displayName: model.name || model.id,
            contextWindow: model.context_length || 0,
            inputCostPer1M: inputCost,
            outputCostPer1M: outputCost,
            capabilities: model.architecture ?? Prisma.JsonNull,
            lastSyncedAt: new Date(),
          },
        });
        created++;
      }
    }

    return apiSuccess({
      total: models.length,
      created,
      updated,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
