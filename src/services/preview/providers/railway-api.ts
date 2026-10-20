/**
 * Railway facts Orbit relies on that are NOT yet verified against a live account (spec step R0).
 * Every one is isolated here so capturing real payloads only means editing this file.
 *
 * Verified (docs.railway.com/guides/webhooks): webhook bodies look like
 *   { type: "Deployment.<x>", details: { id, status, branch, commitHash, ... },
 *     resource: { workspace, project, environment: { isEphemeral }, service, deployment }, timestamp }
 * carry no URL, are unsigned, best-effort and unordered (3 retries, 30s timeout).
 */
import { railwayGraphQL } from "@/services/integrations/railway/client";

/**
 * UNVERIFIED: deployment status values returned by the GraphQL API (and echoed in
 * webhook details.status). Anything not listed counts as still building.
 */
export const RAILWAY_DEPLOYMENT_STATUS = {
  ready: new Set(["SUCCESS"]),
  failed: new Set(["FAILED", "CRASHED"]),
  gone: new Set(["REMOVED", "REMOVING"]),
} as const;

/**
 * UNVERIFIED: webhook event types (besides Deployment.*) worth a look. They only trigger a
 * re-check; whether anything is gone is decided by deployment status from the API.
 */
export const RAILWAY_EXTRA_EVENTS = new Set(["Environment.deleted"]);

/**
 * UNVERIFIED: `projects` with a workspace token. Railway documents that workspace tokens
 * cannot run `me`, so token checks list projects instead.
 */
const LIST_PROJECTS_QUERY = `query { projects { edges { node { id name services { edges { node { id name } } } } } } }`;

/** UNVERIFIED: `deployments(input: {serviceId, environmentId})` returns `meta.commitHash`. */
const DEPLOYMENTS_QUERY = `query deployments($input: DeploymentListInput!, $first: Int) {
  deployments(input: $input, first: $first) { edges { node { id status createdAt meta } } }
}`;

/** UNVERIFIED: `domains(projectId, environmentId, serviceId)` lists a PR environment's domains. */
const DOMAINS_QUERY = `query domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
  domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
    serviceDomains { domain }
    customDomains { domain }
  }
}`;

/** UNVERIFIED: `deployment(id)` exposes projectId, serviceId, environmentId and meta.{branch,commitHash}. */
const DEPLOYMENT_QUERY = `query deployment($id: String!) {
  deployment(id: $id) { id status projectId serviceId environmentId meta }
}`;

const ENVIRONMENTS_QUERY = `query project($id: String!) {
  project(id: $id) { environments { edges { node { id name isEphemeral } } } }
}`;

export interface RailwayProjectWithServices {
  id: string;
  name: string;
  services: Array<{ id: string; name: string }>;
}

export interface RailwayDeploymentNode {
  id: string;
  status: string;
  createdAt: string;
  commitHash: string | null;
}

interface Edges<T> {
  edges: Array<{ node: T }>;
}

export async function listProjectsWithServices(token: string): Promise<RailwayProjectWithServices[]> {
  const result = await railwayGraphQL<{
    projects: Edges<{ id: string; name: string; services: Edges<{ id: string; name: string }> }>;
  }>(token, LIST_PROJECTS_QUERY);
  return (result.data?.projects.edges ?? []).map(({ node }) => ({
    id: node.id,
    name: node.name,
    services: node.services.edges.map((e) => e.node),
  }));
}

export async function listEphemeralEnvironments(token: string, projectId: string): Promise<string[]> {
  const result = await railwayGraphQL<{
    project: { environments: Edges<{ id: string; name: string; isEphemeral: boolean }> } | null;
  }>(token, ENVIRONMENTS_QUERY, { id: projectId });
  return (result.data?.project?.environments.edges ?? [])
    .filter((e) => e.node.isEphemeral)
    .map((e) => e.node.id);
}

export async function listDeployments(
  token: string,
  serviceId: string,
  environmentId: string
): Promise<RailwayDeploymentNode[]> {
  const result = await railwayGraphQL<{
    deployments: Edges<{ id: string; status: string; createdAt: string; meta: Record<string, unknown> | null }>;
  }>(token, DEPLOYMENTS_QUERY, { input: { serviceId, environmentId }, first: 10 });
  return (result.data?.deployments.edges ?? []).map(({ node }) => ({
    id: node.id,
    status: node.status,
    createdAt: node.createdAt,
    commitHash: typeof node.meta?.commitHash === "string" ? node.meta.commitHash : null,
  }));
}

/** The first Railway-provided domain, else the first custom domain, as an https origin. */
export async function environmentDomain(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId: string
): Promise<string | null> {
  const result = await railwayGraphQL<{
    domains: { serviceDomains: Array<{ domain: string }>; customDomains: Array<{ domain: string }> } | null;
  }>(token, DOMAINS_QUERY, { projectId, environmentId, serviceId });
  const domains = result.data?.domains;
  const domain = domains?.serviceDomains[0]?.domain ?? domains?.customDomains[0]?.domain ?? null;
  return domain ? `https://${domain}` : null;
}

export interface RailwayDeploymentDetail {
  id: string;
  status: string;
  projectId: string;
  serviceId: string;
  environmentId: string;
  branch: string | null;
  commitHash: string | null;
}

export async function getDeployment(token: string, id: string): Promise<RailwayDeploymentDetail | null> {
  const result = await railwayGraphQL<{
    deployment: {
      id: string; status: string; projectId: string; serviceId: string; environmentId: string;
      meta: Record<string, unknown> | null;
    } | null;
  }>(token, DEPLOYMENT_QUERY, { id });
  const d = result.data?.deployment;
  if (!d) return null;
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id: d.id, status: d.status, projectId: d.projectId, serviceId: d.serviceId, environmentId: d.environmentId,
    branch: text(d.meta?.branch), commitHash: text(d.meta?.commitHash)?.toLowerCase() ?? null,
  };
}
