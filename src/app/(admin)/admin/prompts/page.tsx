import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PromptsClient } from "@/components/admin/prompts-client";
import type { AgentPhase } from "@/generated/prisma/client";

const AGENT_PHASES: AgentPhase[] = [
  "analyst",
  "planner",
  "executor",
  "reporter",
  "auditor",
];

const DEFAULT_PROMPTS: Record<string, string> = {
  analyst:
    "You are the Orbit Analyst agent. Your role is to index codebases, extract system maps of routes, components, endpoints, and data models. Output structured JSON.",
  planner:
    "You are the Orbit Planner agent. Your role is to generate comprehensive, prioritized test plans from system maps. Think adversarially about edge cases. Output structured JSON.",
  executor:
    "You are the Orbit Executor agent. Your role is to execute test cases in the browser using Playwright + Stagehand. Follow each step precisely, capture artifacts, and report verdicts.",
  reporter:
    "You are the Orbit Reporter agent. Your role is to analyze test results, explain failures clearly, suggest fixes, and generate reports for Linear/GitHub/Slack.",
  auditor:
    "You are the Orbit Auditor agent. Your role is to audit code quality, security, accessibility, and performance. Score findings and prioritize issues.",
};

export default async function AdminPromptsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const prompts: Record<string, unknown> = {};

  for (const phase of AGENT_PHASES) {
    const activePrompt = await prisma.promptVersion.findFirst({
      where: { workspaceId: null, agentPhase: phase, isActive: true },
      orderBy: { version: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const history = await prisma.promptVersion.findMany({
      where: { workspaceId: null, agentPhase: phase },
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
            createdAt: activePrompt.createdAt.toISOString(),
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
        createdAt: h.createdAt.toISOString(),
      })),
      defaultContent: DEFAULT_PROMPTS[phase],
    };
  }

  return (
    <PromptsClient
      initialPrompts={JSON.parse(JSON.stringify(prompts))}
    />
  );
}
