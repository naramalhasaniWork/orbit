import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { isGitHubAppConfigured } from "@/lib/github/app";
import { syncInstallations } from "@/services/github-installation-sync";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

export const GET = route({ permission: "integrations.view" }, async ({ workspaceId }) => {
  if (!isGitHubAppConfigured()) {
    return apiSuccess({
      configured: false,
      installUrl: null,
      installations: [],
    });
  }

  const installations = await prisma.gitHubInstallation.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      installationId: true,
      accountLogin: true,
      accountType: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  return apiSuccess({
    configured: true,
    // Always go through our route so the install carries a signed state
    installUrl: "/api/github/install",
    installations,
  });
});

export const POST = route(
  { permission: "integrations.manage" },
  async ({ workspaceId, session }) => {
    if (!isGitHubAppConfigured()) {
      return apiError("GitHub App not configured", "NOT_CONFIGURED", 400);
    }

    const synced = await syncInstallations(workspaceId, session.user.id);
    if (synced === null) {
      return apiError("Sign in with GitHub again to sync installations", "REAUTH_REQUIRED", 409);
    }
    return apiSuccess({ synced });
  }
);

export const DELETE = route(
  { permission: "integrations.manage" },
  async ({ req: request, workspaceId }) => {
    const { installationId } = await request.json();

    if (!installationId) {
      return apiError("installationId is required", "MISSING_FIELD", 400);
    }

    await prisma.gitHubInstallation.deleteMany({
      where: { workspaceId, id: installationId },
    });

    return apiSuccess({ deleted: true });
  }
);
