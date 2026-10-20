/**
 * Boot-time environment validation. Called from instrumentation.ts.
 *
 * Missing/invalid required variables abort startup with one readable list.
 * Missing optional variables only log a warning naming the feature they disable.
 * Set SKIP_ENV_VALIDATION=true to bypass (e.g. one-off scripts); it is skipped
 * automatically during `next build`.
 */

import { z } from "zod";
import { getSignupMode, isSelfHosted, type Env } from "@/lib/self-host";

const RequiredEnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection string"),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "must be a redis:// connection string"),
  NEXTAUTH_SECRET: z.string().min(32, "must be at least 32 characters (try: openssl rand -base64 32)"),
  NEXTAUTH_URL: z.string().url("must be a full URL, e.g. https://orbit.example.com"),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  ENCRYPTION_KEY: z.string().min(32, "must be at least 32 characters (try: openssl rand -hex 32)"),
  ANTHROPIC_API_KEY: z.string(),
});

/** Optional groups: warn only when none of the group's variables is set. */
interface OptionalGroup {
  vars: string[];
  feature: string;
  /** Skip the warning on self-hosted instances. */
  cloudOnly?: boolean;
}

const OPTIONAL_GROUPS: OptionalGroup[] = [
  { vars: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG"], feature: "GitHub App installation flow" },
  { vars: ["GITHUB_WEBHOOK_SECRET"], feature: "GitHub webhook signature verification" },
  { vars: ["OPENROUTER_API_KEY"], feature: "OpenRouter model fallback" },
  { vars: ["SLACK_SIGNING_SECRET"], feature: "Slack interactions" },
  { vars: ["LINEAR_API_KEY"], feature: "Linear issue creation" },
  { vars: ["BROWSERBASE_API_KEY"], feature: "Browserbase cloud browsers (local Playwright is used)" },
  { vars: ["SUPER_ADMIN_EMAILS"], feature: "automatic super-admin promotion", cloudOnly: true },
  { vars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], feature: "billing", cloudOnly: true },
];

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

export class EnvValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(
      `Invalid environment configuration:\n${errors.map((e) => `  - ${e}`).join("\n")}\n` +
        "Set the variables above (see .env.example) and restart."
    );
    this.name = "EnvValidationError";
  }
}

const isSet = (env: Env, name: string) => Boolean(env[name]?.trim());

export function validateEnv(env: Env = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Treat blank values ("FOO=") as missing
  const present = Object.fromEntries(
    Object.keys(RequiredEnvSchema.shape).map((name) => [name, env[name]?.trim() || undefined])
  );
  const parsed = RequiredEnvSchema.safeParse(present);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0]);
      errors.push(
        present[name] === undefined ? `${name} is missing` : `${name} is invalid: ${issue.message}`
      );
    }
  }

  const selfHosted = isSelfHosted(env);
  for (const group of OPTIONAL_GROUPS) {
    if (group.cloudOnly && selfHosted) continue;
    if (group.vars.some((name) => isSet(env, name))) continue;
    warnings.push(`${group.vars.join(" / ")} not set: ${group.feature} disabled`);
  }

  if (env.STORAGE_PROVIDER === "s3") {
    const missing = ["S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"].filter((n) => !isSet(env, n));
    if (missing.length > 0) errors.push(`STORAGE_PROVIDER=s3 requires ${missing.join(", ")}`);
  }

  if (selfHosted && getSignupMode(env) === "open") {
    warnings.push("ORBIT_SIGNUP=open on a self-hosted instance: anyone with a GitHub account can sign up");
  }

  return { errors, warnings };
}

/** Log warnings and throw EnvValidationError listing every problem. */
export function assertEnv(env: Env = process.env): void {
  if (env.SKIP_ENV_VALIDATION === "true" || env.NEXT_PHASE === "phase-production-build") return;

  const { errors, warnings } = validateEnv(env);
  for (const warning of warnings) console.warn(`[Env] ${warning}`);
  if (errors.length > 0) throw new EnvValidationError(errors);
  if (isSelfHosted(env)) console.log("[Env] Self-hosted mode: billing and tier limits disabled");
}
