// Usage accounting: one token_usage row per provider call, with cache reads and writes.

import { prisma } from "@/lib/db";
import type { CallContext, Usage } from "@/server/ai/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Persist a call's usage. Pseudo workspaces ("system") are not recorded. */
export async function recordUsage(ctx: CallContext, model: string, usage: Usage, cost: number): Promise<void> {
  if (!UUID_RE.test(ctx.workspaceId)) return;

  // Sub-agent ids may carry suffixes ("plan-<uuid>-<ts>") that are not valid UUIDs.
  const runId = ctx.runId && UUID_RE.test(ctx.runId) ? ctx.runId : null;
  const projectId = ctx.projectId && UUID_RE.test(ctx.projectId) ? ctx.projectId : null;

  await prisma.tokenUsage.create({
    data: {
      workspaceId: ctx.workspaceId,
      projectId,
      runId,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      cost: parseFloat(cost.toFixed(6)),
      agentPhase: ctx.agentPhase,
    },
  });
}
