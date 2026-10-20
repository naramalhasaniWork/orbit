import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import railwayPr from "../fixtures/preview/railway-pr-deployment-success.json";
import railwayProd from "../fixtures/preview/railway-production-deployment-success.json";
import railwayLegacy from "../fixtures/preview/railway-legacy-shape.json";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { previewConnection: { findFirst } } }));
const handleProviderSignal = vi.hoisted(() => vi.fn());
vi.mock("@/services/preview/coordinator", () => ({ handleProviderSignal }));
const launchDeploySmokeRuns = vi.hoisted(() => vi.fn());
vi.mock("@/services/preview/deploy-smoke", () => ({ launchDeploySmokeRuns }));
vi.mock("@/lib/vault", () => ({ encrypt: vi.fn(), decrypt: (v: string) => v }));
const railwayApi = vi.hoisted(() => ({ getDeployment: vi.fn(), listEphemeralEnvironments: vi.fn() }));
vi.mock("@/services/preview/providers/railway-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/preview/providers/railway-api")>()),
  ...railwayApi,
}));

import { POST } from "@/app/api/webhooks/preview/[provider]/[connectionId]/route";
import { POST as legacyPOST } from "@/app/api/webhooks/railway/route";
import { generateWebhookToken } from "@/services/preview/connections";

const CONNECTION_ID = "8b0c7e2a-1111-4222-8333-444455556666";
const { token, hash } = generateWebhookToken();
const connection = {
  id: CONNECTION_ID,
  webhookTokenHash: hash,
  credentials: { encryptedToken: "railway-token", iv: "iv" },
  config: {},
  bindings: [{ projectId: "p1", targetRef: "rw-project-1/rw-service-web" }],
};

function call(body: unknown, headers: Record<string, string> = {}, provider = "railway", id = CONNECTION_ID) {
  const req = new NextRequest(`http://localhost/api/webhooks/preview/${provider}/${id}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
  return POST(req, { params: Promise.resolve({ provider, connectionId: id }) });
}

describe("POST /api/webhooks/preview/[provider]/[connectionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(connection);
    handleProviderSignal.mockResolvedValue({ advanced: 1 });
    launchDeploySmokeRuns.mockResolvedValue([]);
  });

  it("rejects a missing or wrong X-Orbit-Token with 401", async () => {
    expect((await call(railwayPr)).status).toBe(401);
    expect((await call(railwayPr, { "x-orbit-token": `${token}x` })).status).toBe(401);
    expect(handleProviderSignal).not.toHaveBeenCalled();
  });

  it("fails closed when the connection has no webhook token or does not exist", async () => {
    findFirst.mockResolvedValueOnce({ ...connection, webhookTokenHash: null });
    expect((await call(railwayPr, { "x-orbit-token": token })).status).toBe(401);
    findFirst.mockResolvedValueOnce(null);
    expect((await call(railwayPr, { "x-orbit-token": token })).status).toBe(401);
    expect((await call(railwayPr, { "x-orbit-token": token }, "railway", "not-a-uuid")).status).toBe(401);
  });

  it("404s providers without webhooks", async () => {
    expect((await call(railwayPr, { "x-orbit-token": token }, "cloudflare_pages")).status).toBe(404);
  });

  it("hands a PR deployment event to the coordinator as a hint", async () => {
    const response = await call(railwayPr, { "x-orbit-token": token });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "preview_processed", advanced: 1 });
    expect(handleProviderSignal).toHaveBeenCalledWith(
      CONNECTION_ID,
      expect.objectContaining({ isPreview: true, commitSha: "4f2a9c1e0b7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f" })
    );
  });

  it("starts a smoke run only for a deployment the Railway API confirms, with the API's commit", async () => {
    findFirst.mockResolvedValueOnce({
      ...connection,
      bindings: [...connection.bindings, { projectId: "p2", targetRef: "other-project/svc" }],
    });
    railwayApi.listEphemeralEnvironments.mockResolvedValue(["rw-env-pr-42"]);
    railwayApi.getDeployment.mockResolvedValue({
      id: "d7b1c2e0-0000-4000-8000-000000000002", status: "SUCCESS", projectId: "rw-project-1",
      serviceId: "rw-service-web", environmentId: "rw-env-production", branch: "main", commitHash: "api-sha",
    });

    await call(railwayProd, { "x-orbit-token": token });

    expect(railwayApi.getDeployment).toHaveBeenCalledWith("railway-token", "d7b1c2e0-0000-4000-8000-000000000002");
    expect(launchDeploySmokeRuns).toHaveBeenCalledWith("railway", [
      { projectId: "p1", deploymentId: "d7b1c2e0-0000-4000-8000-000000000002", branch: "main", commitSha: "api-sha" },
    ]);
    expect(handleProviderSignal).not.toHaveBeenCalled();
  });

  it("starts no run for a forged deploy event the API does not back up", async () => {
    railwayApi.listEphemeralEnvironments.mockResolvedValue(["rw-env-pr-42"]);
    const real = {
      id: "d7b1c2e0-0000-4000-8000-000000000002", status: "SUCCESS", projectId: "rw-project-1",
      serviceId: "rw-service-web", environmentId: "rw-env-production", branch: "main", commitHash: "x",
    };
    // Claimed long-lived, but really a PR environment; still building; unknown deployment id.
    for (const api of [{ ...real, environmentId: "rw-env-pr-42" }, { ...real, status: "BUILDING" }, null]) {
      railwayApi.getDeployment.mockResolvedValueOnce(api);
      await call(railwayProd, { "x-orbit-token": token });
    }
    expect(launchDeploySmokeRuns.mock.calls.every(([, deploys]) => deploys.length === 0)).toBe(true);
  });

  it("ignores payloads in the old, undocumented shape", async () => {
    const response = await call(railwayLegacy, { "x-orbit-token": token });
    expect(await response.json()).toEqual({ status: "ignored" });
  });

  it("keeps /api/webhooks/railway as an alias that needs ?connection= and the token", async () => {
    const legacy = (query: string, headers: Record<string, string>) =>
      legacyPOST(new NextRequest(`http://localhost/api/webhooks/railway${query}`, {
        method: "POST", body: JSON.stringify(railwayPr), headers,
      }));
    expect((await legacy("", { "x-orbit-token": token })).status).toBe(401);
    expect((await legacy(`?connection=${CONNECTION_ID}`, { "x-orbit-token": token })).status).toBe(200);
  });
});
