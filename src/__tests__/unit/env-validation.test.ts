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
};

describe("validateEnv", () => {
  it("passes with all required variables", () => {
    expect(validateEnv(VALID).errors).toEqual([]);
  });

  it("lists every missing required variable at once", () => {
    const { errors } = validateEnv({});
    expect(errors).toHaveLength(8);
    for (const name of Object.keys(VALID)) {
      expect(errors).toContain(`${name} is missing`);
    }
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
      expect(message).toContain("ANTHROPIC_API_KEY is missing");
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
