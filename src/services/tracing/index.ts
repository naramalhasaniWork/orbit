import { prisma } from "@/lib/db";
import type { AgentPhase } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

// ============================================================
// Types
// ============================================================

interface TraceInput {
  runId: string;
  projectId: string;
  agentPhase: AgentPhase;
  parentTraceId?: string;
  model?: string;
  temperature?: number;
  inputSummary?: string;
}

interface TraceResult {
  outputSummary?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  reasoningSteps?: unknown[];
}

interface ReasoningStep {
  action: string;
  reasoning: string;
  result?: string;
}

export interface TraceNode {
  id: string;
  agentPhase: AgentPhase;
  status: string;
  model: string | null;
  temperature: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  reasoningSteps: unknown;
  inputTokens: number;
  outputTokens: number;
  cost: Prisma.Decimal | null;
  errorMessage: string | null;
  durationMs: number | null;
  metadata: unknown;
  startedAt: Date;
  completedAt: Date | null;
  children: TraceNode[];
}

// ============================================================
// Core Trace Operations
// ============================================================

export async function startTrace(input: TraceInput): Promise<string> {
  const trace = await prisma.agentExecutionTrace.create({
    data: {
      runId: input.runId,
      projectId: input.projectId,
      agentPhase: input.agentPhase,
      parentTraceId: input.parentTraceId,
      model: input.model,
      temperature: input.temperature,
      inputSummary: input.inputSummary,
      status: "started",
    },
    select: { id: true },
  });

  return trace.id;
}

export async function completeTrace(
  traceId: string,
  result: TraceResult
): Promise<void> {
  const trace = await prisma.agentExecutionTrace.findUnique({
    where: { id: traceId },
    select: { startedAt: true },
  });

  const now = new Date();
  const durationMs = trace
    ? now.getTime() - trace.startedAt.getTime()
    : undefined;

  await prisma.agentExecutionTrace.update({
    where: { id: traceId },
    data: {
      status: "completed",
      outputSummary: result.outputSummary,
      inputTokens: result.inputTokens ?? 0,
      outputTokens: result.outputTokens ?? 0,
      cost: result.cost,
      reasoningSteps: result.reasoningSteps
        ? JSON.parse(JSON.stringify(result.reasoningSteps)) as Prisma.InputJsonValue
        : undefined,
      durationMs,
      completedAt: now,
    },
  });
}

export async function failTrace(
  traceId: string,
  error: string
): Promise<void> {
  const trace = await prisma.agentExecutionTrace.findUnique({
    where: { id: traceId },
    select: { startedAt: true },
  });

  const now = new Date();
  const durationMs = trace
    ? now.getTime() - trace.startedAt.getTime()
    : undefined;

  await prisma.agentExecutionTrace.update({
    where: { id: traceId },
    data: {
      status: "failed",
      errorMessage: error,
      durationMs,
      completedAt: now,
    },
  });
}

export async function addReasoningStep(
  traceId: string,
  step: ReasoningStep
): Promise<void> {
  const trace = await prisma.agentExecutionTrace.findUnique({
    where: { id: traceId },
    select: { reasoningSteps: true },
  });

  const existing = Array.isArray(trace?.reasoningSteps)
    ? (trace.reasoningSteps as unknown[])
    : [];

  await prisma.agentExecutionTrace.update({
    where: { id: traceId },
    data: {
      status: "processing",
      reasoningSteps: [...existing, step] as Prisma.InputJsonValue,
    },
  });
}

// ============================================================
// Trace Tree Query
// ============================================================

export async function getTraceTree(runId: string): Promise<TraceNode[]> {
  const traces = await prisma.agentExecutionTrace.findMany({
    where: { runId },
    orderBy: { startedAt: "asc" },
  });

  // Build parent-child map
  const childMap = new Map<string, typeof traces>();
  const roots: typeof traces = [];

  for (const trace of traces) {
    if (trace.parentTraceId) {
      const siblings = childMap.get(trace.parentTraceId) ?? [];
      siblings.push(trace);
      childMap.set(trace.parentTraceId, siblings);
    } else {
      roots.push(trace);
    }
  }

  function buildNode(
    trace: (typeof traces)[0]
  ): TraceNode {
    const children = childMap.get(trace.id) ?? [];
    return {
      id: trace.id,
      agentPhase: trace.agentPhase,
      status: trace.status,
      model: trace.model,
      temperature: trace.temperature,
      inputSummary: trace.inputSummary,
      outputSummary: trace.outputSummary,
      reasoningSteps: trace.reasoningSteps,
      inputTokens: trace.inputTokens,
      outputTokens: trace.outputTokens,
      cost: trace.cost,
      errorMessage: trace.errorMessage,
      durationMs: trace.durationMs,
      metadata: trace.metadata,
      startedAt: trace.startedAt,
      completedAt: trace.completedAt,
      children: children.map(buildNode),
    };
  }

  return roots.map(buildNode);
}

export type { TraceInput, TraceResult, ReasoningStep };
