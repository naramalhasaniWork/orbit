import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

const AGENT_PHASES = ["analyst", "planner", "executor", "reporter", "auditor"] as const;

const DEFAULT_PROMPTS: Record<string, string> = {
  analyst: "You are the Orbit Analyst agent. Your role is to index codebases, extract system maps of routes, components, endpoints, and data models. Output structured JSON.",
  planner: "You are the Orbit Planner agent. Your role is to generate comprehensive, prioritized test plans from system maps. Think adversarially about edge cases. Output structured JSON.",
  executor: "You are the Orbit Executor agent. Your role is to execute test cases in the browser using Playwright + Stagehand. Follow each step precisely, capture artifacts, and report verdicts.",
  reporter: "You are the Orbit Reporter agent. Your role is to analyze test results, explain failures clearly, suggest fixes, and generate reports for Linear/GitHub/Slack.",
  auditor: "You are the Orbit Auditor agent. Your role is to audit code quality, security, accessibility, and performance. Score findings and prioritize issues.",
};

export async function GET() {
  try {
    await requireSuperAdmin();

    const prompts: Record<string, unknown> = {};

    for (const phase of AGENT_PHASES) {
      // Get active global prompt (workspaceId IS NULL)
      const activePrompt = await prisma.promptVersion.findFirst({
        where: {
          workspaceId: null,
          agentPhase: phase,
          isActive: true,
        },
        orderBy: { version: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      // Get version history
      const history = await prisma.promptVersion.findMany({
        where: {
          workspaceId: null,
          agentPhase: phase,
        },
        orderBy: { version: "desc" },
        take: 20,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      prompts[phase] = {
        active: activePrompt
          ? {
              id: activePrompt.id,
              content: activePrompt.content,
              version: activePrompt.version,
              promptType: activePrompt.promptType,
              changelog: activePrompt.changelog,
              createdBy: activePrompt.createdBy,
              createdAt: activePrompt.createdAt,
            }
          : {
              id: null,
              content: DEFAULT_PROMPTS[phase],
              version: 0,
              promptType: "operator",
              changelog: "Default prompt",
              createdBy: null,
              createdAt: null,
            },
        history: history.map((h) => ({
          id: h.id,
          version: h.version,
          promptType: h.promptType,
          changelog: h.changelog,
          isActive: h.isActive,
          createdBy: h.createdBy,
          createdAt: h.createdAt,
        })),
        defaultContent: DEFAULT_PROMPTS[phase],
      };
    }

    return apiSuccess(prompts);
  } catch (error) {
    return handleApiError(error);
  }
}

const SavePromptSchema = z.object({
  agentPhase: z.enum(AGENT_PHASES),
  content: z.string().min(1),
  changelog: z.string().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSuperAdmin();

    const body = await request.json();
    const parsed = SavePromptSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    const { agentPhase, content, changelog } = parsed.data;

    // Get current max version for this phase
    const latest = await prisma.promptVersion.findFirst({
      where: { workspaceId: null, agentPhase },
      orderBy: { version: "desc" },
    });

    const nextVersion = (latest?.version ?? 0) + 1;

    // Deactivate all existing versions for this phase
    await prisma.promptVersion.updateMany({
      where: { workspaceId: null, agentPhase, isActive: true },
      data: { isActive: false },
    });

    // Create new active version
    const prompt = await prisma.promptVersion.create({
      data: {
        workspaceId: null,
        agentPhase,
        promptType: "operator",
        content,
        version: nextVersion,
        isActive: true,
        createdById: session.user.id,
        changelog: changelog ?? `Version ${nextVersion}`,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return apiSuccess({
      id: prompt.id,
      version: prompt.version,
      content: prompt.content,
      promptType: prompt.promptType,
      changelog: prompt.changelog,
      createdBy: prompt.createdBy,
      createdAt: prompt.createdAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
