import type { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { generateSlug } from "@/lib/utils/slug";
import { encryptToken } from "@/lib/vault/token";
import { evaluateSignIn } from "./signup-policy";
import { isSelfHosted } from "@/lib/self-host";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user user:email repo read:org" } },
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
                await prisma.user.update({
                  where: { id: user.id },
                  data: { githubAccessToken: encryptToken(account.access_token) },
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
            where: { userId: user.id },
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
