import { NextResponse } from "next/server";

/**
 * Retired shared Linear webhook URL. It routed events by the team id in the payload, which
 * any workspace could claim. Every request is refused; Settings → Integrations → Linear
 * gives each connection its own URL (/api/webhooks/linear/:connectionId?token=…).
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This Linear webhook URL is retired. Copy the per-connection URL from Orbit Settings → Integrations → Linear into the Linear webhook.",
    },
    { status: 410 }
  );
}
