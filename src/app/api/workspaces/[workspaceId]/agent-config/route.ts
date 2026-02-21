import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import type { AgentPhase } from "@/generated/prisma/client";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];

interface AgentConfigDefaults {
  model: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

const AGENT_DEFAULTS: Record<AgentPhase, AgentConfigDefaults> = {
  analyst: { model: "claude-haiku-4-5-20251001", temperature: 0.0, maxInputTokens: 400000, maxOutputTokens: 100000 },
  planner: { model: "claude-sonnet-4-6", temperature: 0.3, maxInputTokens: 600000, maxOutputTokens: 200000 },
  executor: { model: "claude-sonnet-4-6", temperature: 0.0, maxInputTokens: 200000, maxOutputTokens: 50000 },
  reporter: { model: "claude-haiku-4-5-20251001", temperature: 0.2, maxInputTokens: 300000, maxOutputTokens: 100000 },
  auditor: { model: "claude-sonnet-4-6", temperature: 0.1, maxInputTokens: 500000, maxOutputTokens: 150000 },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.view");

    const configs = await prisma.agentConfig.findMany({
      where: { workspaceId },
    });

    const configMap = new Map(configs.map((c) => [c.agentPhase, c]));

    const result = VALID_PHASES.map((phase) => {
      const saved = configMap.get(phase);
      const defaults = AGENT_DEFAULTS[phase];

      return {
        agentPhase: phase,
        model: saved?.model ?? defaults.model,
        temperature: saved?.temperature ?? defaults.temperature,
        maxInputTokens: saved?.maxInputTokens ?? defaults.maxInputTokens,
        maxOutputTokens: saved?.maxOutputTokens ?? defaults.maxOutputTokens,
        customPrompt: saved?.customPrompt ?? null,
        isEnabled: saved?.isEnabled ?? true,
      };
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

interface PutBody {
  agentPhase: string;
  model?: string;
  temperature?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  customPrompt?: string;
  isEnabled?: boolean;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.manage");

    const body = (await request.json()) as PutBody;
    const { agentPhase, model, temperature, maxInputTokens, maxOutputTokens, customPrompt, isEnabled } = body;

    if (!agentPhase || !VALID_PHASES.includes(agentPhase as AgentPhase)) {
      return apiError("Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor", "VALIDATION_ERROR", 400);
    }

    if (temperature !== undefined && (temperature < 0 || temperature > 1)) {
      return apiError("Temperature must be between 0 and 1", "VALIDATION_ERROR", 400);
    }

    if (maxInputTokens !== undefined && maxInputTokens < 0) {
      return apiError("maxInputTokens must be non-negative", "VALIDATION_ERROR", 400);
    }

    if (maxOutputTokens !== undefined && maxOutputTokens < 0) {
      return apiError("maxOutputTokens must be non-negative", "VALIDATION_ERROR", 400);
    }

    const config = await prisma.agentConfig.upsert({
      where: {
        agent_config_unique: {
          workspaceId,
          agentPhase: agentPhase as AgentPhase,
        },
      },
      update: {
        ...(model !== undefined && { model }),
        ...(temperature !== undefined && { temperature }),
        ...(maxInputTokens !== undefined && { maxInputTokens }),
        ...(maxOutputTokens !== undefined && { maxOutputTokens }),
        ...(customPrompt !== undefined && { customPrompt }),
        ...(isEnabled !== undefined && { isEnabled }),
      },
      create: {
        workspaceId,
        agentPhase: agentPhase as AgentPhase,
        model: model ?? AGENT_DEFAULTS[agentPhase as AgentPhase].model,
        temperature: temperature ?? AGENT_DEFAULTS[agentPhase as AgentPhase].temperature,
        maxInputTokens: maxInputTokens ?? AGENT_DEFAULTS[agentPhase as AgentPhase].maxInputTokens,
        maxOutputTokens: maxOutputTokens ?? AGENT_DEFAULTS[agentPhase as AgentPhase].maxOutputTokens,
        customPrompt: customPrompt ?? null,
        isEnabled: isEnabled ?? true,
      },
    });

    return apiSuccess(config);
  } catch (error) {
    return handleApiError(error);
  }
}
