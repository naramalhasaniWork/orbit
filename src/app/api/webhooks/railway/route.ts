import { NextRequest } from "next/server";
import { handlePreviewWebhook } from "@/services/preview/webhook-handler";

/**
 * Legacy path, kept as an alias of /api/webhooks/preview/railway/<connectionId>. The
 * connection id comes from the ?connection= query parameter; without it (or without a
 * valid X-Orbit-Token) the request is rejected.
 */
export async function POST(req: NextRequest) {
  return handlePreviewWebhook(req, "railway", req.nextUrl.searchParams.get("connection"));
}
