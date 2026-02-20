import { getModelCosts } from "@/lib/ai/model-router";

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

function getCostForModel(model: string) {
  const costs = getModelCosts(model);
  return costs ?? { input: 0.003, output: 0.015, cached: 0.0003 };
}

type AgentPhase = "analyst" | "planner" | "executor" | "reporter" | "auditor";

interface AgentTokenUsage extends TokenUsage {
  callCount: number;
}

interface TokenBudgetConfig {
  maxInputTokens: number;
  maxOutputTokens: number;
  warningThreshold: number; // 0-1, percentage at which to warn
  perAgentLimits?: Partial<Record<AgentPhase, { maxInput: number; maxOutput: number }>>;
}

const DEFAULT_BUDGET: TokenBudgetConfig = {
  maxInputTokens: 2_000_000,
  maxOutputTokens: 500_000,
  warningThreshold: 0.8,
  perAgentLimits: {
    analyst: { maxInput: 400_000, maxOutput: 100_000 },
    planner: { maxInput: 600_000, maxOutput: 200_000 },
    executor: { maxInput: 800_000, maxOutput: 150_000 },
    reporter: { maxInput: 200_000, maxOutput: 50_000 },
    auditor: { maxInput: 500_000, maxOutput: 150_000 },
  },
};

export class TokenBudget {
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  private agentUsage: Map<AgentPhase, AgentTokenUsage> = new Map();
  private config: TokenBudgetConfig;

  constructor(config?: Partial<TokenBudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET, ...config };
  }

  record(input: number, output: number, cached = 0, agent?: AgentPhase): void {
    this.usage.inputTokens += input;
    this.usage.outputTokens += output;
    this.usage.cachedTokens += cached;

    if (agent) {
      const existing = this.agentUsage.get(agent) ?? {
        inputTokens: 0, outputTokens: 0, cachedTokens: 0, callCount: 0,
      };
      existing.inputTokens += input;
      existing.outputTokens += output;
      existing.cachedTokens += cached;
      existing.callCount += 1;
      this.agentUsage.set(agent, existing);
    }
  }

  getUsage(): TokenUsage {
    return { ...this.usage };
  }

  getAgentUsage(agent: AgentPhase): AgentTokenUsage {
    return this.agentUsage.get(agent) ?? {
      inputTokens: 0, outputTokens: 0, cachedTokens: 0, callCount: 0,
    };
  }

  getAllAgentUsage(): Record<AgentPhase, AgentTokenUsage> {
    const phases: AgentPhase[] = ["analyst", "planner", "executor", "reporter", "auditor"];
    const result = {} as Record<AgentPhase, AgentTokenUsage>;
    for (const phase of phases) {
      result[phase] = this.getAgentUsage(phase);
    }
    return result;
  }

  isOverBudget(): boolean {
    return (
      this.usage.inputTokens > this.config.maxInputTokens ||
      this.usage.outputTokens > this.config.maxOutputTokens
    );
  }

  isAgentOverBudget(agent: AgentPhase): boolean {
    const limits = this.config.perAgentLimits?.[agent];
    if (!limits) return false;

    const usage = this.getAgentUsage(agent);
    return usage.inputTokens > limits.maxInput || usage.outputTokens > limits.maxOutput;
  }

  isNearBudget(): boolean {
    const inputRatio = this.usage.inputTokens / this.config.maxInputTokens;
    const outputRatio = this.usage.outputTokens / this.config.maxOutputTokens;
    return inputRatio > this.config.warningThreshold || outputRatio > this.config.warningThreshold;
  }

  getRemainingInput(agent?: AgentPhase): number {
    if (agent) {
      const limits = this.config.perAgentLimits?.[agent];
      if (limits) {
        const usage = this.getAgentUsage(agent);
        return Math.max(0, limits.maxInput - usage.inputTokens);
      }
    }
    return Math.max(0, this.config.maxInputTokens - this.usage.inputTokens);
  }

  getRemainingOutput(agent?: AgentPhase): number {
    if (agent) {
      const limits = this.config.perAgentLimits?.[agent];
      if (limits) {
        const usage = this.getAgentUsage(agent);
        return Math.max(0, limits.maxOutput - usage.outputTokens);
      }
    }
    return Math.max(0, this.config.maxOutputTokens - this.usage.outputTokens);
  }

  estimateCost(model?: string): number {
    // Use model-specific pricing if available, otherwise default to Sonnet pricing
    const costs = model
      ? getCostForModel(model)
      : { input: 0.003, output: 0.015, cached: 0.0003 };

    const effectiveInput = this.usage.inputTokens - this.usage.cachedTokens;
    return (
      (effectiveInput / 1000) * costs.input +
      (this.usage.outputTokens / 1000) * costs.output +
      (this.usage.cachedTokens / 1000) * costs.cached
    );
  }

  reset(): void {
    this.usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    this.agentUsage.clear();
  }
}

export type { TokenUsage, AgentPhase, AgentTokenUsage, TokenBudgetConfig };
