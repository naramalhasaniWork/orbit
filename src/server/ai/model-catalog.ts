// Built-in model defaults. Operators override tiers with env vars, and ModelRegistry rows
// (synced or added by admins) supply pricing for anything not listed here.

export type Provider = "anthropic" | "openai" | "openrouter" | "openai-compatible";

/** Per-1K-token USD prices. cacheRead is the cache-hit input price. */
export interface ModelCosts {
  input: number;
  output: number;
  cacheRead: number;
}

export interface ModelSpec {
  id: string;
  provider: Provider;
  costs: ModelCosts;
  maxOutputTokens: number;
  /** Shortest prefix the provider will cache; shorter prefixes silently don't. */
  minCacheableTokens: number;
  /** Models from Opus 4.7 / the 5.x family reject temperature/top_p/top_k. */
  acceptsSampling: boolean;
  /** How to ask for no extended thinking, or null when it can't be turned off. */
  thinkingOff: "disabled" | "between_tools" | null;
  supportsStructuredOutput: boolean;
}

/** Cache writes bill at 1.25x the input price (5-minute TTL). */
export const CACHE_WRITE_MULTIPLIER = 1.25;

const per1K = (inPerM: number, outPerM: number, readPerM: number): ModelCosts => ({
  input: inPerM / 1000,
  output: outPerM / 1000,
  cacheRead: readPerM / 1000,
});

const claude5 = { provider: "anthropic", acceptsSampling: false, minCacheableTokens: 512, supportsStructuredOutput: true } as const;

const BUILT_IN: ModelSpec[] = [
  { id: "claude-haiku-5-5", ...claude5, costs: per1K(0.1, 0.5, 0.01), maxOutputTokens: 64_000, thinkingOff: "disabled" },
  { id: "claude-sonnet-5-5", ...claude5, costs: per1K(2, 10, 0.2), maxOutputTokens: 64_000, thinkingOff: "between_tools" },
  { id: "claude-opus-5-5", ...claude5, costs: per1K(4, 20, 0.2), maxOutputTokens: 64_000, thinkingOff: null },
  // Previous generation: still selectable through AgentConfig.
  { id: "claude-sonnet-4-6", provider: "anthropic", costs: per1K(3, 15, 0.3), maxOutputTokens: 16_384, minCacheableTokens: 1024, acceptsSampling: true, thinkingOff: "disabled", supportsStructuredOutput: false },
  { id: "claude-opus-4-6", provider: "anthropic", costs: per1K(5, 25, 0.5), maxOutputTokens: 16_384, minCacheableTokens: 4096, acceptsSampling: true, thinkingOff: "disabled", supportsStructuredOutput: false },
  { id: "claude-haiku-4-5", provider: "anthropic", costs: per1K(1, 5, 0.1), maxOutputTokens: 8_192, minCacheableTokens: 4096, acceptsSampling: true, thinkingOff: "disabled", supportsStructuredOutput: true },
  { id: "gpt-5.2", provider: "openai", costs: per1K(1.75, 14, 0.18), maxOutputTokens: 16_384, minCacheableTokens: 1024, acceptsSampling: true, thinkingOff: null, supportsStructuredOutput: false },
  { id: "gpt-4.1", provider: "openai", costs: per1K(2, 8, 0.5), maxOutputTokens: 32_768, minCacheableTokens: 1024, acceptsSampling: true, thinkingOff: null, supportsStructuredOutput: false },
  { id: "o4-mini", provider: "openai", costs: per1K(1.1, 4.4, 0.28), maxOutputTokens: 65_536, minCacheableTokens: 1024, acceptsSampling: true, thinkingOff: null, supportsStructuredOutput: false },
];

const BY_ID = new Map(BUILT_IN.map((m) => [m.id, m]));

// Older ids that may still be stored in AgentConfig rows.
const ALIASES: Record<string, string> = {
  "claude-haiku-4-5-20251001": "claude-haiku-4-5",
};

export function getModelSpec(model: string): ModelSpec | undefined {
  return BY_ID.get(ALIASES[model] ?? model);
}

export function listBuiltInModels(): ModelSpec[] {
  return [...BUILT_IN];
}

/** Infer the provider from the id when the model isn't in the catalog. */
export function providerFromId(model: string): Provider | null {
  const spec = getModelSpec(model);
  if (spec) return spec.provider;
  if (model.startsWith("claude")) return "anthropic";
  if (/^(gpt|o[134]-|o[134]$)/.test(model)) return "openai";
  return null;
}

export type ModelTier = "fast" | "balanced" | "deep";

const TIER_ENV: Record<ModelTier, string> = {
  fast: "ORBIT_MODEL_FAST",
  balanced: "ORBIT_MODEL_BALANCED",
  deep: "ORBIT_MODEL_DEEP",
};

const TIER_DEFAULTS: Record<ModelTier, string> = {
  fast: "claude-haiku-5-5",
  balanced: "claude-sonnet-5-5",
  deep: "claude-opus-5-5",
};

/** Model for a tier: env override, else the current-generation default. */
export function modelForTier(tier: ModelTier, env: NodeJS.ProcessEnv = process.env): string {
  return env[TIER_ENV[tier]]?.trim() || TIER_DEFAULTS[tier];
}
