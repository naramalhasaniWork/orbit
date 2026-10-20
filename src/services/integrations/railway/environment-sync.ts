import { prisma } from "@/lib/db";
import type { EnvironmentType } from "@/generated/prisma/client";
import { getProject } from "./client";
import { environmentDomain } from "@/services/preview/providers/railway-api";

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
 * Import a bound Railway service's long-lived environments (production, staging, ...) as Orbit
 * environments. PR environments are skipped: the preview coordinator handles those per PR.
 * Idempotent: running multiple times won't create duplicates.
 */
async function syncEnvironments(
  token: string,
  target: { projectId: string; serviceId: string },
  orbitProjectId: string
): Promise<SyncResult> {
  const railwayProjectId = target.projectId;
  const { services: allServices, environments } = await getProject(token, railwayProjectId);
  const services = allServices.filter((s) => s.id === target.serviceId);

  const nonEphemeral = environments.filter((e) => !e.isEphemeral);

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    environments: [],
  };

  for (const railwayEnv of nonEphemeral) {
    for (const service of services) {
      const domain = await environmentDomain(token, railwayProjectId, railwayEnv.id, service.id);

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

export { syncEnvironments };
export type { SyncResult };
