import { apiSuccess, apiError } from "@/lib/utils/api";
import { decrypt } from "@/lib/vault";
import { safeFetch, UnsafeUrlError } from "@/lib/utils/ssrf";
import { route } from "@/server/http/route";

// baseUrl is user-supplied and these requests carry the API key, so they go through the SSRF
// guard and never follow redirects.
const noRedirects = { followRedirects: false } as const;

function decryptApiKey(apiKeyEncrypted: string): string {
  const [iv, encrypted] = apiKeyEncrypted.split(":");
  return decrypt(encrypted, iv);
}

async function testAnthropic(apiKey: string, baseUrl?: string): Promise<{ success: boolean; message: string }> {
  const url = `${baseUrl || "https://api.anthropic.com"}/v1/messages`;
  const res = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "Say hello" }],
    }),
  }, noRedirects);

  if (res.ok) {
    return { success: true, message: "Anthropic API key is valid" };
  }

  const body = await res.json().catch(() => null);
  const errorMsg = body?.error?.message || `HTTP ${res.status}`;
  return { success: false, message: `Anthropic API error: ${errorMsg}` };
}

async function testOpenAI(apiKey: string, baseUrl?: string): Promise<{ success: boolean; message: string }> {
  const url = `${baseUrl || "https://api.openai.com"}/v1/chat/completions`;
  const res = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      max_tokens: 10,
      messages: [{ role: "user", content: "Say hello" }],
    }),
  }, noRedirects);

  if (res.ok) {
    return { success: true, message: "OpenAI API key is valid" };
  }

  const body = await res.json().catch(() => null);
  const errorMsg = body?.error?.message || `HTTP ${res.status}`;
  return { success: false, message: `OpenAI API error: ${errorMsg}` };
}

async function testOpenRouter(apiKey: string, baseUrl?: string): Promise<{ success: boolean; message: string }> {
  const url = `${baseUrl || "https://openrouter.ai"}/api/v1/models`;
  const res = await safeFetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }, noRedirects);

  if (res.ok) {
    return { success: true, message: "OpenRouter API key is valid" };
  }

  const body = await res.json().catch(() => null);
  const errorMsg = body?.error?.message || `HTTP ${res.status}`;
  return { success: false, message: `OpenRouter API error: ${errorMsg}` };
}

async function testCustom(apiKey: string, baseUrl?: string): Promise<{ success: boolean; message: string }> {
  if (!baseUrl) {
    return { success: false, message: "Custom provider requires a base URL" };
  }

  // Try the OpenAI-compatible /v1/models endpoint
  const url = `${baseUrl}/v1/models`;
  const res = await safeFetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }, noRedirects);

  if (res.ok) {
    return { success: true, message: "Custom provider API key is valid" };
  }

  return { success: false, message: `Custom provider returned HTTP ${res.status}` };
}

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ params: { provider }, workspaceId, db }) => {
    const config = await db.providerConfig.findUnique({
      where: { provider_config_unique: { workspaceId, provider } },
    });

    if (!config) {
      return apiError("Provider config not found", "NOT_FOUND", 404);
    }

    if (!config.apiKeyEncrypted) {
      return apiError("No API key configured for this provider", "VALIDATION_ERROR", 400);
    }

    const apiKey = decryptApiKey(config.apiKeyEncrypted);
    const startTime = Date.now();

    const testers: Record<string, (key: string, url?: string) => Promise<{ success: boolean; message: string }>> = {
      anthropic: testAnthropic,
      openai: testOpenAI,
      openrouter: testOpenRouter,
      custom: testCustom,
    };

    const tester = testers[provider];
    if (!tester) {
      return apiError(`No test available for provider: ${provider}`, "VALIDATION_ERROR", 400);
    }

    let result: { success: boolean; message: string };
    try {
      result = await tester(apiKey, config.baseUrl ?? undefined);
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return apiError(`Base URL is not allowed: ${err.message}`, "VALIDATION_ERROR", 400);
      }
      throw err;
    }
    const latencyMs = Date.now() - startTime;

    return apiSuccess({
      success: result.success,
      message: result.message,
      latencyMs,
    });
  }
);
