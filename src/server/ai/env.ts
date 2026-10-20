// Boot-time checks for the AI layer: at least one chat provider, and a coherent
// embeddings choice. Pure (env in, messages out) so lib/env and setup checks share it.

import { configuredEnvProviders } from "@/server/ai/providers";

const EMBEDDING_KEYS: Record<string, string | null> = {
  openai: "OPENAI_API_KEY",
  voyage: "VOYAGE_API_KEY",
  ollama: null,
  none: null,
};

const set = (env: Record<string, string | undefined>, name: string) => Boolean(env[name]?.trim());

/** Workspaces bring their own keys (Settings > Providers) instead of a platform key. */
export function isByokOnly(env: Record<string, string | undefined>): boolean {
  return env.ORBIT_AI_KEYS?.trim().toLowerCase() === "byok";
}

export function validateAiEnv(env: Record<string, string | undefined>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (configuredEnvProviders(env).length === 0) {
    if (isByokOnly(env)) {
      warnings.push("No platform AI key (ORBIT_AI_KEYS=byok): AI features work only for workspaces that add a provider key");
    } else {
      errors.push(
        "No AI chat provider configured: set ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY or " +
          "ORBIT_OPENAI_COMPATIBLE_BASE_URL, or set ORBIT_AI_KEYS=byok to rely on per-workspace keys"
      );
    }
  }

  const baseUrl = env.ORBIT_OPENAI_COMPATIBLE_BASE_URL?.trim();
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    errors.push("ORBIT_OPENAI_COMPATIBLE_BASE_URL is invalid: must be an http(s) URL");
  }

  const mode = env.ORBIT_EMBEDDINGS?.trim().toLowerCase();
  if (mode) {
    if (!(mode in EMBEDDING_KEYS)) {
      errors.push(`ORBIT_EMBEDDINGS=${mode} is not supported (use openai, voyage, ollama or none)`);
    } else {
      const key = EMBEDDING_KEYS[mode];
      if (key && !set(env, key)) errors.push(`ORBIT_EMBEDDINGS=${mode} requires ${key}`);
    }
  } else if (!set(env, "OPENAI_API_KEY")) {
    warnings.push("ORBIT_EMBEDDINGS not set and no OPENAI_API_KEY: semantic search uses keyword matching");
  }

  return { errors, warnings };
}
