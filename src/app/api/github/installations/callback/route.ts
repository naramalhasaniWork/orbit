import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { safeReturnPath } from "@/lib/utils/safe-redirect";
import { isGitHubAppConfigured } from "@/lib/github/app";
import { verifyInstallState } from "@/lib/github/install-state";
import { linkInstallation, listInstallationsForUser } from "@/services/github-installation-sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const returnTo = safeReturnPath(cookieStore.get("orbit_install_return")?.value);

  try {
    const { session, workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.manage");

    if (!isGitHubAppConfigured()) {
      redirect(`${returnTo}?error=github_app_not_configured`);
    }

    // The signed state proves this flow was started by this user for this workspace
    const state = verifyInstallState(request.nextUrl.searchParams.get("state"));
    if (!state || state.workspaceId !== workspaceId || state.userId !== session.user.id) {
      redirect(`${returnTo}?error=invalid_state`);
    }

    const installationId = request.nextUrl.searchParams.get("installation_id");
    const setupAction = request.nextUrl.searchParams.get("setup_action");

    if (!installationId || (setupAction !== "install" && setupAction !== "update")) {
      redirect(`${returnTo}?error=invalid_callback`);
    }

    const numericId = parseInt(installationId, 10);
    if (isNaN(numericId)) {
      redirect(`${returnTo}?error=invalid_installation_id`);
    }

    // installation_id comes from the query string: only link it if GitHub says this user can access it
    const accessible = await listInstallationsForUser(session.user.id);
    if (!accessible) {
      redirect(`${returnTo}?error=reauth_required`);
    }
    const installation = accessible.find((i) => i.id === numericId);
    if (!installation) {
      redirect(`${returnTo}?error=installation_not_accessible`);
    }

    await linkInstallation(workspaceId, installation);

    cookieStore.delete("orbit_install_return");

    redirect(`${returnTo}?org_connected=${encodeURIComponent(installation.account.login)}`);
  } catch (error) {
    // Next.js redirect() throws a special error — rethrow it
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("GitHub App installation callback error:", error);
    redirect(`${returnTo}?error=installation_failed`);
  }
}
