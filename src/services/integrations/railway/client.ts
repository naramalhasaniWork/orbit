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

export { railwayGraphQL, getProject, RailwayApiError };

export type { RailwayProject, RailwayService, RailwayEnvironment, GraphQLResponse };
