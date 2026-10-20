import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { requestOrigin } from "@/lib/setup/access";
import {
  connectProvider, disconnectProvider, getConnectionSummary, rotateWebhookToken, type ConnectionSummary,
} from "@/services/preview/connection-service";
import { parseProviderParam, mapPreviewError } from "@/services/preview/http";
import { route } from "@/server/http/route";

const ConnectSchema = z.union([
  z.object({
    token: z.string().trim().min(10, "Paste the full API token").max(500),
    accountId: z.string().trim().regex(/^[a-f0-9]{32}$/i, "Account ID is 32 hex characters").optional(),
  }),
  z.object({ rotateWebhookToken: z.literal(true) }),
]);

function webhookUrl(req: NextRequest, connection: ConnectionSummary | null): string | null {
  if (!connection?.webhookPath) return null;
  return `${process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? requestOrigin(req.headers)}${connection.webhookPath}`;
}

export const GET = route(
  { permission: "integrations.view", onError: mapPreviewError },
  async ({ req, params, workspaceId }) => {
    const provider = parseProviderParam(params.provider);
    if (!provider) return apiError("Unknown provider", "NOT_FOUND", 404);

    const connection = await getConnectionSummary(workspaceId, provider);
    return apiSuccess({ connection, webhookUrl: webhookUrl(req, connection) });
  }
);

/** Connect (or replace the token), or { rotateWebhookToken: true }. The webhook token is shown once. */
export const POST = route(
  { permission: "integrations.manage", onError: mapPreviewError },
  async ({ req, params, workspaceId }) => {
    const provider = parseProviderParam(params.provider);
    if (!provider) return apiError("Unknown provider", "NOT_FOUND", 404);

    const body = ConnectSchema.parse(await req.json());
    if ("rotateWebhookToken" in body) {
      const webhookToken = await rotateWebhookToken(workspaceId, provider);
      if (!webhookToken) return apiError("This provider has no webhook to rotate", "NOT_FOUND", 404);
      const connection = await getConnectionSummary(workspaceId, provider);
      return apiSuccess({ connection, webhookUrl: webhookUrl(req, connection), webhookToken });
    }

    if (provider === "cloudflare_pages" && !body.accountId) {
      return apiError("Account ID is required for Cloudflare", "VALIDATION_ERROR", 400);
    }
    const { connection, webhookToken } = await connectProvider(workspaceId, provider, body);
    return apiSuccess({ connection, webhookUrl: webhookUrl(req, connection), webhookToken });
  }
);

export const DELETE = route(
  { permission: "integrations.manage", onError: mapPreviewError },
  async ({ params, workspaceId }) => {
    const provider = parseProviderParam(params.provider);
    if (!provider) return apiError("Unknown provider", "NOT_FOUND", 404);

    const removed = await disconnectProvider(workspaceId, provider);
    return removed ? apiSuccess({ connected: false }) : apiError("Not connected", "NOT_FOUND", 404);
  }
);
