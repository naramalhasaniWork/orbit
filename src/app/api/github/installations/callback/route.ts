import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/utils/api";
import {
  isGitHubAppConfigured,
  getInstallationInfo,
} from "@/lib/github/app";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    if (!isGitHubAppConfigured()) {
      redirect("/dashboard/settings?error=github_app_not_configured");
    }

    const installationId = request.nextUrl.searchParams.get("installation_id");
    const setupAction = request.nextUrl.searchParams.get("setup_action");

    if (!installationId || setupAction !== "install") {
      redirect("/dashboard/settings?error=invalid_callback");
    }

    const numericId = parseInt(installationId, 10);
    if (isNaN(numericId)) {
      redirect("/dashboard/settings?error=invalid_installation_id");
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

    redirect("/dashboard/settings?github_app=installed");
  } catch (error) {
    console.error("GitHub App installation callback error:", error);
    redirect("/dashboard/settings?error=installation_failed");
  }
}
