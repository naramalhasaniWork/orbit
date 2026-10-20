const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

/**
 * Outbound webhooks are fetched server-side, so only public https targets are
 * accepted. Literal private/loopback hosts are rejected; hostnames that resolve
 * to private addresses are not checked here.
 */
export function isAllowedWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host.startsWith("[")) return false; // IPv6 literals
  return !PRIVATE_IPV4.some((pattern) => pattern.test(host));
}
