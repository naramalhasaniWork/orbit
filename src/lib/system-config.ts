import { prisma } from "@/lib/db";

/**
 * Platform-wide settings edited on the admin System page (SystemConfig rows).
 * Every key here has a reader; settings nothing consumes don't belong here.
 */

export const FEATURE_FLAG_DEFAULTS = {
  /** AI selector repair when a step's selector stops matching. */
  self_healing: true,
  /** LLM test suggestions on the Test Plans page. */
  ai_suggestions: true,
  /** Journey-partitioned parallel execution for full/smoke runs. */
  parallel_execution: true,
  /** Screenshot-comparison cases added to generated plans. */
  visual_regression: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAG_DEFAULTS;

export interface SystemConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcement: string;
  featureFlags: Record<FeatureFlag, boolean>;
}

const CACHE_TTL_MS = 30_000;

let cached: { value: SystemConfig; expiresAt: number } | null = null;

export function parseSystemConfig(rows: Array<{ key: string; value: unknown }>): SystemConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const storedFlags = map.get("feature_flags");
  const featureFlags = { ...FEATURE_FLAG_DEFAULTS } as Record<FeatureFlag, boolean>;
  if (storedFlags && typeof storedFlags === "object") {
    for (const name of Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlag[]) {
      const v = (storedFlags as Record<string, unknown>)[name];
      if (typeof v === "boolean") featureFlags[name] = v;
    }
  }
  const str = (key: string) => {
    const v = map.get(key);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    maintenanceMode: map.get("maintenance_mode") === true,
    maintenanceMessage: str("maintenance_message"),
    announcement: str("system_announcement"),
    featureFlags,
  };
}

/**
 * Cached per process for CACHE_TTL_MS. A DB failure falls back to defaults
 * (no maintenance, default flags) rather than taking the app down with it.
 */
export async function getSystemConfig(): Promise<SystemConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const rows = await prisma.systemConfig.findMany({ select: { key: true, value: true } });
    const value = parseSystemConfig(rows);
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (err) {
    console.error("[system-config] Failed to load, using defaults:", err instanceof Error ? err.message : err);
    return cached?.value ?? parseSystemConfig([]);
  }
}

export async function getFlag(name: FeatureFlag): Promise<boolean> {
  return (await getSystemConfig()).featureFlags[name];
}

/** Called after an admin edit so this process sees the change immediately. */
export function invalidateSystemConfigCache(): void {
  cached = null;
}
