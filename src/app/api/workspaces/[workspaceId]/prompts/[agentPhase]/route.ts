import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { buildPrompt, estimateTokens } from "@/agents/prompts/prompt-builder";
import { DEFAULT_USER_PROMPTS } from "@/agents/prompts/default-prompts";
import type { AgentPhase } from "@/generated/prisma/client";
import { route } from "@/server/http/route";

const VALID_PHASES: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];
const MAX_CONTENT_LENGTH = 50000;

function validatePhase(phase: string): phase is AgentPhase {
  return VALID_PHASES.includes(phase as AgentPhase);
}

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ params: { agentPhase }, workspaceId }) => {
    if (!validatePhase(agentPhase)) {
      return apiError(
        "Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor",
        "VALIDATION_ERROR",
        400
      );
    }

    const activeVersion = await prisma.promptVersion.findFirst({
      where: {
        workspaceId,
        agentPhase,
        promptType: "user",
        isActive: true,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const defaultPrompt = DEFAULT_USER_PROMPTS[agentPhase];
    const contentForAssembly = activeVersion?.content ?? defaultPrompt;

    const assembled = buildPrompt({
      agentRole: agentPhase,
      agentInstructions: "",
      userLayer: {
        workspaceConfig: { customPrompt: contentForAssembly },
      },
    });

    return apiSuccess({
      customPrompt: activeVersion?.content ?? null,
      defaultPrompt,
      assembledPreview: assembled.systemPrompt,
      estimatedTokens: estimateTokens(assembled.systemPrompt),
      version: activeVersion?.version ?? null,
      createdAt: activeVersion?.createdAt ?? null,
      createdBy: activeVersion?.createdBy ?? null,
    });
  }
);

export const PUT = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, params: { agentPhase }, workspaceId, session }) => {
    if (!validatePhase(agentPhase)) {
      return apiError(
        "Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor",
        "VALIDATION_ERROR",
        400
      );
    }

    const body = (await request.json()) as { content?: string; changelog?: string };

    if (!body.content || body.content.trim().length === 0) {
      return apiError("content cannot be empty", "VALIDATION_ERROR", 400);
    }

    if (body.content.length > MAX_CONTENT_LENGTH) {
      return apiError(
        `content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Get the latest version number for this workspace+phase
    const latestVersion = await prisma.promptVersion.findFirst({
      where: { workspaceId, agentPhase, promptType: "user" },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const nextVersion = (latestVersion?.version ?? 0) + 1;

    // Deactivate all existing versions and create the new one in a transaction
    const newVersion = await prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: { workspaceId, agentPhase, promptType: "user", isActive: true },
        data: { isActive: false },
      });

      return tx.promptVersion.create({
        data: {
          workspaceId,
          agentPhase,
          promptType: "user",
          content: body.content!,
          version: nextVersion,
          isActive: true,
          createdById: session.user.id,
          changelog: body.changelog ?? null,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    return apiSuccess(newVersion, 201);
  }
);

export const DELETE = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ params: { agentPhase }, workspaceId }) => {
    if (!validatePhase(agentPhase)) {
      return apiError(
        "Invalid agentPhase. Must be one of: analyst, planner, executor, reporter, auditor",
        "VALIDATION_ERROR",
        400
      );
    }

    await prisma.promptVersion.updateMany({
      where: { workspaceId, agentPhase, promptType: "user", isActive: true },
      data: { isActive: false },
    });

    return apiSuccess({ reverted: true, agentPhase });
  }
);
