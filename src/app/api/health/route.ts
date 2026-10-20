import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const { healthy, checks, workers } = await checkHealth();

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      checks,
      workers,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
    },
    { status: healthy ? 200 : 503 }
  );
}
