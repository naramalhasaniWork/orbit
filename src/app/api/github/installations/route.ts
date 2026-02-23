import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { isGitHubAppConfigured, getInstallUrl } from "@/lib/github/app";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace();

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
      installUrl: getInstallUrl(),
      installations,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace();
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
