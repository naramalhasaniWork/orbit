import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSelfHosted } from "@/lib/self-host";

const PUBLIC_PATHS = ["/login", "/api/auth"];

/** Routes that do not exist on a self-hosted instance (no billing, no Stripe). */
function isBillingApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/billing") || pathname === "/api/webhooks/stripe";
}

/** Marketing pages hidden on self-hosted instances. Legal pages (privacy, terms, security) stay. */
const SELF_HOST_HIDDEN_MARKETING = ["about", "blog", "changelog", "content", "docs", "features", "pricing"];

function isHiddenMarketingPath(pathname: string): boolean {
  return SELF_HOST_HIDDEN_MARKETING.some((name) => pathname === `/${name}` || pathname.startsWith(`/${name}/`));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isSelfHosted() && isBillingApiPath(pathname)) {
    return NextResponse.json(
      { success: false, error: { message: "Not found", code: "NOT_FOUND" } },
      { status: 404 }
    );
  }

  if (isSelfHosted() && isHiddenMarketingPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Protect /admin routes — require super_admin role
  if (pathname.startsWith("/admin")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (token.userRole !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
  }

  // Protect /dashboard routes — require auth
  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/billing/:path*",
    "/api/webhooks/stripe",
    ...SELF_HOST_HIDDEN_MARKETING.map((name) => `/${name}/:path*`),
  ],
};
