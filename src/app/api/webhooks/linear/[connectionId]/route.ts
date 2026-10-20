import { NextRequest } from "next/server";
import { handleLinearWebhook } from "@/services/integrations/linear-inbound";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/** POST /api/webhooks/linear/[connectionId]; see services/integrations/linear-inbound. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { connectionId } = await params;
  return handleLinearWebhook(req, connectionId);
}
