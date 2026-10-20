import type { BrowserContext } from "playwright";
import { safeFetch } from "@/lib/utils/ssrf";

/**
 * Cloudflare Access service tokens for environments behind Access (typically previews).
 * Stored as project Secrets; sent as CF-Access-Client-Id / CF-Access-Client-Secret on every
 * request to the environment's origin (strict mode sets no cookie, so each request needs them).
 *
 * Headers are attached with context.route scoped to that one origin, never extraHTTPHeaders,
 * which would hand the service token to every third-party host the page loads, and redirects
 * are never followed with the headers attached.
 */
export const ACCESS_SECRET_KEYS = {
  clientId: "CF_ACCESS_CLIENT_ID",
  clientSecret: "CF_ACCESS_CLIENT_SECRET",
} as const;

/** Prefix stored on PreviewBinding.accessSecretPrefix when Access is configured. */
export const ACCESS_SECRET_PREFIX = "CF_ACCESS";

export const ACCESS_REJECTED_MESSAGE =
  "Cloudflare Access blocked the test browser. Check the CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET project secrets, and that the Access application has a Service Auth policy that includes this service token.";

export type AccessHeaders = Record<"CF-Access-Client-Id" | "CF-Access-Client-Secret", string>;

/**
 * Only environments in "cloudflare_access" mode receive the Access secrets; everywhere else
 * they are dropped so the token never reaches an origin it was not meant for.
 */
export function gateAccessCredentials(
  credentials: Record<string, string>,
  accessMode: string | null | undefined
): Record<string, string> {
  if (accessMode === "cloudflare_access") return credentials;
  const rest = { ...credentials };
  delete rest[ACCESS_SECRET_KEYS.clientId];
  delete rest[ACCESS_SECRET_KEYS.clientSecret];
  return rest;
}

/**
 * Split the Access token out of the credentials, so it is never shown to the executor model
 * as a "test credential".
 */
export function splitAccessCredentials(credentials: Record<string, string>): {
  headers: AccessHeaders | null;
  credentials: Record<string, string>;
} {
  const clientId = credentials[ACCESS_SECRET_KEYS.clientId];
  const clientSecret = credentials[ACCESS_SECRET_KEYS.clientSecret];
  const rest = gateAccessCredentials(credentials, null);
  if (!clientId || !clientSecret) return { headers: null, credentials: rest };
  return {
    headers: { "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret },
    credentials: rest,
  };
}

export async function installAccessHeaders(
  context: BrowserContext,
  environmentUrl: string,
  headers: AccessHeaders
): Promise<void> {
  const origin = new URL(environmentUrl).origin;
  await context.route(
    (url) => url.origin === origin,
    async (route) => {
      // Fetch this one hop with the headers and hand the response back unfollowed. route.continue
      // would follow a 3xx inside Playwright with the headers still attached, leaking the token
      // to whatever host the origin redirects to. A fulfilled 3xx is followed by the browser,
      // so each hop comes back through this origin matcher.
      const response = await route.fetch({ headers: { ...route.request().headers(), ...headers }, maxRedirects: 0 });
      await route.fulfill({ response });
    }
  );
}

/** Access sends unauthenticated browsers to <team>.cloudflareaccess.com to log in. */
export function isAccessRejection(finalUrl: string): boolean {
  try {
    return new URL(finalUrl).hostname.toLowerCase().endsWith(".cloudflareaccess.com");
  } catch {
    return false;
  }
}

function blockedByAccess(response: Response, requestUrl: string): boolean {
  if (response.status === 401 || response.status === 403) return true;
  const location = response.headers.get("location");
  if (response.status < 300 || response.status >= 400 || !location) return false;
  try {
    return isAccessRejection(new URL(location, requestUrl).toString());
  } catch {
    return false;
  }
}

export interface AccessProbeResult {
  protectedWithoutToken: boolean;
  allowedWithToken: boolean;
  message: string;
}

/**
 * "Test access": request the URL without and then with the service token. Redirects are not
 * followed, so the token is only ever sent to the URL given.
 */
export async function probeAccess(url: string, headers: AccessHeaders): Promise<AccessProbeResult> {
  const without = await safeFetch(url, { method: "GET" }, { followRedirects: false });
  const withToken = await safeFetch(url, { method: "GET", headers }, { followRedirects: false });
  const protectedWithoutToken = blockedByAccess(without, url);
  const allowedWithToken = !blockedByAccess(withToken, url) && withToken.status < 500;

  let message: string;
  if (allowedWithToken && protectedWithoutToken) message = "Access is on and the service token gets through.";
  else if (allowedWithToken) message = "The URL is reachable, but it does not look protected by Access (it loads without the token).";
  else message = `The service token was rejected (HTTP ${withToken.status}). ${ACCESS_REJECTED_MESSAGE}`;
  return { protectedWithoutToken, allowedWithToken, message };
}
