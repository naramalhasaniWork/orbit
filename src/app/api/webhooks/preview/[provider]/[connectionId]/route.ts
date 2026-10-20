import { NextRequest } from "next/server";
import { handlePreviewWebhook } from "@/services/preview/webhook-handler";

interface RouteParams {
  params: Promise<{ provider: string; connectionId: string }>;
}

/** POST /api/webhooks/preview/[provider]/[connectionId]; see services/preview/webhook-handler. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { provider, connectionId } = await params;
  return handlePreviewWebhook(req, provider, connectionId);
}
