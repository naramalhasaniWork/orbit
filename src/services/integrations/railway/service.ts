import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/vault";
import {
  validateToken,
  listProjects as apiListProjects,
  getProject as apiGetProject,
  getServiceInstance,
  getDomains,
  getDeployments as apiGetDeployments,
  getBuildLogs,
  getDeploymentLogs,
  getVariables as apiGetVariables,
  redeployService,
  RailwayApiError,
} from "./client";
import type {
  RailwayProject,
  RailwayService,
  RailwayEnvironment,
  RailwayDeployment,
  RailwayLogEntry,
} from "./client";

interface ServiceStatus {
  serviceId: string;
  serviceName: string;
  deployment: RailwayDeployment | null;
  domain: string | null;
  healthcheckPath: string | null;
  region: string | null;
}

interface RailwayConfig {
  railwayProjectId?: string;
  railwayProjectName?: string;
}

// -- Token management --

async function storeToken(workspaceId: string, token: string): Promise<void> {
  const { encrypted, iv } = encrypt(token);

  await prisma.integrationConfig.upsert({
    where: {
      integration_config_unique: {
        workspaceId,
        provider: "railway",
      },
    },
    create: {
      workspaceId,
      provider: "railway",
      isEnabled: true,
      credentials: { encryptedToken: encrypted, iv },
      config: {},
    },
    update: {
      isEnabled: true,
      credentials: { encryptedToken: encrypted, iv },
    },
  });
}

async function getToken(workspaceId: string): Promise<string | null> {
  const config = await prisma.integrationConfig.findUnique({
    where: {
      integration_config_unique: {
        workspaceId,
        provider: "railway",
      },
    },
    select: { credentials: true, isEnabled: true },
  });

  if (!config?.isEnabled) return null;

  const creds = config.credentials as {
    encryptedToken?: string;
    iv?: string;
  } | null;

  if (!creds?.encryptedToken || !creds?.iv) return null;

  try {
    return decrypt(creds.encryptedToken, creds.iv);
  } catch {
    console.warn("[railway] Failed to decrypt token");
    return null;
  }
}

async function getRailwayConfig(
  workspaceId: string
): Promise<RailwayConfig | null> {
  const config = await prisma.integrationConfig.findUnique({
    where: {
      integration_config_unique: {
        workspaceId,
        provider: "railway",
      },
    },
    select: { config: true, isEnabled: true },
  });

  if (!config?.isEnabled) return null;
  return (config.config as RailwayConfig) ?? null;
}

async function updateConfig(
  workspaceId: string,
  updates: Partial<RailwayConfig>
): Promise<void> {
  const existing = await getRailwayConfig(workspaceId);
  await prisma.integrationConfig.update({
    where: {
      integration_config_unique: {
        workspaceId,
        provider: "railway",
      },
    },
    data: {
      config: { ...existing, ...updates },
    },
  });
}

// -- Public API --

async function connect(
  workspaceId: string,
  token: string
): Promise<{ name: string; email: string }> {
  const user = await validateToken(token);
  await storeToken(workspaceId, token);
  return { name: user.name ?? user.email, email: user.email };
}

async function disconnect(workspaceId: string): Promise<void> {
  await prisma.integrationConfig.update({
    where: {
      integration_config_unique: {
        workspaceId,
        provider: "railway",
      },
    },
    data: {
      isEnabled: false,
      credentials: {},
      config: {},
    },
  });
}

async function listProjects(
  workspaceId: string
): Promise<RailwayProject[]> {
  const token = await getToken(workspaceId);
  if (!token) throw new RailwayApiError("Railway not connected");
  return apiListProjects(token);
}

async function getProjectDetails(
  workspaceId: string,
  projectId: string
): Promise<{
  project: RailwayProject;
  services: RailwayService[];
  environments: RailwayEnvironment[];
}> {
  const token = await getToken(workspaceId);
  if (!token) throw new RailwayApiError("Railway not connected");
  return apiGetProject(token, projectId);
}

async function getServiceStatus(
  workspaceId: string,
  serviceId: string,
  environmentId: string
): Promise<ServiceStatus> {
  const token = await getToken(workspaceId);
  if (!token) throw new RailwayApiError("Railway not connected");

  const config = await getRailwayConfig(workspaceId);
  const projectId = config?.railwayProjectId;

  const instance = await getServiceInstance(token, serviceId, environmentId);

  let domain: string | null = null;
  if (projectId) {
    const domains = await getDomains(
      token,
      projectId,
      environmentId,
      serviceId
    );
    domain =
      domains.customDomains[0]?.domain ??
      domains.serviceDomains[0]?.domain ??
      null;
  }

  return {
    serviceId,
    serviceName: instance?.serviceName ?? serviceId,
    deployment: instance?.latestDeployment ?? null,
    domain: domain ? `https://${domain}` : null,
    healthcheckPath: instance?.healthcheckPath ?? null,
    region: instance?.region ?? null,
  };
}

async function getServiceDomain(
  workspaceId: string,
  projectId: string,
  serviceId: string,
  environmentId: string
): Promise<string | null> {
  const token = await getToken(workspaceId);
  if (!token) return null;

  const domains = await getDomains(
    token,
    projectId,
    environmentId,
    serviceId
  );

  const domain =
    domains.customDomains[0]?.domain ??
    domains.serviceDomains[0]?.domain ??
    null;

  return domain ? `https://${domain}` : null;
}

async function triggerDeploy(
  workspaceId: string,
  serviceId: string,
  environmentId: string
): Promise<RailwayDeployment> {
  const token = await getToken(workspaceId);
  if (!token) throw new RailwayApiError("Railway not connected");
  return redeployService(token, serviceId, environmentId);
}

async function getDeployLogs(
  workspaceId: string,
  deploymentId: string
): Promise<{ build: RailwayLogEntry[]; runtime: RailwayLogEntry[] }> {
  const token = await getToken(workspaceId);
  if (!token) throw new RailwayApiError("Railway not connected");

  const [build, runtime] = await Promise.all([
    getBuildLogs(token, deploymentId),
    getDeploymentLogs(token, deploymentId),
  ]);

  return { build, runtime };
}

async function getDeployments(
  workspaceId: string,
  serviceId: string,
  environmentId: string,
  first = 10
): Promise<RailwayDeployment[]> {
  const token = await getToken(workspaceId);
  if (!token) throw new RailwayApiError("Railway not connected");
  return apiGetDeployments(token, serviceId, environmentId, first);
}

async function getEnvironmentVariables(
  workspaceId: string,
  projectId: string,
  environmentId: string,
  serviceId: string
): Promise<Record<string, string>> {
  const token = await getToken(workspaceId);
  if (!token) throw new RailwayApiError("Railway not connected");
  return apiGetVariables(token, projectId, environmentId, serviceId);
}

export {
  connect,
  disconnect,
  listProjects,
  getProjectDetails,
  getServiceStatus,
  getServiceDomain,
  triggerDeploy,
  getDeployLogs,
  getDeployments,
  getEnvironmentVariables,
  getToken,
  getRailwayConfig,
  updateConfig,
  storeToken,
};

export type { ServiceStatus, RailwayConfig };
