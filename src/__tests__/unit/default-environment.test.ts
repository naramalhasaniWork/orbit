import { describe, it, expect } from "vitest";
import { isDefaultCandidate, pickDefaultEnvironment } from "@/services/execution/default-environment";

const at = (day: number) => new Date(Date.UTC(2026, 0, day));
const env = (id: string, type: string, isDefault = false, day = 1) => ({ id, type, isDefault, createdAt: at(day) });

describe("pickDefaultEnvironment", () => {
  it("uses the environment flagged as default", () => {
    expect(pickDefaultEnvironment([env("s", "staging"), env("q", "qa", true)])?.id).toBe("q");
  });

  it("prefers staging over qa over preview when none is flagged", () => {
    const envs = [env("p", "preview", false, 1), env("q", "qa", false, 2), env("s", "staging", false, 3)];
    expect(pickDefaultEnvironment(envs)?.id).toBe("s");
    expect(pickDefaultEnvironment(envs.filter((e) => e.id !== "s"))?.id).toBe("q");
  });

  it("breaks ties by age", () => {
    expect(pickDefaultEnvironment([env("new", "staging", false, 5), env("old", "staging", false, 1)])?.id).toBe("old");
  });

  it("never picks production, even when flagged", () => {
    expect(pickDefaultEnvironment([env("prod", "production", true)])).toBeNull();
    expect(pickDefaultEnvironment([env("prod", "production", true), env("q", "qa")])?.id).toBe("q");
  });
});

describe("isDefaultCandidate", () => {
  it("excludes archived environments and per-PR preview environments", () => {
    expect(isDefaultCandidate({ archivedAt: null, source: null })).toBe(true);
    expect(isDefaultCandidate({ archivedAt: null, source: "railway" })).toBe(true);
    expect(isDefaultCandidate({ archivedAt: new Date(), source: null })).toBe(false);
    expect(isDefaultCandidate({ archivedAt: null, source: "preview" })).toBe(false);
  });
});
