import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health/checks";
import { appVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const { healthy, checks, workers } = await checkHealth();

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      checks,
      workers,
      timestamp: new Date().toISOString(),
      version: appVersion(),
    },
    { status: healthy ? 200 : 503 }
  );
}
