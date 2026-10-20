/**
 * Preview providers build a deployment per pull request (Railway PR environments,
 * Cloudflare Pages preview deployments). Orbit waits for that deployment, then tests it.
 *
 * Webhook payloads are hints only: they say "look again". resolve() always asks the
 * provider API for the deployment state and URL, so a forged or stale event cannot
 * point a run at an arbitrary URL.
 */

/** Map of provider ids; also the values stored in PreviewConnection.provider. */
export const PREVIEW_PROVIDER_IDS = {
  railway: "railway",
  cloudflarePages: "cloudflare_pages",
} as const;

export type PreviewProviderId = (typeof PREVIEW_PROVIDER_IDS)[keyof typeof PREVIEW_PROVIDER_IDS];

export const PREVIEW_STATUS = {
  pending: "pending",
  ready: "ready",
  failed: "failed",
  gone: "gone",
} as const;

export type PreviewStatus = (typeof PREVIEW_STATUS)[keyof typeof PREVIEW_STATUS];

/** Decrypted credentials plus the connection's non-secret config. */
export interface ProviderAccess {
  token: string;
  config: Record<string, unknown>;
}

/** Something a project can bind to: a Railway project/service or a Cloudflare Pages project. */
export interface PreviewTarget {
  ref: string;
  label: string;
}

/**
 * What a provider webhook told us, after parsing. Webhooks are unsigned hints: no field here
 * may scope which rows change or decide a transition. Everything is re-read from the provider
 * API (resolve / verifyDeploy) with the connection's own credentials.
 */
export interface PreviewHint {
  /** Provider event name, e.g. "Deployment.succeeded" */
  event: string;
  externalId: string | null;
  commitSha: string | null;
  branch: string | null;
  /** True for a PR/preview environment, false for a long-lived one (production, staging) */
  isPreview: boolean;
  /** Provider-specific ids, e.g. the Railway environment id; only used after API validation */
  refs: Record<string, string>;
}

/** A long-lived (non-PR) deployment confirmed by the provider API, with API-sourced facts. */
export interface VerifiedDeploy {
  deploymentId: string;
  branch: string | null;
  commitSha: string | null;
}

export interface ResolveInput {
  access: ProviderAccess;
  targetRef: string;
  commitSha: string;
  hint?: PreviewHint;
}

export type ResolveResult =
  | { state: "pending" }
  | { state: "ready"; url: string; externalId: string }
  | { state: "failed"; externalId: string | null; reason: string }
  | { state: "gone"; externalId: string | null };

export interface PreviewProvider {
  id: PreviewProviderId;
  /** Check the credentials work; throws PreviewProviderError with a user-facing message. */
  verify(access: ProviderAccess): Promise<void>;
  listTargets(access: ProviderAccess): Promise<PreviewTarget[]>;
  /** Parse a webhook body. Returns null for events Orbit ignores. Providers without webhooks omit it. */
  parseEvent?(body: unknown): PreviewHint | null;
  /**
   * For a non-preview deploy event: fetch the deployment named by the hint from the API and
   * return it only if it belongs to this target, succeeded and is not a PR environment.
   */
  verifyDeploy?(access: ProviderAccess, targetRef: string, hint: PreviewHint): Promise<VerifiedDeploy | null>;
  /** Ask the provider API for the preview of one commit. */
  resolve(input: ResolveInput): Promise<ResolveResult>;
}

export class PreviewProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PreviewProviderError";
  }
}
