const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

interface GraphQLResponse<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

interface RailwayProject {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RailwayService {
  id: string;
  name: string;
  icon: string | null;
  projectId: string;
  createdAt: string;
}

interface RailwayEnvironment {
  id: string;
  name: string;
  isEphemeral: boolean;
}

interface RailwayDeployment {
  id: string;
  status: string;
  createdAt: string;
  url: string | null;
  staticUrl: string | null;
  canRedeploy: boolean;
  canRollback: boolean;
  meta: Record<string, unknown> | null;
}

interface RailwayServiceDomain {
  id: string;
  domain: string;
  suffix: string | null;
  targetPort: number | null;
}

interface RailwayCustomDomain {
  id: string;
  domain: string;
}

interface RailwayDomains {
  serviceDomains: RailwayServiceDomain[];
  customDomains: RailwayCustomDomain[];
}

interface RailwayLogEntry {
  timestamp: string;
  message: string;
  severity: string | null;
}

interface RailwayServiceInstance {
  id: string;
  serviceName: string;
  startCommand: string | null;
  healthcheckPath: string | null;
  region: string | null;
  numReplicas: number | null;
  latestDeployment: RailwayDeployment | null;
}

interface RailwayUser {
  id: string;
  name: string | null;
  email: string;
}

class RailwayApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public graphqlErrors?: Array<{ message: string }>
  ) {
    super(message);
    this.name = "RailwayApiError";
  }
}

async function railwayGraphQL<T = Record<string, unknown>>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const response = await fetch(RAILWAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new RailwayApiError(
      `Railway API error (${response.status}): ${text}`,
      response.status
    );
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors?.length) {
    throw new RailwayApiError(
      `Railway GraphQL error: ${result.errors[0].message}`,
      undefined,
      result.errors
    );
  }

  return result;
}

// -- Queries --

async function validateToken(token: string): Promise<RailwayUser> {
  const result = await railwayGraphQL<{ me: RailwayUser }>(
    token,
    `query { me { id name email } }`
  );

  if (!result.data?.me) {
    throw new RailwayApiError("Invalid Railway token");
  }

  return result.data.me;
}

async function listProjects(token: string): Promise<RailwayProject[]> {
  const result = await railwayGraphQL<{
    projects: { edges: Array<{ node: RailwayProject }> };
  }>(
    token,
    `query {
      projects {
        edges {
          node {
            id
            name
            description
            createdAt
            updatedAt
          }
        }
      }
    }`
  );

  return result.data?.projects?.edges?.map((e) => e.node) ?? [];
}

async function getProject(
  token: string,
  projectId: string
): Promise<{
  project: RailwayProject;
  services: RailwayService[];
  environments: RailwayEnvironment[];
}> {
  const result = await railwayGraphQL<{
    project: RailwayProject & {
      services: { edges: Array<{ node: RailwayService }> };
      environments: { edges: Array<{ node: RailwayEnvironment }> };
    };
  }>(
    token,
    `query project($id: String!) {
      project(id: $id) {
        id
        name
        description
        createdAt
        updatedAt
        services {
          edges {
            node { id name icon projectId createdAt }
          }
        }
        environments {
          edges {
            node { id name isEphemeral }
          }
        }
      }
    }`,
    { id: projectId }
  );

  if (!result.data?.project) {
    throw new RailwayApiError(`Project ${projectId} not found`);
  }

  const project = result.data.project;
  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    services: project.services?.edges?.map((e) => e.node) ?? [],
    environments: project.environments?.edges?.map((e) => e.node) ?? [],
  };
}

async function getServiceInstance(
  token: string,
  serviceId: string,
  environmentId: string
): Promise<RailwayServiceInstance | null> {
  const result = await railwayGraphQL<{
    serviceInstance: RailwayServiceInstance | null;
  }>(
    token,
    `query serviceInstance($serviceId: String!, $environmentId: String!) {
      serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
        id
        serviceName
        startCommand
        healthcheckPath
        region
        numReplicas
        latestDeployment {
          id status createdAt url staticUrl canRedeploy canRollback
        }
      }
    }`,
    { serviceId, environmentId }
  );

  return result.data?.serviceInstance ?? null;
}

