import { describe, it, expect } from "vitest";
import { safeReturnPath } from "@/lib/utils/safe-redirect";

describe("safeReturnPath", () => {
  it.each(["/dashboard", "/dashboard/settings", "/a?b=1", "/"])("keeps relative path %s", (p) => {
    expect(safeReturnPath(p)).toBe(p);
  });

  it.each([
    "https://evil.com",
    "http://evil.com/x",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
  ])("falls back for %j", (p) => {
    expect(safeReturnPath(p)).toBe("/dashboard/onboarding");
  });

  it("falls back for null/undefined and honours a custom fallback", () => {
    expect(safeReturnPath(null)).toBe("/dashboard/onboarding");
    expect(safeReturnPath(undefined, "/x")).toBe("/x");
  });
});
