import { describe, it, expect, vi, beforeEach } from "vitest";
// Fixtures follow the payload/response shapes in Railway's and Cloudflare's docs; they are
// not captured from live accounts (spec step R0 is still open).
import railwayPr from "../fixtures/preview/railway-pr-deployment-success.json";
import railwayProd from "../fixtures/preview/railway-production-deployment-success.json";
import railwayLegacy from "../fixtures/preview/railway-legacy-shape.json";
import cfDeployments from "../fixtures/preview/cloudflare-pages-deployments-preview.json";

const api = vi.hoisted(() => ({
  listEphemeralEnvironments: vi.fn(),
  listDeployments: vi.fn(),
  environmentDomain: vi.fn(),
  listProjectsWithServices: vi.fn(),
}));
vi.mock("@/services/preview/providers/railway-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/preview/providers/railway-api")>()),
  ...api,
}));

import { parseRailwayEvent, railwayProvider, parseRailwayTarget } from "@/services/preview/providers/railway";
import { resolveFromDeployments, type CfDeployment } from "@/services/preview/providers/cloudflare-pages";

const SHA = "4f2a9c1e0b7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f";
const access = { token: "t", config: {} };

describe("Railway webhook parsing", () => {
  it("reads the documented Deployment.* shape, with the commit lowercased", () => {
    expect(parseRailwayEvent(railwayPr)).toEqual({
      event: "Deployment.succeeded",
      externalId: "d7b1c2e0-0000-4000-8000-000000000001",
      commitSha: SHA,
      branch: "feature/checkout",
      isPreview: true,
      removed: false,
      succeeded: true,
      refs: { projectId: "rw-project-1", environmentId: "rw-env-pr-42", serviceId: "rw-service-web" },
    });
  });

  it("marks long-lived environments as not previews", () => {
    expect(parseRailwayEvent(railwayProd)).toMatchObject({ isPreview: false, succeeded: true });
  });

  it("ignores the old payload shape the previous handler expected, URL and all", () => {
    expect(parseRailwayEvent(railwayLegacy)).toBeNull();
    expect(parseRailwayEvent("nope")).toBeNull();
  });

  it("matches bindings by Railway project and service", () => {
    const hint = parseRailwayEvent(railwayPr)!;
    expect(railwayProvider.matchesTarget!("rw-project-1/rw-service-web", hint)).toBe(true);
    expect(railwayProvider.matchesTarget!("rw-project-1/rw-service-api", hint)).toBe(false);
    expect(railwayProvider.matchesTarget!("rw-project-2/rw-service-web", hint)).toBe(false);
    expect(parseRailwayTarget("a/b/c")).toBeNull();
  });
});

describe("Railway resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is ready when the PR environment's deployment for the commit succeeded, with its domain", async () => {
    api.listEphemeralEnvironments.mockResolvedValue(["env-a", "env-b"]);
    api.listDeployments.mockImplementation(async (_t: string, _s: string, env: string) =>
      env === "env-b" ? [{ id: "dep-1", status: "SUCCESS", createdAt: "", commitHash: SHA.toUpperCase() }] : []
    );
    api.environmentDomain.mockResolvedValue("https://web-pr-42.up.railway.app");

    const result = await railwayProvider.resolve({ access, targetRef: "p1/s1", commitSha: SHA });
    expect(result).toEqual({ state: "ready", url: "https://web-pr-42.up.railway.app", externalId: "dep-1" });
    expect(api.environmentDomain).toHaveBeenCalledWith("t", "p1", "env-b", "s1");
  });

  it("only looks at the hinted environment when a webhook names one", async () => {
    api.listDeployments.mockResolvedValue([{ id: "dep-1", status: "BUILDING", createdAt: "", commitHash: SHA }]);
    const hint = parseRailwayEvent(railwayPr)!;
    const result = await railwayProvider.resolve({ access, targetRef: "rw-project-1/rw-service-web", commitSha: SHA, hint });
    expect(result).toEqual({ state: "pending" });
    expect(api.listEphemeralEnvironments).not.toHaveBeenCalled();
  });

  it("fails with an explanation when the PR environment has no domain", async () => {
    api.listEphemeralEnvironments.mockResolvedValue(["env-a"]);
    api.listDeployments.mockResolvedValue([{ id: "dep-1", status: "SUCCESS", createdAt: "", commitHash: SHA }]);
    api.environmentDomain.mockResolvedValue(null);
    const result = await railwayProvider.resolve({ access, targetRef: "p1/s1", commitSha: SHA });
    expect(result).toMatchObject({ state: "failed", externalId: "dep-1" });
  });

  it("stays pending when no deployment for the commit exists yet", async () => {
    api.listEphemeralEnvironments.mockResolvedValue(["env-a"]);
    api.listDeployments.mockResolvedValue([]);
    expect(await railwayProvider.resolve({ access, targetRef: "p1/s1", commitSha: SHA })).toEqual({ state: "pending" });
  });
});

describe("Cloudflare Pages resolve", () => {
  const deployments = cfDeployments as CfDeployment[];

  it("is ready on a successful deploy stage and uses the immutable hash URL, not the branch alias", () => {
    expect(resolveFromDeployments(deployments, SHA.toUpperCase())).toEqual({
      state: "ready",
      url: "https://4f2a9c1e.acme-web.pages.dev",
      externalId: "cf-dep-2",
    });
  });

  it("is pending while building and failed when a stage failed", () => {
    expect(resolveFromDeployments(deployments, "1".repeat(40))).toEqual({ state: "pending" });
    expect(resolveFromDeployments(deployments, "2".repeat(40))).toMatchObject({ state: "failed", externalId: "cf-dep-1" });
  });

  it("is pending when no preview deployment has the commit", () => {
    expect(resolveFromDeployments(deployments, "9".repeat(40))).toEqual({ state: "pending" });
  });
});
