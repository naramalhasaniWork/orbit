import { NextRequest } from "next/server";
import { z } from "zod";
import { requireWorkspace, apiSuccess, apiError } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { requestOrigin } from "@/lib/setup/access";
import {
  connectProvider, disconnectProvider, getConnectionSummary, rotateWebhookToken, type ConnectionSummary,
} from "@/services/preview/connection-service";
import { parseProviderParam, previewApiError } from "@/services/preview/http";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

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

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.view");
    const provider = parseProviderParam((await params).provider);
    if (!provider) return apiError("Unknown provider", "NOT_FOUND", 404);

    const connection = await getConnectionSummary(workspaceId, provider);
    return apiSuccess({ connection, webhookUrl: webhookUrl(req, connection) });
  } catch (error) {
    return previewApiError(error);
  }
}

/** Connect (or replace the token), or { rotateWebhookToken: true }. The webhook token is shown once. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.manage");
    const provider = parseProviderParam((await params).provider);
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
  } catch (error) {
    return previewApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.manage");
    const provider = parseProviderParam((await params).provider);
    if (!provider) return apiError("Unknown provider", "NOT_FOUND", 404);

    const removed = await disconnectProvider(workspaceId, provider);
    return removed ? apiSuccess({ connected: false }) : apiError("Not connected", "NOT_FOUND", 404);
  } catch (error) {
    return previewApiError(error);
  }
}
