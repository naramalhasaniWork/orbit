/** Thrown when a call would push a workspace or run past its AI spend limit. Never retried. */
export class BudgetExceededError extends Error {
  readonly scope: "workspace" | "run";

  constructor(scope: "workspace" | "run", message: string) {
    super(message);
    this.name = "BudgetExceededError";
    this.scope = scope;
  }
}

/** A provider call failed. `retryable` covers 408/409/429/5xx and network errors. */
export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number | undefined;
  readonly retryable: boolean;
  /** Server-suggested wait, from a retry-after header. */
  readonly retryAfterMs: number | undefined;

  constructor(
    provider: string,
    message: string,
    opts: { status?: number; retryable?: boolean; retryAfterMs?: number } = {}
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = opts.status;
    this.retryable = opts.retryable ?? isRetryableStatus(opts.status);
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network failure
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export function isBudgetExceeded(err: unknown): err is BudgetExceededError {
  return err instanceof BudgetExceededError;
}

export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
