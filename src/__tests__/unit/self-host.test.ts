import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAllowedEmailDomains, getSignupMode, isSelfHosted } from "@/lib/self-host";

beforeEach(() => {
  vi.stubEnv("ORBIT_SELF_HOSTED", "");
  vi.stubEnv("ORBIT_SIGNUP", "");
  vi.stubEnv("ORBIT_ALLOWED_EMAIL_DOMAINS", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("self-host flags", () => {
  it("is off unless ORBIT_SELF_HOSTED is exactly 'true'", () => {
    expect(isSelfHosted()).toBe(false);
    vi.stubEnv("ORBIT_SELF_HOSTED", "1");
    expect(isSelfHosted()).toBe(false);
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    expect(isSelfHosted()).toBe(true);
  });

  it("defaults signup to open on cloud and invite when self-hosted", () => {
    expect(getSignupMode()).toBe("open");
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    expect(getSignupMode()).toBe("invite");
  });

  it("honours an explicit ORBIT_SIGNUP and ignores junk", () => {
    vi.stubEnv("ORBIT_SIGNUP", "Closed");
    expect(getSignupMode()).toBe("closed");
    vi.stubEnv("ORBIT_SIGNUP", "whatever");
    expect(getSignupMode()).toBe("open");
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    expect(getSignupMode()).toBe("invite");
  });

  it("parses the allowed domain list", () => {
    expect(getAllowedEmailDomains()).toEqual([]);
    vi.stubEnv("ORBIT_ALLOWED_EMAIL_DOMAINS", " Acme.com, @corp.io ,, ");
    expect(getAllowedEmailDomains()).toEqual(["acme.com", "corp.io"]);
  });
});

describe("tier limits under self-host", () => {
  afterEach(() => vi.resetModules());

  it("keeps the plan limits on cloud", async () => {
    vi.resetModules();
    const { TIER_LIMITS, isModelAllowed } = await import("@/lib/auth/tenant");
    expect(TIER_LIMITS.free.projects).toBe(1);
    expect(isModelAllowed("free", "claude-opus-4-6")).toBe(false);
  });

  it("removes every limit when self-hosted", async () => {
    vi.stubEnv("ORBIT_SELF_HOSTED", "true");
    vi.resetModules();
    const { canConsume, isModelAllowed } = await import("@/lib/auth/tenant");
    for (const tier of ["free", "starter", "professional", "enterprise"] as const) {
      expect(isModelAllowed(tier, "claude-opus-4-6")).toBe(true);
    }
    for (const kind of ["run", "credits", "project", "member"] as const) {
      await expect(canConsume("workspace-without-db-row", kind)).resolves.toEqual({ allowed: true });
    }
  });
});
