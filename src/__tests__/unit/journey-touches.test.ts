import { describe, it, expect } from "vitest";
import { journeyTouches, stepPaths } from "@/lib/onboarding/journey-touches";

describe("stepPaths", () => {
  it("reads navigate targets and paths named in planner prose", () => {
    const steps = [
      { action: "navigate", target: "/register" },
      { action: "Open /login and submit the form", expected: "Redirected to /dashboard." },
      { action: "fill", target: "input[name=email]", value: "a@b.co" },
      { action: "Visit https://staging.acme.dev/projects/42/settings", expected: "Settings load" },
    ];
    expect(stepPaths(steps)).toEqual(["/register", "/login", "/dashboard", "/projects/42/settings"]);
  });

  it("skips API calls and junk", () => {
    expect(stepPaths([{ action: "POST /api/session" }, null, 3, { nested: ["see /about"] }])).toEqual(["/about"]);
  });
});

describe("journeyTouches", () => {
  const routes = ["/", "/login", "/dashboard", "/projects/[projectId]/settings", "route:/billing"];

  it("matches step paths to the map's route nodes, dynamic segments included", () => {
    const steps = [
      { action: "navigate", target: "/login" },
      { action: "Go to /projects/42/settings then /billing", expected: "Back on /login" },
    ];
    expect(journeyTouches(steps, routes)).toEqual(["/login", "/projects/[projectId]/settings", "route:/billing"]);
  });

  it("is empty when the steps name no known route", () => {
    expect(journeyTouches([{ action: "click", target: ".product-card" }], routes)).toEqual([]);
    expect(journeyTouches([{ action: "navigate", target: "/nowhere" }], routes)).toEqual([]);
  });
});
