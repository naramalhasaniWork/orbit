import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  previewConnection: { findUnique: vi.fn(), upsert: vi.fn() },
  previewBinding: { upsert: vi.fn() },
  secret: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
}));
const verify = vi.hoisted(() => vi.fn());
const listTargets = vi.hoisted(() => vi.fn());

vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/vault", () => ({ encrypt: (v: string) => ({ encrypted: `enc(${v})`, iv: "iv" }), decrypt: (v: string) => v }));
vi.mock("@/services/preview/registry", () => ({
  isPreviewProviderId: (v: string) => v === "railway" || v === "cloudflare_pages",
  getPreviewProvider: (id: string) => ({
    id, verify, listTargets, ...(id === "railway" ? { parseEvent: () => null } : {}),
  }),
}));

import { POST as connect } from "@/app/api/integrations/[provider]/route";
import { PUT as bind } from "@/app/api/projects/[projectId]/preview-binding/route";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";
import { hashWebhookToken } from "@/services/preview/connections";

const json = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { host: "orbit.example.com", "x-forwarded-proto": "https" } });
const provider = (p: string) => ({ params: Promise.resolve({ provider: p }) });
const project = { params: Promise.resolve({ projectId: "p1" }) };
const savedRow = (extra: Record<string, unknown> = {}) => ({
  id: "c1", provider: "railway", label: "default", status: "active", lastError: null, config: {},
  webhookTokenHash: null, _count: { bindings: 0 }, ...extra,
});

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.NEXTAUTH_URL;
  resetRouteAuth();
  db.project.findFirst.mockResolvedValue({ id: "p1" });
  verify.mockResolvedValue(undefined);
});

describe("POST /api/integrations/[provider]", () => {
  it("verifies the token, stores it encrypted and returns the webhook URL and a one-time token", async () => {
    db.previewConnection.findUnique.mockResolvedValue(null);
    db.previewConnection.upsert.mockImplementation(async ({ create }: { create: { webhookTokenHash: string } }) =>
      savedRow({ webhookTokenHash: create.webhookTokenHash })
    );

    const res = await connect(json("https://orbit.example.com/api/integrations/railway", "POST", { token: "railway-token-123" }), provider("railway"));
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(verify).toHaveBeenCalledWith({ token: "railway-token-123", config: {} });
    const stored = db.previewConnection.upsert.mock.calls[0][0].create;
    expect(stored.credentials).toEqual({ encryptedToken: "enc(railway-token-123)", iv: "iv" });
    expect(data.webhookUrl).toBe("https://orbit.example.com/api/webhooks/preview/railway/c1");
    expect(hashWebhookToken(data.webhookToken)).toBe(stored.webhookTokenHash);
  });

  it("requires integrations.manage", async () => {
    routeAuth.role = "viewer";
    const res = await connect(json("https://x/api/integrations/railway", "POST", { token: "railway-token-123" }), provider("railway"));
    expect(res.status).toBe(403);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects unknown providers and a Cloudflare connect without an account ID", async () => {
    expect((await connect(json("https://x/a", "POST", { token: "t".repeat(20) }), provider("vercel"))).status).toBe(404);
    expect((await connect(json("https://x/a", "POST", { token: "t".repeat(20) }), provider("cloudflare_pages"))).status).toBe(400);
  });

  it("returns the provider's message when verification fails", async () => {
    const { PreviewProviderError } = await import("@/services/preview/types");
    verify.mockRejectedValue(new PreviewProviderError("Railway rejected the token."));
    const res = await connect(json("https://x/a", "POST", { token: "railway-token-123" }), provider("railway"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Railway rejected the token.");
  });
});

describe("PUT /api/projects/[projectId]/preview-binding", () => {
  beforeEach(() => {
    db.previewConnection.findUnique.mockResolvedValue({ id: "c1", credentials: { encryptedToken: "tok", iv: "iv" }, config: {} });
    listTargets.mockResolvedValue([{ ref: "rp/rs", label: "acme / web" }]);
    db.previewBinding.upsert.mockImplementation(async ({ create }: { create: unknown }) => create);
  });

  it("binds to a target the connection can see, with default allowed hosts", async () => {
    const res = await bind(json("https://x/b", "PUT", { provider: "railway", targetRef: "rp/rs" }), project);
    expect(res.status).toBe(200);
    expect(db.previewBinding.upsert.mock.calls[0][0].create).toMatchObject({
      projectId: "p1", connectionId: "c1", targetRef: "rp/rs", targetLabel: "acme / web", allowedHostSuffixes: ["up.railway.app"],
    });
  });

  it("refuses targets the token cannot see and over-broad host suffixes", async () => {
    expect((await bind(json("https://x/b", "PUT", { provider: "railway", targetRef: "someone-else/svc" }), project)).status).toBe(400);
    expect((await bind(json("https://x/b", "PUT", { provider: "railway", targetRef: "rp/rs", allowedHostSuffixes: ["app"] }), project)).status).toBe(400);
    expect(db.previewBinding.upsert).not.toHaveBeenCalled();
  });

  it("stores an Access service token as project secrets and marks the binding", async () => {
    db.secret.findFirst.mockResolvedValue(null);
    await bind(json("https://x/b", "PUT", {
      provider: "railway", targetRef: "rp/rs", access: { clientId: "abc.access", clientSecret: "shh" },
    }), project);
    expect(db.secret.create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "p1", key: "CF_ACCESS_CLIENT_ID", encryptedValue: "enc(abc.access)" }) });
    expect(db.secret.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: "CF_ACCESS_CLIENT_SECRET", encryptedValue: "enc(shh)" }) });
    expect(db.previewBinding.upsert.mock.calls[0][0].create.accessSecretPrefix).toBe("CF_ACCESS");
  });

  it("404s a project outside the workspace", async () => {
    db.project.findFirst.mockResolvedValue(null);
    expect((await bind(json("https://x/b", "PUT", { provider: "railway", targetRef: "rp/rs" }), project)).status).toBe(404);
  });
});
