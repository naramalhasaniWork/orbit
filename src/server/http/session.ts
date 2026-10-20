import { getServerSession as nextAuthGetServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { OrbitSession } from "@/lib/utils/types";
import { AuthError } from "./errors";

export async function getServerSession(): Promise<OrbitSession | null> {
  const session = await nextAuthGetServerSession(authOptions);
  if (!session?.user) return null;

  return session as OrbitSession;
}

export async function requireAuth(): Promise<OrbitSession> {
  const session = await getServerSession();

  if (!session) {
    throw new AuthError("Authentication required", "UNAUTHORIZED", 401);
  }

  return session;
}
