import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/vault";
import { safeFetch, UnsafeUrlError } from "@/lib/utils/ssrf";
import { isDefaultCandidate, pickDefaultEnvironment } from "@/services/execution/default-environment";
import { gateAccessCredentials } from "@/services/execution/access-headers";

// ============================================================
// Types
// ============================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  environmentUrl: string;
  credentials: Record<string, string>;
}

// ============================================================
// URL Reachability Check
// ============================================================

async function checkUrlReachable(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await safeFetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok && response.status !== 401 && response.status !== 403) {
      return {
        ok: false,
        error: `URL returned status ${response.status}`,
      };
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return { ok: false, error: `URL blocked: ${err.message}` };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Cannot reach URL: ${message}` };
  }
}

// ============================================================
// Environment Validation
// ============================================================

export async function validateEnvironment(
  environmentId: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const credentials: Record<string, string> = {};

  // Load environment
  const environment = await prisma.environment.findUnique({
    where: { id: environmentId },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  if (!environment) {
    return {
      valid: false,
      errors: ["Environment not found"],
      warnings: [],
      environmentUrl: "",
      credentials: {},
    };
  }

  // Block production environments
  if (environment.type === "production") {
    return {
      valid: false,
      errors: ["Cannot run tests against production environments"],
      warnings: [],
      environmentUrl: environment.url,
      credentials: {},
    };
  }

  // Check URL reachability
  const reachability = await checkUrlReachable(environment.url);
  if (!reachability.ok) {
    errors.push(`Environment URL is not reachable: ${reachability.error}`);
  }

  // Load and decrypt secrets
  const secrets = await prisma.secret.findMany({
    where: {
      projectId: environment.projectId,
      OR: [
        { environmentId: environment.id },
        { environmentId: null },
      ],
    },
  });

  for (const secret of secrets) {
    try {
      credentials[secret.key] = decrypt(secret.encryptedValue, secret.iv);
    } catch {
      warnings.push(`Failed to decrypt secret "${secret.key}"`);
    }
  }

  // Check for common required secrets
  const commonKeys = ["TEST_EMAIL", "TEST_PASSWORD"];
  const missingKeys = commonKeys.filter(
    (key) => !credentials[key] && !secrets.some((s) => s.key === key)
  );

  if (missingKeys.length > 0) {
    warnings.push(
      `Missing common test credentials: ${missingKeys.join(", ")}. ` +
        "Test cases requiring authentication may fail."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    environmentUrl: environment.url,
    credentials: gateAccessCredentials(credentials, environment.accessMode),
  };
}

// ============================================================
// Get Default Environment
// ============================================================

export async function getDefaultEnvironment(
  projectId: string
): Promise<string | null> {
  const environments = await prisma.environment.findMany({
    where: { projectId },
    select: { id: true, type: true, isDefault: true, createdAt: true, archivedAt: true, source: true },
  });
  return pickDefaultEnvironment(environments.filter(isDefaultCandidate))?.id ?? null;
}
