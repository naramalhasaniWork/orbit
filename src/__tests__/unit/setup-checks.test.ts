import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "crypto";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ getRedis: vi.fn() }));

import { envChecks, runSetupChecks, type InfraProbes } from "@/lib/setup/checks";
import { getSetupAccess, requestOrigin } from "@/lib/setup/access";

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

const goodEnv = {
  ENCRYPTION_KEY: "e".repeat(64),
  NEXTAUTH_SECRET: "s".repeat(44),
  NEXTAUTH_URL: "https://orbit.example.com",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
  GITHUB_APP_ID: "123",
  GITHUB_APP_SLUG: "orbit",
  GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
  GITHUB_WEBHOOK_SECRET: "hook",
  ANTHROPIC_API_KEY: "sk-ant",
  PLAYWRIGHT_WS_ENDPOINT: "ws://browserless.internal:3000?token=t",
};

const probes = (overrides: Partial<Record<keyof InfraProbes, boolean>> = {}): InfraProbes => ({
  database: async () => overrides.database ?? true,
  migrations: async () => overrides.migrations ?? true,
  redis: async () => overrides.redis ?? true,
  browser: async () => overrides.browser ?? true,
});

const byId = (checks: Array<{ id: string; ok: boolean; fix: string | null }>) =>
  Object.fromEntries(checks.map((c) => [c.id, c]));

describe("envChecks", () => {
  it("passes a complete environment served from the configured origin", () => {
    const checks = envChecks(goodEnv, "https://orbit.example.com");
    expect(checks.every((c) => c.ok && c.fix === null)).toBe(true);
  });

  it("flags each missing or invalid variable with a fix naming it", () => {
    const checks = byId(
      envChecks(
        { ...goodEnv, ENCRYPTION_KEY: "short", GITHUB_APP_PRIVATE_KEY: "not a key", ANTHROPIC_API_KEY: "", GITHUB_APP_ID: "" },
        "https://orbit.example.com"
      )
    );
    expect(checks["encryption-key"].ok).toBe(false);
    expect(checks["github-private-key"].ok).toBe(false);
    expect(checks["ai-key"].fix).toContain("ANTHROPIC_API_KEY");
    expect(checks["github-app-id"].fix).toContain("GITHUB_APP_ID");
    expect(checks["nextauth-secret"].ok).toBe(true);
  });

  it("flags a NEXTAUTH_URL that differs from the address in use", () => {
    const checks = byId(envChecks(goodEnv, "https://other.up.railway.app"));
    expect(checks["nextauth-url"].ok).toBe(false);
    expect(checks["nextauth-url"].fix).toContain("https://other.up.railway.app");
    expect(byId(envChecks({ ...goodEnv, NEXTAUTH_URL: undefined }, "https://x.test"))["nextauth-url"].ok).toBe(false);
  });
});

describe("runSetupChecks", () => {
  it("passes when every probe and variable is good", async () => {
    const checks = await runSetupChecks({ env: goodEnv, origin: "https://orbit.example.com", probes: probes() });
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("reports infrastructure failures with Railway fixes", async () => {
    const checks = byId(
      await runSetupChecks({
        env: goodEnv,
        origin: "https://orbit.example.com",
        probes: probes({ redis: false, browser: false }),
      })
    );
    expect(checks.redis.fix).toContain("REDIS_URL");
    expect(checks.browser.fix).toContain("browserless");
    expect(checks.database.ok).toBe(true);
  });

  it("does not probe migrations when the database is down, and explains why", async () => {
    const migrations = vi.fn(async () => true);
    const checks = byId(
      await runSetupChecks({
        env: goodEnv,
        origin: "https://orbit.example.com",
        probes: { ...probes({ database: false }), migrations },
      })
    );
    expect(migrations).not.toHaveBeenCalled();
    expect(checks.migrations.ok).toBe(false);
    expect(checks.migrations.fix).toContain("database");
  });

  it("fails the browser check without probing when no endpoint is configured", async () => {
    const browser = vi.fn(async () => true);
    const { PLAYWRIGHT_WS_ENDPOINT: _omit, ...env } = goodEnv;
    const checks = byId(
      await runSetupChecks({ env, origin: "https://orbit.example.com", probes: { ...probes(), browser } })
    );
    expect(browser).not.toHaveBeenCalled();
    expect(checks.browser.fix).toContain("PLAYWRIGHT_WS_ENDPOINT");
  });
});

describe("getSetupAccess", () => {
  it("shows setup only on a self-hosted instance with no users and no session", () => {
    expect(getSetupAccess({ selfHosted: true, userCount: 0, signedIn: false })).toBe("show");
  });

  it("sends everyone else to login or the dashboard", () => {
    expect(getSetupAccess({ selfHosted: false, userCount: 0, signedIn: false })).toBe("login");
    expect(getSetupAccess({ selfHosted: true, userCount: 1, signedIn: false })).toBe("login");
    expect(getSetupAccess({ selfHosted: true, userCount: 1, signedIn: true })).toBe("dashboard");
    expect(getSetupAccess({ selfHosted: false, userCount: 5, signedIn: true })).toBe("dashboard");
    expect(getSetupAccess({ selfHosted: true, userCount: 0, signedIn: true })).toBe("dashboard");
  });
});

describe("requestOrigin", () => {
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

  it("prefers proxy headers", () => {
    expect(requestOrigin(headers({ "x-forwarded-host": "orbit.up.railway.app", "x-forwarded-proto": "https", host: "10.0.0.1:8080" }))).toBe(
      "https://orbit.up.railway.app"
    );
  });

  it("falls back to http for localhost and https otherwise", () => {
    expect(requestOrigin(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(requestOrigin(headers({ host: "orbit.example.com" }))).toBe("https://orbit.example.com");
  });
});
