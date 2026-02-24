import { prisma } from "@/lib/db";
import { listAllAppInstallations } from "@/lib/github/app";

interface InstallationPayload {
  installation: {
    id: number;
    account: {
      login: string;
      type: string;
      avatar_url: string;
    };
  };
  sender: {
    login: string;
    id: number;
  };
  action: string;
}

/**
 * Handle GitHub App installation/uninstallation webhook events.
 * Links the installation to the workspace of the user who triggered it.
 */
export async function handleInstallationEvent(
  event: string,
  payload: Record<string, unknown>
): Promise<{ status: string }> {
  const data = payload as unknown as InstallationPayload;
  const { installation, sender, action } = data;

  if (event === "installation") {
    if (action === "created") {
      await registerInstallation(
        installation.id,
        installation.account.login,
        installation.account.type,
        installation.account.avatar_url,
        sender.id
      );
      return { status: "installation_registered" };
    }

    if (action === "deleted") {
      await prisma.gitHubInstallation
        .deleteMany({ where: { installationId: installation.id } })
        .catch(() => {});
      return { status: "installation_removed" };
    }
  }

  return { status: `installation_event_${action}` };
}

/**
 * Register a GitHub App installation by finding the workspace of the sender.
 */
async function registerInstallation(
  installationId: number,
  accountLogin: string,
  accountType: string,
  avatarUrl: string,
  senderGitHubId: number
): Promise<void> {
  const workspace = await findWorkspaceForGitHubUser(senderGitHubId);
  if (!workspace) {
    console.warn(
      `[install-sync] No workspace found for GitHub user ID ${senderGitHubId}, skipping`
    );
    return;
  }

  await prisma.gitHubInstallation.upsert({
    where: {
      workspace_installation_unique: {
        workspaceId: workspace.id,
        installationId,
      },
    },
    update: {
      accountLogin,
      accountType,
      avatarUrl,
      updatedAt: new Date(),
    },
    create: {
      workspaceId: workspace.id,
      installationId,
      accountLogin,
      accountType,
      avatarUrl,
    },
  });

  console.log(
    `[install-sync] Registered installation ${installationId} (${accountLogin}) for workspace ${workspace.id}`
  );
}

/**
 * Sync all GitHub App installations into the workspace.
 * Useful for catching installs that happened outside the callback flow.
 */
export async function syncInstallations(workspaceId: string): Promise<number> {
  const installations = await listAllAppInstallations();
  let synced = 0;

  for (const inst of installations) {
    const existing = await prisma.gitHubInstallation.findFirst({
      where: { installationId: inst.id },
    });

    if (!existing) {
      await prisma.gitHubInstallation.create({
        data: {
          workspaceId,
          installationId: inst.id,
          accountLogin: inst.account.login,
          accountType: inst.account.type,
          avatarUrl: inst.account.avatar_url,
        },
      });
      synced++;
    }
  }

  return synced;
}

async function findWorkspaceForGitHubUser(
  senderGitHubId: number
): Promise<{ id: string } | null> {
  // Match sender by GitHub account ID stored in the Account table
  const account = await prisma.account.findFirst({
    where: {
      provider: "github",
      providerAccountId: String(senderGitHubId),
    },
    select: {
      user: {
        select: {
          workspaces: {
            select: { workspaceId: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!account?.user?.workspaces[0]) return null;
  return { id: account.user.workspaces[0].workspaceId };
}
