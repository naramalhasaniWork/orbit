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

/** UNVERIFIED: webhook event types that mean the deployment or environment was removed. */
export const RAILWAY_REMOVED_EVENTS = new Set(["Deployment.removed", "Deployment.deleted", "Environment.deleted"]);

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
