// Provider registry: which ChatProvider serves a model, with which credentials.

import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/vault";
import { assertPublicUrl } from "@/lib/utils/ssrf";
import { providerFromId, type Provider } from "@/server/ai/model-catalog";
import { ProviderError } from "@/server/ai/errors";
import { anthropicProvider } from "./anthropic";
import { createCompatibleProvider, openaiProvider, openrouterProvider } from "./openai-compatible";
import type { ChatProvider } from "@/server/ai/types";

export { getEmbeddingProvider, getEmbeddingMode, type EmbeddingMode } from "./embeddings";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ProviderConfig.provider uses "custom" for an OpenAI-compatible endpoint. */
const CONFIG_NAME: Record<Provider, string> = {
  anthropic: "anthropic",
  openai: "openai",
  openrouter: "openrouter",
  "openai-compatible": "custom",
};

export interface ResolvedProvider {
  provider: ChatProvider;
  apiKey?: string;
}

interface WorkspaceCredential {
  apiKey: string | null;
  baseUrl: string | null;
}

/** Provider for a model: catalog/id prefix first, then the ModelRegistry, else OpenRouter. */
export async function providerForModel(model: string): Promise<Provider> {
  const known = providerFromId(model);
  if (known) return known;
  const entry = await prisma.modelRegistry.findFirst({
    where: { modelId: model, isActive: true },
    select: { provider: true },
  });
  if (entry?.provider === "custom") return "openai-compatible";
  if (entry && entry.provider in CONFIG_NAME) return entry.provider as Provider;
  return "openrouter";
}

export async function getWorkspaceCredential(workspaceId: string, provider: Provider): Promise<WorkspaceCredential | null> {
  // Internal callers use pseudo-workspace ids like "system": no BYOK row.
  if (!UUID_RE.test(workspaceId)) return null;
  const config = await prisma.providerConfig.findUnique({
    where: { provider_config_unique: { workspaceId, provider: CONFIG_NAME[provider] } },
    select: { apiKeyEncrypted: true, baseUrl: true, isActive: true },
  });
  if (!config?.isActive) return null;

  let apiKey: string | null = null;
  // apiKeyEncrypted stores "iv:encrypted"
  const [iv, encrypted] = (config.apiKeyEncrypted ?? "").split(":");
  if (iv && encrypted) {
    try {
      apiKey = decrypt(encrypted, iv);
    } catch {
      console.error(`[AI] Could not decrypt the ${provider} key for workspace ${workspaceId}`);
    }
  }
  return { apiKey, baseUrl: config.baseUrl };
}

async function compatibleEndpoint(baseUrl: string): Promise<ChatProvider> {
  // assertPublicUrl honours ORBIT_ALLOW_PRIVATE_TARGETS for self-hosters on a LAN.
  await assertPublicUrl(baseUrl);
  return createCompatibleProvider({
    name: "openai-compatible",
    baseUrl,
    apiKeyEnv: "ORBIT_OPENAI_COMPATIBLE_API_KEY",
    apiKeyOptional: true,
  });
}

/** Resolve the provider and key for a call. An explicit key wins over workspace BYOK. */
export async function resolveProvider(
  model: string,
  workspaceId: string,
  explicitKey?: string
): Promise<ResolvedProvider> {
  const name = await providerForModel(model);
  const cred = await getWorkspaceCredential(workspaceId, name).catch(() => null);
  const apiKey = explicitKey ?? cred?.apiKey ?? undefined;

  switch (name) {
    case "anthropic":
      return { provider: anthropicProvider, apiKey };
    case "openai":
      return { provider: openaiProvider, apiKey };
    case "openrouter":
      return { provider: openrouterProvider, apiKey };
    case "openai-compatible": {
      const baseUrl = cred?.baseUrl ?? process.env.ORBIT_OPENAI_COMPATIBLE_BASE_URL?.trim();
      if (!baseUrl) {
        throw new ProviderError(name, "No base URL for the OpenAI-compatible provider: set ORBIT_OPENAI_COMPATIBLE_BASE_URL or a workspace endpoint", { retryable: false });
      }
      return { provider: await compatibleEndpoint(baseUrl), apiKey };
    }
  }
}

/** Platform-level chat providers configured through env vars. */
export function configuredEnvProviders(env: NodeJS.ProcessEnv = process.env): Provider[] {
  const set = (k: string) => Boolean(env[k]?.trim());
  const out: Provider[] = [];
  if (set("ANTHROPIC_API_KEY")) out.push("anthropic");
  if (set("OPENAI_API_KEY")) out.push("openai");
  if (set("OPENROUTER_API_KEY")) out.push("openrouter");
  if (set("ORBIT_OPENAI_COMPATIBLE_BASE_URL")) out.push("openai-compatible");
  return out;
}
