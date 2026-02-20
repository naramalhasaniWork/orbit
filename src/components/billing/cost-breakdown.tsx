"use client";

import { Bot, Cpu, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentBreakdown {
  agent: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  avgCostPerCall: number;
}

interface ModelBreakdown {
  model: string;
  calls: number;
  cost: number;
  percentage: number;
}

interface ProjectBreakdown {
  projectId: string;
  projectName: string;
  cost: number;
  calls: number;
}

interface DailySpend {
  date: string;
  cost: number;
}

const AGENT_LABELS: Record<string, string> = {
  analyst: "Analyst",
  planner: "Planner",
  executor: "Executor",
  reporter: "Reporter",
  auditor: "Auditor",
};

const AGENT_COLORS: Record<string, string> = {
  analyst: "bg-blue-400",
  planner: "bg-violet-400",
  executor: "bg-amber-400",
  reporter: "bg-emerald-400",
  auditor: "bg-rose-400",
};

const MODEL_COLORS = [
  "bg-blue-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-rose-400",
  "bg-cyan-400",
];

export function AgentTable({ agents }: { agents: AgentBreakdown[] }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          <Bot className="h-3.5 w-3.5" />
          Agent Breakdown
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Agent</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Calls</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Input Tokens</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Output Tokens</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Cost</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Avg/Call</th>
            </tr>
          </thead>
          <tbody>
            {agents
              .sort((a, b) => b.cost - a.cost)
              .map((agent) => (
                <tr key={agent.agent} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full", AGENT_COLORS[agent.agent] ?? "bg-white/20")} />
                      <span className="text-foreground font-medium">
                        {AGENT_LABELS[agent.agent] ?? agent.agent}
                      </span>
                    </div>
                  </td>
                  <td className="text-right px-4 py-2.5 text-foreground">{agent.calls.toLocaleString()}</td>
                  <td className="text-right px-4 py-2.5 text-muted-foreground">{formatTokens(agent.inputTokens)}</td>
                  <td className="text-right px-4 py-2.5 text-muted-foreground">{formatTokens(agent.outputTokens)}</td>
                  <td className="text-right px-4 py-2.5 text-foreground font-medium">${agent.cost.toFixed(2)}</td>
                  <td className="text-right px-4 py-2.5 text-muted-foreground">${agent.avgCostPerCall.toFixed(3)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ModelChart({ models }: { models: ModelBreakdown[] }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h4 className="text-xs font-medium text-muted-foreground mb-4 flex items-center gap-2">
        <Cpu className="h-3.5 w-3.5" />
        Spend by Model
      </h4>
      <div className="space-y-2">
        {models.map((model, i) => (
          <div key={model.model} className="flex items-center gap-3">
            <div className={cn("h-2 w-2 rounded-full shrink-0", MODEL_COLORS[i % MODEL_COLORS.length])} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-foreground font-mono truncate">
                  {formatModelName(model.model)}
                </span>
                <span className="text-xs text-foreground font-medium ml-2">${model.cost.toFixed(2)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={cn("h-full rounded-full", MODEL_COLORS[i % MODEL_COLORS.length])}
                  style={{ width: `${model.percentage}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectList({ projects }: { projects: ProjectBreakdown[] }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <FolderOpen className="h-3.5 w-3.5" />
        Top Projects by Cost
      </h4>
      <div className="space-y-2">
        {projects.map((project, i) => (
          <div key={project.projectId} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
              <span className="text-xs text-foreground truncate">{project.projectName}</span>
            </div>
            <div className="flex items-center gap-3 ml-2">
              <span className="text-[10px] text-muted-foreground">{project.calls} calls</span>
              <span className="text-xs text-foreground font-medium">${project.cost.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DailySparkline({ daily }: { daily: DailySpend[] }) {
  const maxCost = Math.max(...daily.map((d) => d.cost), 0.001);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h4 className="text-xs font-medium text-muted-foreground mb-3">Daily Spend</h4>
      <div className="flex items-end gap-[2px] h-16">
        {daily.map((day) => {
          const height = (day.cost / maxCost) * 100;
          return (
            <div
              key={day.date}
              className="flex-1 bg-orbit-accent/30 hover:bg-orbit-accent/50 rounded-t transition-colors cursor-default"
              style={{ height: `${Math.max(height, 2)}%` }}
              title={`${day.date}: $${day.cost.toFixed(4)}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{daily[0]?.date ?? ""}</span>
        <span className="text-[10px] text-muted-foreground">{daily[daily.length - 1]?.date ?? ""}</span>
      </div>
    </div>
  );
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatModelName(model: string): string {
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("opus")) return "Opus";
  if (model === "gpt-4o") return "GPT-4o";
  if (model === "gpt-4o-mini") return "GPT-4o Mini";
  return model;
}

export type { AgentBreakdown, ModelBreakdown, ProjectBreakdown, DailySpend };
