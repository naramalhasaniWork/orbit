import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { isGitHubAppConfigured } from "@/lib/github/app";
import { requirePermission } from "@/lib/auth/rbac";
import { syncInstallations } from "@/services/github-installation-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.view");

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
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const { workspaceId } = await requireWorkspace();
    const { session } = await requirePermission(workspaceId, "integrations.manage");

    if (!isGitHubAppConfigured()) {
      return apiError("GitHub App not configured", "NOT_CONFIGURED", 400);
    }

    const synced = await syncInstallations(workspaceId, session.user.id);
    if (synced === null) {
      return apiError("Sign in with GitHub again to sync installations", "REAUTH_REQUIRED", 409);
    }
    return apiSuccess({ synced });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.manage");
    const { installationId } = await request.json();

    if (!installationId) {
      return apiError("installationId is required", "MISSING_FIELD", 400);
    }

    await prisma.gitHubInstallation.deleteMany({
      where: { workspaceId, id: installationId },
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
