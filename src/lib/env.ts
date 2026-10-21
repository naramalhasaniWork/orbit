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
import { validateAiEnv } from "@/server/ai/env";

const RequiredEnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection string"),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "must be a redis:// connection string"),
  NEXTAUTH_SECRET: z.string().min(32, "must be at least 32 characters (try: openssl rand -base64 32)"),
  NEXTAUTH_URL: z.string().url("must be a full URL, e.g. https://orbit.example.com"),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  ENCRYPTION_KEY: z.string().min(32, "must be at least 32 characters (try: openssl rand -hex 32)"),
});

/** Optional groups: warn only when none of the group's variables is set. */
interface OptionalGroup {
  vars: string[];
  feature: string;
  /** Skip the warning on self-hosted instances. */
  cloudOnly?: boolean;
  /** Skip the warning when hosted (the variables are required there instead). */
  selfHostedOnly?: boolean;
}

const OPTIONAL_GROUPS: OptionalGroup[] = [
  { vars: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG"], feature: "GitHub App installation flow (public repos still work via GITHUB_TOKEN)", selfHostedOnly: true },
  { vars: ["GITHUB_WEBHOOK_SECRET"], feature: "GitHub webhooks (every delivery is rejected until it is set)" },
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

  const ai = validateAiEnv(env);
  errors.push(...ai.errors);
  warnings.push(...ai.warnings);

  const selfHosted = isSelfHosted(env);

  // Hosted Orbit has no operator-token fallback, so repo access needs the GitHub App.
  // Self-hosted instances can still index public repos without it (warning below).
  if (!selfHosted) {
    for (const name of ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG"]) {
      if (!isSet(env, name)) errors.push(`${name} is missing (required for GitHub repo access when not self-hosted)`);
    }
  }

  for (const group of OPTIONAL_GROUPS) {
    if (group.cloudOnly && selfHosted) continue;
    if (group.selfHostedOnly && !selfHosted) continue;
    if (group.vars.some((name) => isSet(env, name))) continue;
    warnings.push(`${group.vars.join(" / ")} not set: ${group.feature} disabled`);
  }

  const storage = env.STORAGE_PROVIDER?.trim() || "local";
  if (!["local", "s3", "r2"].includes(storage)) {
    errors.push(`STORAGE_PROVIDER=${storage} is not supported (use local, s3 or r2)`);
  }
  if (storage === "s3" || storage === "r2") {
    const needed = ["S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY", ...(storage === "r2" ? ["S3_ENDPOINT"] : [])];
    const missing = needed.filter((n) => !isSet(env, n));
    if (missing.length > 0) errors.push(`STORAGE_PROVIDER=${storage} requires ${missing.join(", ")}`);
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
