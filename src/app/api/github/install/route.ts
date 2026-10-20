import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getInstallUrl, isGitHubAppConfigured } from "@/lib/github/app";
import { createInstallState } from "@/lib/github/install-state";
import { requirePermission } from "@/lib/auth/rbac";
import { apiError, handleApiError, requireWorkspace } from "@/lib/utils/api";
import { safeReturnPath } from "@/lib/utils/safe-redirect";

export const dynamic = "force-dynamic";

/**
 * Redirects the user to the GitHub App installation page with a signed `state`
 * (workspace + user) and stores a return URL cookie for the callback.
 *
 * Usage: GET /api/github/install?return_to=/dashboard/onboarding
 */
export async function GET(request: NextRequest) {
  try {
    if (!isGitHubAppConfigured()) {
      return apiError("GitHub App not configured", "NOT_CONFIGURED", 503);
    }

    const { workspaceId } = await requireWorkspace();
    const { session } = await requirePermission(workspaceId, "integrations.manage");

    const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return_to"));

    const cookieStore = await cookies();
    cookieStore.set("orbit_install_return", returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes — plenty for the GitHub flow
      path: "/",
    });

    return NextResponse.redirect(getInstallUrl(createInstallState(workspaceId, session.user.id)));
  } catch (error) {
    return handleApiError(error);
  }
}
