import { describe, it, expect, vi } from "vitest";
import { assertEnv, EnvValidationError, validateEnv } from "@/lib/env";
import type { Env } from "@/lib/self-host";

const VALID: Env = {
  DATABASE_URL: "postgres://u:p@localhost:5432/orbit",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_SECRET: "s".repeat(32),
  NEXTAUTH_URL: "https://orbit.example.com",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
  ENCRYPTION_KEY: "e".repeat(64),
  ANTHROPIC_API_KEY: "sk-ant-x",
  GITHUB_APP_ID: "123",
  GITHUB_APP_PRIVATE_KEY: "pem",
  GITHUB_APP_SLUG: "orbit",
};

describe("validateEnv", () => {
  it("passes with all required variables", () => {
    expect(validateEnv(VALID).errors).toEqual([]);
  });

  it("lists every missing required variable at once", () => {
    const { errors } = validateEnv({});
    expect(errors).toHaveLength(11);
    for (const name of Object.keys(VALID).filter((n) => n !== "ANTHROPIC_API_KEY")) {
      expect(errors.some((e) => e.startsWith(`${name} is missing`))).toBe(true);
    }
    expect(errors.some((e) => e.startsWith("No AI chat provider configured"))).toBe(true);
  });

  it("accepts any chat provider, not only Anthropic", () => {
    const { ANTHROPIC_API_KEY: _omit, ...rest } = VALID;
    expect(validateEnv({ ...rest, OPENAI_API_KEY: "sk-x" }).errors).toEqual([]);
    expect(validateEnv({ ...rest, OPENROUTER_API_KEY: "sk-or" }).errors).toEqual([]);
    expect(validateEnv({ ...rest, ORBIT_OPENAI_COMPATIBLE_BASE_URL: "http://ollama:11434/v1" }).errors).toEqual([]);
  });

  it("allows a BYOK-only deployment with a warning", () => {
    const { ANTHROPIC_API_KEY: _omit, ...rest } = VALID;
    const { errors, warnings } = validateEnv({ ...rest, ORBIT_AI_KEYS: "byok" });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("ORBIT_AI_KEYS=byok"))).toBe(true);
  });

  it("checks the embeddings choice", () => {
    expect(validateEnv({ ...VALID, ORBIT_EMBEDDINGS: "none" }).errors).toEqual([]);
    expect(validateEnv({ ...VALID, ORBIT_EMBEDDINGS: "voyage" }).errors).toContain("ORBIT_EMBEDDINGS=voyage requires VOYAGE_API_KEY");
    expect(validateEnv({ ...VALID, ORBIT_EMBEDDINGS: "cohere" }).errors[0]).toContain("not supported");
  });

  it("treats blank values as missing", () => {
    expect(validateEnv({ ...VALID, REDIS_URL: "   " }).errors).toEqual(["REDIS_URL is missing"]);
  });

  it("flags malformed values with the reason", () => {
    const { errors } = validateEnv({
      ...VALID,
      DATABASE_URL: "mysql://x",
      NEXTAUTH_URL: "orbit.example.com",
      NEXTAUTH_SECRET: "short",
      ENCRYPTION_KEY: "short",
    });
    expect(errors).toHaveLength(4);
    expect(errors.find((e) => e.startsWith("DATABASE_URL"))).toContain("postgres://");
    expect(errors.find((e) => e.startsWith("NEXTAUTH_URL"))).toContain("full URL");
    expect(errors.find((e) => e.startsWith("NEXTAUTH_SECRET"))).toContain("32 characters");
  });

  it("requires the GitHub App vars when hosted, but only warns when self-hosted", () => {
    const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG, ...base } = VALID;
    void GITHUB_APP_ID; void GITHUB_APP_PRIVATE_KEY; void GITHUB_APP_SLUG;
    const hosted = validateEnv(base);
    expect(hosted.errors).toHaveLength(3);
    expect(hosted.errors[0]).toContain("GITHUB_APP_ID is missing");
    const only = validateEnv({ ...base, GITHUB_APP_ID: "1", GITHUB_APP_SLUG: "s" });
    expect(only.errors).toEqual([expect.stringContaining("GITHUB_APP_PRIVATE_KEY")]);

    const selfHosted = validateEnv({ ...base, ORBIT_SELF_HOSTED: "true", ORBIT_SIGNUP: "invite" });
    expect(selfHosted.errors).toEqual([]);
    expect(selfHosted.warnings.some((w) => w.includes("GITHUB_APP_ID") && w.includes("public repos"))).toBe(true);
  });

  it("supports r2 as an S3-compatible provider that also needs an endpoint", () => {
    expect(validateEnv({ ...VALID, STORAGE_PROVIDER: "r2" }).errors).toEqual([
      "STORAGE_PROVIDER=r2 requires S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT",
    ]);
    const ok = { ...VALID, STORAGE_PROVIDER: "r2", S3_BUCKET: "b", S3_ACCESS_KEY: "a", S3_SECRET_KEY: "s", S3_ENDPOINT: "https://x.r2.cloudflarestorage.com" };
    expect(validateEnv(ok).errors).toEqual([]);
  });

  it("rejects unknown storage providers instead of silently using local disk", () => {
    expect(validateEnv({ ...VALID, STORAGE_PROVIDER: "gcs" }).errors).toEqual([
      "STORAGE_PROVIDER=gcs is not supported (use local, s3 or r2)",
    ]);
  });

  it("requires S3 credentials only when STORAGE_PROVIDER=s3", () => {
    expect(validateEnv({ ...VALID, STORAGE_PROVIDER: "local" }).errors).toEqual([]);
    expect(validateEnv({ ...VALID, STORAGE_PROVIDER: "s3", S3_BUCKET: "b" }).errors).toEqual([
      "STORAGE_PROVIDER=s3 requires S3_ACCESS_KEY, S3_SECRET_KEY",
    ]);
  });

  it("warns (never errors) about missing optional integrations", () => {
    const { errors, warnings } = validateEnv(VALID);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("GITHUB_WEBHOOK_SECRET"))).toBe(true);
    expect(warnings.some((w) => w.includes("STRIPE_SECRET_KEY"))).toBe(true);
  });

  it("stops warning once an optional group is configured", () => {
    const { warnings } = validateEnv({ ...VALID, GITHUB_WEBHOOK_SECRET: "x" });
    expect(warnings.some((w) => w.includes("GITHUB_WEBHOOK_SECRET"))).toBe(false);
  });

  it("does not nag self-hosters about billing and warns about open signup", () => {
    const { warnings } = validateEnv({ ...VALID, ORBIT_SELF_HOSTED: "true", ORBIT_SIGNUP: "open" });
    expect(warnings.some((w) => w.includes("STRIPE"))).toBe(false);
    expect(warnings.some((w) => w.includes("ORBIT_SIGNUP=open"))).toBe(true);
    const defaults = validateEnv({ ...VALID, ORBIT_SELF_HOSTED: "true" });
    expect(defaults.warnings.some((w) => w.includes("ORBIT_SIGNUP=open"))).toBe(false);
  });
});

describe("assertEnv", () => {
  it("throws one readable error naming every problem", () => {
    const env = { ...VALID, REDIS_URL: undefined, ANTHROPIC_API_KEY: undefined };
    expect(() => assertEnv(env)).toThrow(EnvValidationError);
    try {
      assertEnv(env);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("REDIS_URL is missing");
      expect(message).toContain("No AI chat provider configured");
    }
  });

  it("logs warnings but does not throw when only optional vars are missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertEnv(VALID)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("can be skipped explicitly and during next build", () => {
    expect(() => assertEnv({ SKIP_ENV_VALIDATION: "true" })).not.toThrow();
    expect(() => assertEnv({ NEXT_PHASE: "phase-production-build" })).not.toThrow();
  });
});
