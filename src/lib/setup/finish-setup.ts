import { prisma } from "@/lib/db";
import { getSignupMode, isSelfHosted } from "@/lib/self-host";
import { readWorkspaceSettings } from "@/server/data/settings-repo";

export const FINISH_SETUP_SETTING = "finishSetupDismissed";

export interface FinishSetupStep {
  id: "github-app" | "model-key" | "invite" | "signup";
  title: string;
  description: string;
  done: boolean;
  href: string | null;
}

/** Roles that can act on the card's steps. */
const ADMIN_ROLES = new Set(["owner", "admin"]);

/**
 * Steps for the one-time "Finish setup" card, or null when it should not show:
 * not self-hosted, viewer is not an admin, or it was dismissed (stored on the workspace).
 */
export async function getFinishSetupSteps(
  workspaceId: string,
  role: string | null | undefined
): Promise<FinishSetupStep[] | null> {
  if (!isSelfHosted() || !role || !ADMIN_ROLES.has(role)) return null;

  const settings = await readWorkspaceSettings(workspaceId);
  if (!settings || settings.finishSetupDismissed === true) return null;

  const [installations, providers, members, invitations] = await Promise.all([
    prisma.gitHubInstallation.count({ where: { workspaceId } }),
    prisma.providerConfig.count({ where: { workspaceId } }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.workspaceInvitation.count({ where: { workspaceId } }),
  ]);

  const signup = getSignupMode();
  return [
    {
      id: "github-app",
      title: "Install the GitHub App on your repositories",
      description: "Orbit can only read code and report on pull requests for repositories where the app is installed.",
      done: installations > 0,
      href: "/dashboard/settings?tab=integrations",
    },
    {
      id: "model-key",
      title: "Connect a model key (optional)",
      description: "Orbit uses the AI provider keys from the environment. Add a key here only to use per-workspace keys.",
      done: providers > 0,
      href: "/dashboard/settings/providers",
    },
    {
      id: "invite",
      title: "Invite your teammates",
      description: "Sign-up is invite-only by default, so teammates need an invitation to join.",
      done: members > 1 || invitations > 0,
      href: "/dashboard/settings/members",
    },
    {
      id: "signup",
      title: `Choose who can sign up (currently: ${signup})`,
      description: "Set ORBIT_SIGNUP to open, invite or closed in Railway > web > Variables. Leaving it unset means invite.",
      done: Boolean(process.env.ORBIT_SIGNUP?.trim()),
      href: null,
    },
  ];
}
