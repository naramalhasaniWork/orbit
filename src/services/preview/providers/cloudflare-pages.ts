import {
  PREVIEW_PROVIDER_IDS,
  PreviewProviderError,
  type PreviewProvider,
  type ProviderAccess,
  type ResolveInput,
  type ResolveResult,
} from "../types";

/**
 * Cloudflare Pages preview deployments, found by polling (Pages has no webhook Orbit can use).
 * GET /accounts/{id}/pages/projects/{p}/deployments?env=preview returns url, latest_stage
 * {name,status} and deployment_trigger.metadata {branch, commit_hash}. Needs "Pages Read".
 * Ready = latest stage "deploy" with status "success". The deployment `url` is the immutable
 * per-deployment hash URL, so a later push to the branch cannot change what was tested.
 * Fork PRs get no preview deployment.
 */
const CF_API = "https://api.cloudflare.com/client/v4";

interface CfEnvelope<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result: T;
}

export interface CfDeployment {
  id: string;
  url: string;
  environment: string;
  latest_stage?: { name: string; status: string } | null;
  deployment_trigger?: { metadata?: { branch?: string; commit_hash?: string } } | null;
}

function accountId(access: ProviderAccess): string {
  const id = access.config.accountId;
  if (typeof id !== "string" || !/^[a-f0-9]{32}$/i.test(id)) {
    throw new PreviewProviderError("Cloudflare account id is missing or malformed (32 hex characters)");
  }
  return id;
}

async function cfGet<T>(access: ProviderAccess, path: string): Promise<T> {
  const response = await fetch(`${CF_API}/accounts/${accountId(access)}${path}`, {
    headers: { Authorization: `Bearer ${access.token}`, Accept: "application/json" },
  });
  const body = (await response.json().catch(() => null)) as CfEnvelope<T> | null;
  if (!response.ok || !body?.success) {
    const detail = body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
    const hint =
      response.status === 401 || response.status === 403
        ? " Check the token has Account > Cloudflare Pages > Read for this account."
        : "";
    throw new PreviewProviderError(`Cloudflare API error: ${detail}.${hint}`, response.status);
  }
  return body.result;
}

/** Pure: classify the deployment for one commit out of a deployments page. */
export function resolveFromDeployments(deployments: CfDeployment[], commitSha: string): ResolveResult {
  const sha = commitSha.toLowerCase();
  const match = deployments.find(
    (d) => d.environment === "preview" && d.deployment_trigger?.metadata?.commit_hash?.toLowerCase() === sha
  );
  if (!match) return { state: "pending" };

  const stage = match.latest_stage;
  if (stage?.status === "failure" || stage?.status === "canceled") {
    return { state: "failed", externalId: match.id, reason: `Cloudflare Pages ${stage.name} stage ${stage.status}` };
  }
  if (stage?.name === "deploy" && stage.status === "success") {
    return { state: "ready", url: match.url, externalId: match.id };
  }
  return { state: "pending" };
}

async function resolvePages({ access, targetRef, commitSha }: ResolveInput): Promise<ResolveResult> {
  const deployments = await cfGet<CfDeployment[]>(
    access,
    `/pages/projects/${encodeURIComponent(targetRef)}/deployments?env=preview`
  );
  return resolveFromDeployments(deployments, commitSha);
}

export const cloudflarePagesProvider: PreviewProvider = {
  id: PREVIEW_PROVIDER_IDS.cloudflarePages,

  async verify(access) {
    await cfGet<unknown[]>(access, "/pages/projects");
  },

  async listTargets(access) {
    const projects = await cfGet<Array<{ name: string; subdomain?: string }>>(access, "/pages/projects");
    return projects.map((p) => ({ ref: p.name, label: p.subdomain ? `${p.name} (${p.subdomain})` : p.name }));
  },

  resolve: resolvePages,
};
