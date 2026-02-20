import { prisma } from "@/lib/db";
import type { EnvironmentType } from "@/generated/prisma/client";
import {
  getProjectDetails,
  getServiceDomain,
  getRailwayConfig,
} from "./service";

interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  environments: Array<{
    name: string;
    url: string;
    type: EnvironmentType;
    action: "created" | "updated" | "skipped";
  }>;
}

const RAILWAY_ENV_TYPE_MAP: Record<string, EnvironmentType> = {
  production: "production",
  staging: "staging",
  preview: "preview",
};

function mapEnvironmentType(envName: string): EnvironmentType {
  const lower = envName.toLowerCase();
  for (const [key, value] of Object.entries(RAILWAY_ENV_TYPE_MAP)) {
    if (lower.includes(key)) return value;
  }
  return "staging";
}

/**
 * Sync Railway environments/services to Orbit environments.
 * Creates or updates Orbit environments with Railway service URLs.
 * Idempotent: running multiple times won't create duplicates.
 */
async function syncEnvironments(
  workspaceId: string,
  orbitProjectId: string
): Promise<SyncResult> {
  const config = await getRailwayConfig(workspaceId);
  const railwayProjectId = config?.railwayProjectId;

  if (!railwayProjectId) {
    throw new Error("No Railway project connected. Select a project first.");
  }

  const { services, environments } = await getProjectDetails(
    workspaceId,
    railwayProjectId
  );

  const nonEphemeral = environments.filter((e) => !e.isEphemeral);

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    environments: [],
  };

  for (const railwayEnv of nonEphemeral) {
    for (const service of services) {
      const domain = await getServiceDomain(
        workspaceId,
        railwayProjectId,
        service.id,
        railwayEnv.id
      );

      if (!domain) {
        result.skipped++;
        result.environments.push({
          name: `${service.name} (${railwayEnv.name})`,
          url: "",
          type: mapEnvironmentType(railwayEnv.name),
          action: "skipped",
        });
        continue;
      }

      const envName = services.length > 1
        ? `${service.name} - ${railwayEnv.name}`
        : railwayEnv.name;

      const sourceId = `${service.id}:${railwayEnv.id}`;
      const envType = mapEnvironmentType(railwayEnv.name);

      // Check if this environment already exists (by source)
      const existing = await prisma.environment.findFirst({
        where: {
          projectId: orbitProjectId,
          source: "railway",
          sourceId,
        },
      });

      if (existing) {
        if (existing.url !== domain || existing.name !== envName) {
          await prisma.environment.update({
            where: { id: existing.id },
            data: { url: domain, name: envName, type: envType },
          });
          result.updated++;
          result.environments.push({
            name: envName,
            url: domain,
            type: envType,
            action: "updated",
          });
        } else {
          result.skipped++;
          result.environments.push({
            name: envName,
            url: domain,
            type: envType,
            action: "skipped",
          });
        }
      } else {
        await prisma.environment.create({
          data: {
            projectId: orbitProjectId,
            name: envName,
            type: envType,
            url: domain,
            source: "railway",
            sourceId,
          },
        });
        result.created++;
        result.environments.push({
          name: envName,
          url: domain,
          type: envType,
          action: "created",
        });
      }
    }
  }

  return result;
}

/**
 * Update the URL for a single Railway-sourced environment.
 * Called when a deployment webhook reports a new domain.
 */
async function updateEnvironmentUrl(
  serviceId: string,
  environmentId: string,
  newUrl: string
): Promise<boolean> {
  const sourceId = `${serviceId}:${environmentId}`;

  const env = await prisma.environment.findFirst({
    where: { source: "railway", sourceId },
  });

  if (!env) return false;

  if (env.url !== newUrl) {
    await prisma.environment.update({
      where: { id: env.id },
      data: { url: newUrl },
    });
  }

  return true;
}

export { syncEnvironments, updateEnvironmentUrl };
export type { SyncResult };
