import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/services/orchestrator/run-launcher", () => ({
  launchPipelineRun: vi.fn(),
  launchSummary: vi.fn(),
}));
vi.mock("@/services/integrations/railway/environment-sync", () => ({
  updateEnvironmentUrl: vi.fn(),
}));
vi.mock("@/services/integrations/slack-commands", () => ({
  findWorkspaceBySlackTeam: vi.fn(),
  handleStatus: vi.fn(),
  handleRun: vi.fn(),
  handleResults: vi.fn(),
  handleHealth: vi.fn(),
}));

interface WebhookCase {
  name: string;
  envVar: string;
  route: () => Promise<{ POST: (req: NextRequest) => Promise<Response> }>;
  signatureHeaders: Record<string, string>;
}

const nowSeconds = String(Math.floor(Date.now() / 1000));

const CASES: WebhookCase[] = [
  {
    name: "linear",
    envVar: "LINEAR_WEBHOOK_SECRET",
    route: () => import("@/app/api/webhooks/linear/route"),
    signatureHeaders: { "linear-signature": "bad" },
  },
  {
    name: "railway",
    envVar: "RAILWAY_WEBHOOK_SECRET",
    route: () => import("@/app/api/webhooks/railway/route"),
    signatureHeaders: { "x-railway-signature": "bad" },
  },
  {
    name: "slack commands",
    envVar: "SLACK_SIGNING_SECRET",
    route: () => import("@/app/api/webhooks/slack/commands/route"),
    signatureHeaders: { "x-slack-request-timestamp": nowSeconds, "x-slack-signature": "v0=bad" },
  },
  {
    name: "slack interactions",
    envVar: "SLACK_SIGNING_SECRET",
    route: () => import("@/app/api/webhooks/slack/interactions/route"),
    signatureHeaders: { "x-slack-request-timestamp": nowSeconds, "x-slack-signature": "v0=bad" },
  },
];

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/x", {
    method: "POST",
    body: JSON.stringify({ type: "Issue", action: "update", data: { id: "i1" } }),
    headers,
  });
}

describe.each(CASES)("$name webhook signature", ({ envVar, route, signatureHeaders }) => {
  beforeEach(() => {
    delete process.env[envVar];
  });

  it("fails closed with 503 when the secret is not configured", async () => {
    const { POST } = await route();
    const response = await POST(request({}));
    expect(response.status).toBe(503);
  });

  it("rejects a bad signature with 401", async () => {
    process.env[envVar] = "configured-secret";
    const { POST } = await route();
    const response = await POST(request(signatureHeaders));
    expect(response.status).toBe(401);
  });
});
