import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSetupOpen } from "@/lib/setup/access";
import {
  credentialVariables,
  escapeHtml,
  type ManifestConversion,
} from "@/lib/setup/github-app";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "orbit_manifest_state";
const CODE_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;

function page(body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>GitHub App created</title></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

function statesMatch(a: string | null | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * GitHub redirects here with a one-time `code`. We exchange it for the app's
 * credentials and show them once; nothing is stored. Gated like /setup, plus a
 * state cookie so only the browser that started the flow can finish it.
 */
export async function GET(request: NextRequest) {
  if (!(await isSetupOpen())) {
    return NextResponse.json({ success: false, error: { message: "Not found", code: "NOT_FOUND" } }, { status: 404 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !CODE_PATTERN.test(code) || !statesMatch(request.cookies.get(STATE_COOKIE)?.value, state)) {
    return page("<h1>Could not verify this request</h1><p>Start again from the setup page.</p>", 400);
  }

  const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!response?.ok) {
    return page("<h1>GitHub did not return the app credentials</h1><p>The code may have expired. Start again from the setup page.</p>", 502);
  }

  const app = (await response.json()) as ManifestConversion;
  const variables = credentialVariables(app)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");

  const result = page(`
<h1>GitHub App created</h1>
<p>These credentials are shown <strong>once</strong> and are not stored by Orbit. In Railway, open the
<code>web</code> service &gt; Variables &gt; Raw Editor, paste the lines below, and redeploy.</p>
<textarea readonly rows="12" style="width:100%;font-family:monospace;font-size:12px;" onfocus="this.select()">${escapeHtml(variables)}</textarea>
<p>Then reopen <a href="/setup">/setup</a>, confirm the checklist is green, and sign in with GitHub.</p>
${
    app.html_url?.startsWith("https://github.com/")
      ? `<p>App page: <a href="${escapeHtml(app.html_url)}">${escapeHtml(app.html_url)}</a></p>`
      : ""
  }`);
  result.cookies.delete({ name: STATE_COOKIE, path: "/api/setup/github-app" });
  return result;
}
