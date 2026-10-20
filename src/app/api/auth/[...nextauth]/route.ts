import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { checkIpRateLimit, getClientIp } from "@/lib/auth/rate-limit";

const handler = NextAuth(authOptions);

const AUTH_ATTEMPTS_PER_MINUTE = 20;

/** Sign-in initiation and provider callbacks are rate limited; /session polling is not. */
function isSignInPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth/callback/") || pathname.startsWith("/api/auth/signin/");
}

async function rateLimited(req: NextRequest, ctx: unknown) {
  if (isSignInPath(req.nextUrl.pathname)) {
    const limited = await checkIpRateLimit("auth", getClientIp(req.headers), AUTH_ATTEMPTS_PER_MINUTE);
    if (limited) return limited;
  }
  return (handler as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, ctx);
}

export { rateLimited as GET, rateLimited as POST };
