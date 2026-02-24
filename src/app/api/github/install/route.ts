import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getInstallUrl, isGitHubAppConfigured } from "@/lib/github/app";
import { apiError } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/**
 * Redirects the user to the GitHub App installation page.
 * Stores a return URL cookie so the callback knows where to send them back.
 *
 * Usage: GET /api/github/install?return_to=/dashboard/onboarding
 */
export async function GET(request: NextRequest) {
  if (!isGitHubAppConfigured()) {
    return apiError("GitHub App not configured", "NOT_CONFIGURED", 503);
  }

  const returnTo = request.nextUrl.searchParams.get("return_to") ?? "/dashboard/onboarding";

  const cookieStore = await cookies();
  cookieStore.set("orbit_install_return", returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — plenty for the GitHub flow
    path: "/",
  });

  return NextResponse.redirect(getInstallUrl());
}
