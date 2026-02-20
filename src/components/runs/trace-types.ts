// Serializable trace node for client components (Decimal -> string)
export interface TraceNodeData {
  id: string;
  agentPhase: string;
  status: string;
  model: string | null;
  temperature: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  reasoningSteps: unknown;
  inputTokens: number;
  outputTokens: number;
  cost: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  metadata: unknown;
  startedAt: string;
  completedAt: string | null;
  children: TraceNodeData[];
}

export const AGENT_PHASE_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  analyst: {
    label: "Analyst",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/40",
  },
  planner: {
    label: "Planner",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500/40",
  },
  executor: {
    label: "Executor",
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    borderColor: "border-amber-500/40",
  },
  reporter: {
    label: "Reporter",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
    borderColor: "border-emerald-500/40",
  },
  auditor: {
    label: "Auditor",
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
    borderColor: "border-rose-500/40",
  },
};

export const TRACE_STATUS_CONFIG: Record<
  string,
  { label: string; dotColor: string }
> = {
  started: { label: "Started", dotColor: "bg-muted-foreground" },
  processing: { label: "Processing", dotColor: "bg-orbit-accent" },
  completed: { label: "Completed", dotColor: "bg-orbit-pass" },
  failed: { label: "Failed", dotColor: "bg-orbit-fail" },
};

export function formatTraceTokens(count: number): string {
  if (count === 0) return "0";
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

export function formatTraceDuration(ms: number | null): string {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatTraceCost(cost: string | null): string {
  if (!cost) return "--";
  const num = parseFloat(cost);
  if (isNaN(num)) return "--";
  return `$${num.toFixed(4)}`;
}
