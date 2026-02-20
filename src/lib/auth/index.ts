import type { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { generateSlug } from "@/lib/utils/slug";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user user:email repo" } },
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return true;
    },

    async jwt({ token, user, trigger, account }) {
      if (trigger === "signIn" || trigger === "signUp") {
        // Store provider-specific access tokens
        if (account?.access_token) {
          if (account.provider === "github") {
            token.githubAccessToken = account.access_token;
          } else if (account.provider === "gitlab") {
            token.gitlabAccessToken = account.access_token;
          }
        }

        token.provider = account?.provider;

        if (user?.id) {
          token.userId = user.id;

          const membership = await prisma.workspaceMember.findFirst({
            where: { userId: user.id },
            include: { workspace: { select: { slug: true } } },
          });

          if (membership) {
            token.workspaceId = membership.workspaceId;
            token.role = membership.role;
            token.workspaceSlug = membership.workspace.slug;
          } else {
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
                role: "admin",
              },
            });

            token.workspaceId = workspace.id;
            token.workspaceSlug = workspace.slug;
            token.role = "admin";
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
        githubAccessToken: token.githubAccessToken as string | undefined,
        gitlabAccessToken: token.gitlabAccessToken as string | undefined,
        provider: token.provider as string | undefined,
      };
    },
  },
};
