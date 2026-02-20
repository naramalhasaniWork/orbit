import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    workspaceId: string;
    workspaceSlug: string;
    role: string;
    githubAccessToken?: string;
    gitlabAccessToken?: string;
    provider?: string;
  }

  interface User extends DefaultUser {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    workspaceId?: string;
    workspaceSlug?: string;
    role?: string;
    githubAccessToken?: string;
    gitlabAccessToken?: string;
    provider?: string;
  }
}
