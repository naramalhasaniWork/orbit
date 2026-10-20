import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/utils/api";
import { safeReturnPath } from "@/lib/utils/safe-redirect";
import {
  isGitHubAppConfigured,
  getInstallationInfo,
} from "@/lib/github/app";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const returnTo = safeReturnPath(cookieStore.get("orbit_install_return")?.value);

  try {
    const { workspaceId } = await requireWorkspace();

    if (!isGitHubAppConfigured()) {
      redirect(`${returnTo}?error=github_app_not_configured`);
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

    const info = await getInstallationInfo(numericId);

    await prisma.gitHubInstallation.upsert({
      where: {
        workspace_installation_unique: {
          workspaceId,
          installationId: numericId,
        },
      },
      create: {
        workspaceId,
        installationId: numericId,
        accountLogin: info.account.login,
        accountType: info.account.type,
        avatarUrl: info.account.avatar_url,
      },
      update: {
        accountLogin: info.account.login,
        accountType: info.account.type,
        avatarUrl: info.account.avatar_url,
      },
    });

    // Sync workspace.settings.github so the UI shows connected status
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });
    const currentSettings = (workspace?.settings as Record<string, unknown>) ?? {};

    // Gather all installation accounts for this workspace
    const allInstalls = await prisma.gitHubInstallation.findMany({
      where: { workspaceId },
      select: { installationId: true, accountLogin: true },
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        settings: {
          ...currentSettings,
          github: {
            connected: true,
            installationId: String(numericId),
            repos: allInstalls.map((i) => i.accountLogin),
          },
        },
      },
    });

    cookieStore.delete("orbit_install_return");

    redirect(`${returnTo}?org_connected=${info.account.login}`);
  } catch (error) {
    // Next.js redirect() throws a special error — rethrow it
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("GitHub App installation callback error:", error);
    redirect(`${returnTo}?error=installation_failed`);
  }
}
