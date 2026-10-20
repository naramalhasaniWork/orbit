import { prisma } from "@/lib/db";
import { listUserInstallations, type UserInstallation } from "@/lib/github/app";
import { decryptToken } from "@/lib/vault/token";

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
      // Find workspaces affected before deleting
      const affected = await prisma.gitHubInstallation.findMany({
        where: { installationId: installation.id },
        select: { workspaceId: true },
      });

      await prisma.gitHubInstallation
        .deleteMany({ where: { installationId: installation.id } })
        .catch(() => {});

      for (const { workspaceId } of affected) {
        await syncWorkspaceGitHubSettings(workspaceId);
      }

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

  await syncWorkspaceGitHubSettings(workspace.id);

  console.log(
    `[install-sync] Registered installation ${installationId} (${accountLogin}) for workspace ${workspace.id}`
  );
}

/** Installations of the app that this user can access on GitHub; null if we hold no token for them. */
export async function listInstallationsForUser(userId: string): Promise<UserInstallation[] | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  });
  const token = decryptToken(user?.githubAccessToken);
  return token ? listUserInstallations(token) : null;
}

/** Link one (already verified) installation to a workspace and refresh its GitHub settings. */
export async function linkInstallation(workspaceId: string, inst: UserInstallation): Promise<void> {
  const fields = {
    accountLogin: inst.account.login,
    accountType: inst.account.type,
    avatarUrl: inst.account.avatar_url,
  };
  await prisma.gitHubInstallation.upsert({
    where: { workspace_installation_unique: { workspaceId, installationId: inst.id } },
    update: fields,
    create: { workspaceId, installationId: inst.id, ...fields },
  });
  await syncWorkspaceGitHubSettings(workspaceId);
}

/**
 * Attach the installations the signed-in user can access on GitHub to the workspace.
 * Never lists the app's installations globally: other customers' installs are not claimable.
 * Returns how many were newly linked, or null if the user has no GitHub token on file.
 */
export async function syncInstallations(workspaceId: string, userId: string): Promise<number | null> {
  const accessible = await listInstallationsForUser(userId);
  if (!accessible) return null;

  const linked = await prisma.gitHubInstallation.findMany({
    where: { workspaceId },
    select: { installationId: true },
  });
  const already = new Set(linked.map((l) => l.installationId));

  let synced = 0;
  for (const inst of accessible) {
    if (already.has(inst.id)) continue;
    await linkInstallation(workspaceId, inst);
    synced++;
  }
  return synced;
}

async function syncWorkspaceGitHubSettings(workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { settings: true },
  });
  const currentSettings = (workspace?.settings as Record<string, unknown>) ?? {};

  const installs = await prisma.gitHubInstallation.findMany({
    where: { workspaceId },
    select: { installationId: true, accountLogin: true },
  });

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      settings: {
        ...currentSettings,
        github: installs.length > 0
          ? {
              connected: true,
              installationId: String(installs[0].installationId),
              repos: installs.map((i) => i.accountLogin),
            }
          : { connected: false },
      },
    },
  });
}

async function findWorkspaceForGitHubUser(
  senderGitHubId: number
): Promise<{ id: string } | null> {
  const account = await prisma.account.findFirst({
    where: {
      provider: "github",
      providerAccountId: String(senderGitHubId),
    },
    select: {
      user: {
        select: {
          memberships: {
            where: { workspace: { deletedAt: null } },
            orderBy: { createdAt: "desc" },
            select: { workspaceId: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!account?.user?.memberships[0]) return null;
  return { id: account.user.memberships[0].workspaceId };
}
