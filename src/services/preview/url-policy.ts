import { assertPublicUrl, UnsafeUrlError } from "@/lib/utils/ssrf";

/**
 * A preview URL becomes an Orbit Environment, and project secrets are sent to whatever URL
 * an environment points at. So a URL is only accepted when it is https, its host is one the
 * binding allows, and it resolves to a public address.
 */
export async function validatePreviewUrl(
  rawUrl: string,
  allowedHostSuffixes: string[]
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `Preview URL is not a valid URL: ${rawUrl}` };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: `Preview URL must use https: ${rawUrl}` };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostMatchesSuffixes(host, allowedHostSuffixes)) {
    return {
      ok: false,
      reason: `Preview host ${host} is not in this project's allowed hosts (${allowedHostSuffixes.join(", ") || "none"})`,
    };
  }

  try {
    await assertPublicUrl(url.toString());
  } catch (err) {
    const msg = err instanceof UnsafeUrlError ? err.message : String(err);
    return { ok: false, reason: `Preview URL rejected: ${msg}` };
  }
  return { ok: true, url: url.origin + url.pathname.replace(/\/$/, "") };
}

export function hostMatchesSuffixes(host: string, suffixes: string[]): boolean {
  return suffixes.some((raw) => {
    const suffix = normalizeHostSuffix(raw);
    return !!suffix && (host === suffix || host.endsWith(`.${suffix}`));
  });
}

/**
 * Lowercase, strip a leading "*." or ".", and reject anything without a dot so a suffix
 * like "app" cannot allow every .app host. Returns null when the value is unusable.
 */
export function normalizeHostSuffix(raw: string): string | null {
  const suffix = raw.trim().toLowerCase().replace(/^\*?\./, "").replace(/\.$/, "");
  if (!suffix.includes(".") || !/^[a-z0-9.-]+$/.test(suffix)) return null;
  return suffix;
}