async function getDomains(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId: string
): Promise<RailwayDomains> {
  const result = await railwayGraphQL<{ domains: RailwayDomains }>(
    token,
    `query domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        serviceDomains { id domain suffix targetPort }
        customDomains { id domain }
      }
    }`,
    { projectId, environmentId, serviceId }
  );

  return result.data?.domains ?? { serviceDomains: [], customDomains: [] };
}

async function getDeployments(
  token: string,
  serviceId: string,
  environmentId: string,
  first = 10
): Promise<RailwayDeployment[]> {
  const result = await railwayGraphQL<{
    deployments: { edges: Array<{ node: RailwayDeployment }> };
  }>(
    token,
    `query deployments($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges {
          node {
            id status createdAt url staticUrl canRedeploy canRollback meta
          }
        }
      }
    }`,
    {
      input: { serviceId, environmentId },
      first,
    }
  );

  return result.data?.deployments?.edges?.map((e) => e.node) ?? [];
}

async function getBuildLogs(
  token: string,
  deploymentId: string,
  limit = 200
): Promise<RailwayLogEntry[]> {
  const result = await railwayGraphQL<{
    buildLogs: RailwayLogEntry[];
  }>(
    token,
    `query buildLogs($deploymentId: String!, $limit: Int) {
      buildLogs(deploymentId: $deploymentId, limit: $limit) {
        timestamp message severity
      }
    }`,
    { deploymentId, limit }
  );

  return result.data?.buildLogs ?? [];
}

async function getDeploymentLogs(
  token: string,
  deploymentId: string,
  limit = 200
): Promise<RailwayLogEntry[]> {
  const result = await railwayGraphQL<{
    deploymentLogs: RailwayLogEntry[];
  }>(
    token,
    `query deploymentLogs($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        timestamp message severity
      }
    }`,
    { deploymentId, limit }
  );

  return result.data?.deploymentLogs ?? [];
}

async function getVariables(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId: string
): Promise<Record<string, string>> {
  const result = await railwayGraphQL<{
    variables: Record<string, string>;
  }>(
    token,
    `query variables($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId, environmentId, serviceId }
  );

  return result.data?.variables ?? {};
}

// -- Mutations --

async function redeployService(
  token: string,
  serviceId: string,
  environmentId: string
): Promise<RailwayDeployment> {
  const result = await railwayGraphQL<{
    serviceInstanceDeployV2: RailwayDeployment;
  }>(
    token,
    `mutation serviceInstanceDeployV2($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) {
        id status createdAt
      }
    }`,
    { serviceId, environmentId }
  );

  if (!result.data?.serviceInstanceDeployV2) {
    throw new RailwayApiError("Failed to trigger deployment");
  }

  return result.data.serviceInstanceDeployV2;
}

async function restartDeployment(
  token: string,
  deploymentId: string
): Promise<boolean> {
  const result = await railwayGraphQL<{ deploymentRestart: boolean }>(
    token,
    `mutation deploymentRestart($id: String!) {
      deploymentRestart(id: $id)
    }`,
    { id: deploymentId }
  );

  return result.data?.deploymentRestart ?? false;
}

export {
  railwayGraphQL,
  validateToken,
  listProjects,
  getProject,
  getServiceInstance,
  getDomains,
  getDeployments,
  getBuildLogs,
  getDeploymentLogs,
  getVariables,
  redeployService,
  restartDeployment,
  RailwayApiError,
};

export type {
  RailwayProject,
  RailwayService,
  RailwayEnvironment,
  RailwayDeployment,
  RailwayServiceDomain,
  RailwayCustomDomain,
  RailwayDomains,
  RailwayLogEntry,
  RailwayServiceInstance,
  RailwayUser,
  GraphQLResponse,
};
