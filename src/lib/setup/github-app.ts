/** Values an operator pastes into the GitHub App settings, and the manifest that pre-fills them. */

export const GITHUB_APP_PERMISSIONS = [
  { name: "Contents", key: "contents", level: "read" },
  { name: "Pull requests", key: "pull_requests", level: "write" },
  { name: "Checks", key: "checks", level: "write" },
  { name: "Metadata", key: "metadata", level: "read" },
  { name: "Members (organization)", key: "members", level: "read" },
] as const;

export const GITHUB_APP_EVENTS = [
  "installation",
  "installation_repositories",
  "push",
  "pull_request",
  "issue_comment",
] as const;

export interface GitHubAppSettings {
  baseUrl: string;
  callbackUrl: string;
  setupUrl: string;
  webhookUrl: string;
  manifestRedirectUrl: string;
}

export function githubAppSettings(rawBaseUrl: string): GitHubAppSettings {
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  return {
    baseUrl,
    callbackUrl: `${baseUrl}/api/auth/callback/github`,
    setupUrl: `${baseUrl}/api/github/installations/callback`,
    webhookUrl: `${baseUrl}/api/webhooks/github`,
    manifestRedirectUrl: `${baseUrl}/api/setup/github-app/callback`,
  };
}

/** GitHub App names are unique across GitHub and capped at 34 characters. */
export function defaultAppName(baseUrl: string): string {
  const host = new URL(baseUrl).hostname.split(".")[0] || "self-hosted";
  return `Orbit ${host}`.slice(0, 34);
}

export function buildManifest(baseUrl: string, name: string = defaultAppName(baseUrl)) {
  const urls = githubAppSettings(baseUrl);
  return {
    name,
    url: urls.baseUrl,
    hook_attributes: { url: urls.webhookUrl, active: true },
    redirect_url: urls.manifestRedirectUrl,
    callback_urls: [urls.callbackUrl],
    setup_url: urls.setupUrl,
    setup_on_update: true,
    request_oauth_on_install: true,
    public: false,
    default_permissions: Object.fromEntries(GITHUB_APP_PERMISSIONS.map((p) => [p.key, p.level])),
    default_events: [...GITHUB_APP_EVENTS],
  };
}

export interface ManifestConversion {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string;
  pem: string;
  html_url: string;
}

/** Railway variables for the credentials GitHub returns. The key is one line with literal \n. */
export function credentialVariables(app: ManifestConversion): Array<[string, string]> {
  return [
    ["GITHUB_APP_ID", String(app.id)],
    ["GITHUB_APP_SLUG", app.slug],
    ["GITHUB_CLIENT_ID", app.client_id],
    ["GITHUB_CLIENT_SECRET", app.client_secret],
    ["GITHUB_WEBHOOK_SECRET", app.webhook_secret],
    ["GITHUB_APP_PRIVATE_KEY", app.pem.trim().replace(/\r?\n/g, "\\n")],
  ];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
