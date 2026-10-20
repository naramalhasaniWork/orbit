import { describe, it, expect } from "vitest";
import { coveredRoutes, routeCoversPattern } from "@/server/engine/replay/covered-nodes";

describe("routeCoversPattern", () => {
  it("matches static and dynamic segments", () => {
    expect(routeCoversPattern("/projects/[projectId]/runs", "/projects/*/runs")).toBe(true);
    expect(routeCoversPattern("/users/:id", "/users/*")).toBe(true);
    expect(routeCoversPattern("/settings", "/settings")).toBe(true);
    expect(routeCoversPattern("/settings", "/settings/billing")).toBe(false);
    expect(routeCoversPattern("/projects/new", "/projects/*")).toBe(false);
  });

  it("handles catch-all routes", () => {
    expect(routeCoversPattern("/docs/[...slug]", "/docs/a/b")).toBe(true);
    expect(routeCoversPattern("/docs/[...slug]", "/docs")).toBe(false);
    expect(routeCoversPattern("/docs/[[...slug]]", "/docs")).toBe(true);
  });
});

describe("coveredRoutes", () => {
  it("collects the same-origin URL patterns a script visits", () => {
    expect(coveredRoutes([
      { stepIndex: 0, action: "click", pre: { urlPattern: "/login" }, post: { urlPattern: "/dashboard" } },
      { stepIndex: 1, action: "click", pre: { urlPattern: "/dashboard" }, post: { urlPattern: "https://sso.example.org/auth" } },
    ])).toEqual(["/dashboard", "/login"]);
  });
});
