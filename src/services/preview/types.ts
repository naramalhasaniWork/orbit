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

/** What a provider webhook told us, after parsing. Never trusted for the URL. */
export interface PreviewHint {
  /** Provider event name, e.g. "Deployment.succeeded" */
  event: string;
  externalId: string | null;
  commitSha: string | null;
  branch: string | null;
  /** True for a PR/preview environment, false for a long-lived one (production, staging) */
  isPreview: boolean;
  /** The event reports the deployment or its environment was removed */
  removed: boolean;
  /** The event reports a successful deployment (still re-checked via the API for previews) */
  succeeded: boolean;
  /** Provider-specific ids used to match bindings and to resolve, e.g. Railway environment id */
  refs: Record<string, string>;
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
  /** True when a hint concerns this binding's target. */
  matchesTarget?(targetRef: string, hint: PreviewHint): boolean;
  /** Ask the provider API for the preview of one commit. */
  resolve(input: ResolveInput): Promise<ResolveResult>;
}

export class PreviewProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PreviewProviderError";
  }
}
