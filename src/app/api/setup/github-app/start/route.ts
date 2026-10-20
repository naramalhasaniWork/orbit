import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSetupOpen, requestOrigin } from "@/lib/setup/access";
import { buildManifest, escapeHtml } from "@/lib/setup/github-app";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "orbit_manifest_state";
const ORG_PATTERN = /^[A-Za-z0-9-]{1,39}$/;

/**
 * Starts GitHub's app-manifest flow: returns a page that POSTs the manifest to
 * GitHub, which asks the operator to confirm and then redirects to our callback.
 * Only usable during first-run setup. ?org=<login> creates the app under an organization.
 */
export async function GET(request: NextRequest) {
  if (!(await isSetupOpen())) {
    return NextResponse.json({ success: false, error: { message: "Not found", code: "NOT_FOUND" } }, { status: 404 });
  }

  const org = request.nextUrl.searchParams.get("org");
  if (org && !ORG_PATTERN.test(org)) {
    return NextResponse.json({ success: false, error: { message: "Invalid organization", code: "VALIDATION_ERROR" } }, { status: 400 });
  }

  const baseUrl = process.env.NEXTAUTH_URL?.trim() || requestOrigin(request.headers);
  const state = randomBytes(24).toString("hex");
  const target = org
    ? `https://github.com/organizations/${org}/settings/apps/new`
    : "https://github.com/settings/apps/new";
  const manifest = escapeHtml(JSON.stringify(buildManifest(baseUrl)));

  const html = `<!doctype html><html><body>
<p>Redirecting to GitHub...</p>
<form id="f" method="post" action="${target}?state=${state}">
  <input type="hidden" name="manifest" value="${manifest}">
  <noscript><button type="submit">Continue to GitHub</button></noscript>
</form>
<script>document.getElementById("f").submit();</script>
</body></html>`;

  const response = new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: baseUrl.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/setup/github-app",
  });
  return response;
}
