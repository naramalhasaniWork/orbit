import { SignJWT } from "jose";
import { createPrivateKey } from "crypto";

const GITHUB_API = "https://api.github.com";

function getAppConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !raw) return null;

  const privateKey = raw.replace(/\\n/g, "\n");
  return { appId, privateKey };
}

export function isGitHubAppConfigured(): boolean {
  return getAppConfig() !== null;
}

export function getInstallUrl(): string {
  const appSlug = process.env.GITHUB_APP_SLUG ?? "orbit-testing";
  return `https://github.com/apps/${appSlug}/installations/new`;
}

async function generateAppJwt(): Promise<string> {
  const config = getAppConfig();
  if (!config) throw new Error("GitHub App not configured");

  // createPrivateKey handles both PKCS#1 (RSA PRIVATE KEY) and PKCS#8 (PRIVATE KEY)
  const key = createPrivateKey(config.privateKey);

  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 600)
    .setIssuer(config.appId)
    .sign(key);
}

export async function getInstallationToken(
  installationId: number
): Promise<string> {
  const jwt = await generateAppJwt();

  const res = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get installation token: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.token;
}

interface GitHubInstallationInfo {
  id: number;
  account: {
    login: string;
    type: string;
    avatar_url: string;
  };
  app_slug: string;
  permissions: Record<string, string>;
  repository_selection: string;
}

export async function getInstallationInfo(
  installationId: number
): Promise<GitHubInstallationInfo> {
  const jwt = await generateAppJwt();

  const res = await fetch(
    `${GITHUB_API}/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get installation info: ${res.status} ${text}`);
  }

  return res.json();
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  default_branch: string;
  updated_at: string;
  html_url: string;
  owner: { login: string; avatar_url: string };
}

export async function listInstallationRepos(
  installationId: number,
  page = 1,
  perPage = 100
): Promise<GitHubRepo[]> {
  const token = await getInstallationToken(installationId);

  const res = await fetch(
    `${GITHUB_API}/installation/repositories?per_page=${perPage}&page=${page}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list installation repos: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.repositories ?? [];
}
