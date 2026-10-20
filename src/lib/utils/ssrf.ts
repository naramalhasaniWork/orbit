/**
 * SSRF guard for server-side fetches of user-supplied URLs (environments, MCP servers).
 *
 * assertPublicUrl: pre-check. http/https only, no embedded credentials, and the hostname must
 * not be (or resolve to) a loopback, private, link-local, CGNAT or internal address.
 * safeFetch: follows redirects manually and re-validates every hop, and connects through
 * ssrf-transport, which re-checks the address at connect time so DNS rebinding between the
 * pre-check and the connection cannot reach a private address.
 *
 * Playwright browser navigation cannot use this transport: it relies on the pre-check in
 * validateEnvironment plus ORBIT_ALLOW_PRIVATE_TARGETS, and a page that redirects or
 * rebinds after the first load is not covered.
 */

import { isIP } from "net";
import { lookup } from "dns/promises";
import { blockedHostnameReason, blockedIpReason, UnsafeUrlError } from "./ssrf-rules";
import { pinnedRequest } from "./ssrf-transport";

export { UnsafeUrlError };

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Throws UnsafeUrlError unless the URL is http(s) and points at a public host.
 * Returns the parsed URL.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Protocol ${url.protocol} is not allowed (http/https only)`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed");
  }

  // Strip IPv6 brackets and the trailing dot of fully-qualified names.
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname) throw new UnsafeUrlError("URL has no hostname");

  const hostReason = blockedHostnameReason(hostname);
  if (hostReason) throw new UnsafeUrlError(`Host ${hostname} is blocked: ${hostReason}`);

  if (isIP(hostname)) {
    const reason = blockedIpReason(hostname);
    if (reason) throw new UnsafeUrlError(`Host ${hostname} is blocked: ${reason}`);
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(`Cannot resolve host ${hostname}`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`Cannot resolve host ${hostname}`);

  // Every record must be public: a mixed answer is how rebinding tricks usually start.
  for (const { address } of addresses) {
    const reason = blockedIpReason(address);
    if (reason) throw new UnsafeUrlError(`Host ${hostname} resolves to a ${reason}`);
  }
  return url;
}

/**
 * fetch() that validates the target and every redirect hop with assertPublicUrl.
 * Redirects are followed manually (up to 5); any caller-supplied `redirect` option is ignored.
 * Only string/binary bodies are supported.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let current = rawUrl;
  let method = init.method ?? "GET";
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const response = await pinnedRequest(url, { method, headers, body, signal: init.signal ?? undefined });

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    const next = new URL(location, url);
    // Drop credentials when a redirect leaves the original origin.
    if (next.origin !== url.origin) {
      headers = new Headers(headers);
      headers.delete("authorization");
      headers.delete("cookie");
    }
    // Per fetch spec: 303 (and 301/302 after POST) become GET without a body.
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      if (method !== "HEAD") method = "GET";
      body = undefined;
    }
    current = next.toString();
  }

  throw new UnsafeUrlError(`Too many redirects (more than ${MAX_REDIRECTS})`);
}
