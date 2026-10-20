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
  getDeployment: vi.fn(),
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
      refs: { projectId: "rw-project-1", environmentId: "rw-env-pr-42", serviceId: "rw-service-web" },
    });
  });

  it("marks long-lived environments as not previews", () => {
    expect(parseRailwayEvent(railwayProd)).toMatchObject({ isPreview: false });
  });

  it("ignores the old payload shape the previous handler expected, URL and all", () => {
    expect(parseRailwayEvent(railwayLegacy)).toBeNull();
    expect(parseRailwayEvent("nope")).toBeNull();
  });

  it("rejects malformed targets", () => {
    expect(parseRailwayTarget("a/b/c")).toBeNull();
    expect(parseRailwayTarget("a")).toBeNull();
  });
});

describe("Railway verifyDeploy (non-PR deploy webhooks)", () => {
  const hint = parseRailwayEvent(railwayProd)!;
  const deployment = {
    id: hint.externalId, status: "SUCCESS", projectId: "rw-project-1", serviceId: "rw-service-web",
    environmentId: "rw-env-production", branch: "main-from-api", commitHash: "c0ffee",
  };
  beforeEach(() => {
    vi.clearAllMocks();
    api.listEphemeralEnvironments.mockResolvedValue(["rw-env-pr-42"]);
  });

  it("returns the API's branch and commit for a successful long-lived deployment of the target", async () => {
    api.getDeployment.mockResolvedValue(deployment);
    expect(await railwayProvider.verifyDeploy!(access, "rw-project-1/rw-service-web", hint)).toEqual({
      deploymentId: hint.externalId, branch: "main-from-api", commitSha: "c0ffee",
    });
  });

  it("rejects deployments of another service, not successful, in a PR environment, or unknown", async () => {
    api.getDeployment.mockResolvedValueOnce({ ...deployment, serviceId: "rw-service-api" });
    expect(await railwayProvider.verifyDeploy!(access, "rw-project-1/rw-service-web", hint)).toBeNull();
    api.getDeployment.mockResolvedValueOnce({ ...deployment, status: "BUILDING" });
    expect(await railwayProvider.verifyDeploy!(access, "rw-project-1/rw-service-web", hint)).toBeNull();
    api.getDeployment.mockResolvedValueOnce({ ...deployment, environmentId: "rw-env-pr-42" });
    expect(await railwayProvider.verifyDeploy!(access, "rw-project-1/rw-service-web", hint)).toBeNull();
    api.getDeployment.mockResolvedValueOnce(null);
    expect(await railwayProvider.verifyDeploy!(access, "rw-project-1/rw-service-web", hint)).toBeNull();
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

  it("narrows to the hinted environment only when the API lists it as a PR environment", async () => {
    api.listEphemeralEnvironments.mockResolvedValue(["rw-env-pr-42", "env-other"]);
    api.listDeployments.mockResolvedValue([{ id: "dep-1", status: "BUILDING", createdAt: "", commitHash: SHA }]);
    const hint = parseRailwayEvent(railwayPr)!;
    expect(await railwayProvider.resolve({ access, targetRef: "rw-project-1/rw-service-web", commitSha: SHA, hint })).toEqual({ state: "pending" });
    expect(api.listDeployments).toHaveBeenCalledTimes(1);

    // A forged environment id is ignored: every API-listed PR environment is scanned instead.
    api.listDeployments.mockClear().mockResolvedValue([]);
    const forged = { ...hint, refs: { ...hint.refs, environmentId: "attacker-env" } };
    await railwayProvider.resolve({ access, targetRef: "rw-project-1/rw-service-web", commitSha: SHA, hint: forged });
    expect(api.listDeployments.mock.calls.map((c) => c[2])).toEqual(["rw-env-pr-42", "env-other"]);
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
