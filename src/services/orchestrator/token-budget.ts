interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

interface TokenBudgetConfig {
  maxInputTokens: number;
  maxOutputTokens: number;
  warningThreshold: number; // 0-1, percentage at which to warn
}

const DEFAULT_BUDGET: TokenBudgetConfig = {
  maxInputTokens: 2_000_000,
  maxOutputTokens: 500_000,
  warningThreshold: 0.8,
};

export class TokenBudget {
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  private config: TokenBudgetConfig;

  constructor(config?: Partial<TokenBudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET, ...config };
  }

  record(input: number, output: number, cached = 0): void {
    this.usage.inputTokens += input;
    this.usage.outputTokens += output;
    this.usage.cachedTokens += cached;
  }

  getUsage(): TokenUsage {
    return { ...this.usage };
  }

  isOverBudget(): boolean {
    return (
      this.usage.inputTokens > this.config.maxInputTokens ||
      this.usage.outputTokens > this.config.maxOutputTokens
    );
  }

  isNearBudget(): boolean {
    const inputRatio = this.usage.inputTokens / this.config.maxInputTokens;
    const outputRatio = this.usage.outputTokens / this.config.maxOutputTokens;
    return inputRatio > this.config.warningThreshold || outputRatio > this.config.warningThreshold;
  }

  getRemainingInput(): number {
    return Math.max(0, this.config.maxInputTokens - this.usage.inputTokens);
  }

  getRemainingOutput(): number {
    return Math.max(0, this.config.maxOutputTokens - this.usage.outputTokens);
  }

  estimateCost(): number {
    // Approximate cost based on Claude Sonnet pricing
    const inputCostPer1K = 0.003;
    const outputCostPer1K = 0.015;
    const cachedCostPer1K = 0.0003;

    const effectiveInput = this.usage.inputTokens - this.usage.cachedTokens;
    return (
      (effectiveInput / 1000) * inputCostPer1K +
      (this.usage.outputTokens / 1000) * outputCostPer1K +
      (this.usage.cachedTokens / 1000) * cachedCostPer1K
    );
  }

  reset(): void {
    this.usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  }
}
