import { describe, it, expect } from "vitest";
import { toUrlPattern, urlMatchesPattern, toStoredUrl } from "@/server/engine/replay/url-pattern";

const env = "https://staging.example.com";

describe("url patterns", () => {
  it("keeps same-origin paths, wildcards ids, drops query and hash", () => {
    expect(toUrlPattern(`${env}/projects/3f2b8c1e-1d2a-4b3c-9d4e-5f6a7b8c9d0e/runs/42?tab=x#top`, env))
      .toBe("/projects/*/runs/*");
    expect(toUrlPattern(`${env}/`, env)).toBe("/");
    expect(toUrlPattern(`${env}/settings/`, env)).toBe("/settings");
  });

  it("keeps the origin of cross-origin URLs and passes non-http URLs through", () => {
    expect(toUrlPattern("https://accounts.example.org/login", env)).toBe("https://accounts.example.org/login");
    expect(toUrlPattern("about:blank", env)).toBe("about:blank");
  });

  it("matches concrete URLs against patterns segment by segment", () => {
    expect(urlMatchesPattern(`${env}/projects/abc123def456ghi789/runs/7`, "/projects/*/runs/*", env)).toBe(true);
    expect(urlMatchesPattern(`${env}/projects/new`, "/projects/*", env)).toBe(true);
    expect(urlMatchesPattern(`${env}/projects`, "/projects/*", env)).toBe(false);
    expect(urlMatchesPattern(`${env}/dashboard`, "/login", env)).toBe(false);
  });

  it("stores same-origin navigation targets as paths", () => {
    expect(toStoredUrl(`${env}/login?next=%2F`, env)).toBe("/login?next=%2F");
    expect(toStoredUrl("/pricing", env)).toBe("/pricing");
    expect(toStoredUrl("https://other.example.org/x", env)).toBe("https://other.example.org/x");
  });
});
