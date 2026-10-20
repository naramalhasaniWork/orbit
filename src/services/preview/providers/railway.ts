import { RailwayApiError } from "@/services/integrations/railway/client";
import {
  PREVIEW_PROVIDER_IDS,
  PreviewProviderError,
  type PreviewHint,
  type PreviewProvider,
  type ResolveInput,
  type ResolveResult,
} from "../types";
import {
  RAILWAY_DEPLOYMENT_STATUS,
  RAILWAY_REMOVED_EVENTS,
  environmentDomain,
  listDeployments,
  listEphemeralEnvironments,
  listProjectsWithServices,
  type RailwayDeploymentNode,
} from "./railway-api";

/** Binding targetRef for Railway: "<railwayProjectId>/<serviceId>". */
export function parseRailwayTarget(targetRef: string): { projectId: string; serviceId: string } | null {
  const [projectId, serviceId, extra] = targetRef.split("/");
  if (!projectId || !serviceId || extra !== undefined) return null;
  return { projectId, serviceId };
}

interface RailwayWebhookBody {
  type?: unknown;
  details?: { id?: unknown; status?: unknown; branch?: unknown; commitHash?: unknown };
  resource?: {
    project?: { id?: unknown };
    environment?: { id?: unknown; isEphemeral?: unknown };
    service?: { id?: unknown };
    deployment?: { id?: unknown };
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseRailwayEvent(body: unknown): PreviewHint | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as RailwayWebhookBody;
  const event = str(payload.type);
  if (!event || !(event.startsWith("Deployment.") || RAILWAY_REMOVED_EVENTS.has(event))) return null;

  const resource = payload.resource ?? {};
  const projectId = str(resource.project?.id);
  const environmentId = str(resource.environment?.id);
  if (!projectId || !environmentId) return null;

  const refs: Record<string, string> = { projectId, environmentId };
  const serviceId = str(resource.service?.id);
  if (serviceId) refs.serviceId = serviceId;

  return {
    event,
    externalId: str(resource.deployment?.id) ?? str(payload.details?.id),
    commitSha: str(payload.details?.commitHash)?.toLowerCase() ?? null,
    branch: str(payload.details?.branch),
    isPreview: resource.environment?.isEphemeral === true,
    removed: RAILWAY_REMOVED_EVENTS.has(event),
    succeeded: RAILWAY_DEPLOYMENT_STATUS.ready.has(str(payload.details?.status)?.toUpperCase() ?? ""),
    refs,
  };
}

function classify(deployment: RailwayDeploymentNode): "ready" | "failed" | "gone" | "pending" {
  if (RAILWAY_DEPLOYMENT_STATUS.ready.has(deployment.status)) return "ready";
  if (RAILWAY_DEPLOYMENT_STATUS.failed.has(deployment.status)) return "failed";
  if (RAILWAY_DEPLOYMENT_STATUS.gone.has(deployment.status)) return "gone";
  return "pending";
}

async function resolveRailway({ access, targetRef, commitSha, hint }: ResolveInput): Promise<ResolveResult> {
  const target = parseRailwayTarget(targetRef);
  if (!target) return { state: "failed", externalId: null, reason: `Invalid Railway target "${targetRef}"` };

  const sha = commitSha.toLowerCase();
  // A hint narrows the search to one environment; otherwise scan every PR environment.
  const environmentIds =
    hint?.refs.environmentId && hint.isPreview
      ? [hint.refs.environmentId]
      : await listEphemeralEnvironments(access.token, target.projectId);

  for (const environmentId of environmentIds) {
    const deployments = await listDeployments(access.token, target.serviceId, environmentId);
    const match = deployments.find((d) => d.commitHash?.toLowerCase() === sha);
    if (!match) continue;

    const state = classify(match);
    if (state === "pending") return { state: "pending" };
    if (state === "gone") return { state: "gone", externalId: match.id };
    if (state === "failed") {
      return { state: "failed", externalId: match.id, reason: `Railway deployment ${match.status.toLowerCase()}` };
    }

    const url = await environmentDomain(access.token, target.projectId, environmentId, target.serviceId);
    if (!url) {
      return {
        state: "failed",
        externalId: match.id,
        reason:
          "The PR environment has no domain. Railway only gives PR environments a domain when the base environment's service uses a Railway-provided domain.",
      };
    }
    return { state: "ready", url, externalId: match.id };
  }

  if (hint?.removed) return { state: "gone", externalId: hint.externalId };
  return { state: "pending" };
}

export function wrapRailwayError(err: unknown): never {
  if (err instanceof RailwayApiError) {
    const unauthorized = err.statusCode === 401 || err.statusCode === 403 || /not authorized/i.test(err.message);
    throw new PreviewProviderError(
      unauthorized ? "Railway rejected the token. Use a workspace token from Railway account settings." : err.message,
      err.statusCode
    );
  }
  throw err;
}

export const railwayProvider: PreviewProvider = {
  id: PREVIEW_PROVIDER_IDS.railway,

  async verify(access) {
    await listProjectsWithServices(access.token).catch(wrapRailwayError);
  },

  async listTargets(access) {
    const projects = await listProjectsWithServices(access.token).catch(wrapRailwayError);
    return projects.flatMap((project) =>
      project.services.map((service) => ({
        ref: `${project.id}/${service.id}`,
        label: `${project.name} / ${service.name}`,
      }))
    );
  },

  parseEvent: parseRailwayEvent,

  matchesTarget(targetRef, hint) {
    const target = parseRailwayTarget(targetRef);
    if (!target || target.projectId !== hint.refs.projectId) return false;
    return !hint.refs.serviceId || hint.refs.serviceId === target.serviceId;
  },

  resolve: (input) => resolveRailway(input).catch(wrapRailwayError),
};
