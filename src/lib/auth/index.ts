import type { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";
import { createEncryptingAdapter } from "./adapter";
import { prisma } from "@/lib/db";
import { generateSlug } from "@/lib/utils/slug";
import { encryptToken } from "@/lib/vault/token";
import { evaluateSignIn } from "./signup-policy";
import { consumeRateLimit } from "./rate-limit";
import { isSelfHosted } from "@/lib/self-host";

const SIGNIN_ATTEMPTS_PER_ACCOUNT = 10;
const SIGNIN_WINDOW_SEC = 600;

export const authOptions: AuthOptions = {
  adapter: createEncryptingAdapter(),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // GitHub Apps ignore OAuth scopes (permissions come from the App's configuration),
      // so none are requested here. GITHUB_CLIENT_ID/SECRET must be the GitHub App's.
    }),
    ...(process.env.GITLAB_CLIENT_ID
      ? [
          GitLabProvider({
            clientId: process.env.GITLAB_CLIENT_ID,
            clientSecret: process.env.GITLAB_CLIENT_SECRET!,
            authorization: { params: { scope: "read_user read_api read_repository" } },
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
    maxAge: 4 * 60 * 60, // 4 hours — short-lived for security
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Second limit keyed on the account, so rotating IPs does not help guess at one account
      const attempts = await consumeRateLimit(
        `signin:${user.email.toLowerCase()}`,
        SIGNIN_ATTEMPTS_PER_ACCOUNT,
        SIGNIN_WINDOW_SEC
      );
      if (!attempts.allowed) return "/login?error=RateLimited";
      const decision = await evaluateSignIn(user.email);
      return decision.allowed ? true : `/login?error=${decision.error}`;
    },

    async jwt({ token, user, trigger, account, session: updateData }) {
      // Handle workspace switching via update() from the client
      if (trigger === "update" && updateData?.workspaceId) {
        const requestedId = updateData.workspaceId as string;
        // Verify the user is actually a member of this workspace
        const membership = await prisma.workspaceMember.findFirst({
          where: {
            userId: token.userId as string,
            workspaceId: requestedId,
            workspace: { deletedAt: null },
          },
          include: { workspace: { select: { slug: true } } },
        });
        if (membership) {
          token.workspaceId = membership.workspaceId;
          token.role = membership.role;
          token.workspaceSlug = membership.workspace.slug;
        }
        return token;
      }

      if (trigger === "signIn" || trigger === "signUp") {
        // Store provider-specific access tokens
        if (account?.access_token) {
          if (account.provider === "github") {
            token.githubAccessToken = account.access_token;
            // Persist (encrypted) so background workers can access it. This also
            // upgrades any legacy plaintext value on the user's next login.
            if (user?.id) {
              try {
                const encrypted = encryptToken(account.access_token);
                await prisma.user.update({
                  where: { id: user.id },
                  data: { githubAccessToken: encrypted },
                });
                // Keeps the accounts row fresh and upgrades legacy plaintext to ciphertext
                await prisma.account.updateMany({
                  where: { userId: user.id, provider: "github" },
                  data: { access_token: encrypted },
                });
              } catch (err) {
                console.error("[Auth] Could not store encrypted GitHub token:", err);
              }
            }
          } else if (account.provider === "gitlab") {
            token.gitlabAccessToken = account.access_token;
          }
        }

        token.provider = account?.provider;

        if (user?.id) {
          token.userId = user.id;

          // Auto-promote super admin emails
          const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);

          // On a self-hosted instance the first account to exist owns it
          const isFirstSelfHostUser = isSelfHosted() && (await prisma.user.count()) === 1;

          const isSuperAdmin =
            isFirstSelfHostUser ||
            (user.email && superAdminEmails.includes(user.email.toLowerCase()));

          if (isSuperAdmin) {
            await prisma.user.update({
              where: { id: user.id },
              data: { role: "super_admin" },
            });
          }

          // Fetch user platform role
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          token.userRole = dbUser?.role ?? "user";

          const membership = await prisma.workspaceMember.findFirst({
            where: { userId: user.id, workspace: { deletedAt: null } },
            orderBy: { createdAt: "desc" }, // most recently joined
            include: { workspace: { select: { slug: true } } },
          });

          if (membership) {
            token.workspaceId = membership.workspaceId;
            token.role = membership.role;
            token.workspaceSlug = membership.workspace.slug;
          } else {
            // Check for pending invitations before auto-creating a workspace
            const pendingInvitation =
              await prisma.workspaceInvitation.findFirst({
                where: {
                  email: user.email!.toLowerCase(),
                  status: "pending",
                  expiresAt: { gt: new Date() },
                  workspace: { deletedAt: null },
                },
                include: {
                  workspace: { select: { id: true, slug: true } },
                },
              });

            if (pendingInvitation) {
              // Auto-accept the invitation within a transaction
              await prisma.$transaction([
                prisma.workspaceMember.create({
                  data: {
                    workspaceId: pendingInvitation.workspaceId,
                    userId: user.id,
                    role: pendingInvitation.role,
                  },
                }),
                prisma.workspaceInvitation.update({
                  where: { id: pendingInvitation.id },
                  data: { status: "accepted", acceptedAt: new Date() },
                }),
              ]);

              token.workspaceId = pendingInvitation.workspaceId;
              token.workspaceSlug = pendingInvitation.workspace.slug;
              token.role = pendingInvitation.role;
            } else {
              // No pending invitations — create a fresh workspace
              const slug = generateSlug(
                user.name || user.email || "workspace"
              );

              const workspace = await prisma.workspace.create({
                data: { name: user.name || "My Workspace", slug },
              });

              await prisma.workspaceMember.create({
                data: {
                  workspaceId: workspace.id,
                  userId: user.id,
                  role: "owner",
                },
              });

              token.workspaceId = workspace.id;
              token.workspaceSlug = workspace.slug;
              token.role = "owner";
            }
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.userId as string,
        },
        workspaceId: token.workspaceId as string,
        workspaceSlug: token.workspaceSlug as string,
        role: token.role as string,
        userRole: (token.userRole as string) ?? "user",
        provider: token.provider as string | undefined,
      };
    },
  },
};
