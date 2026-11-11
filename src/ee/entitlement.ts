/**
 * Who gets Orbit Enterprise features. Licensed under src/ee/LICENSE, not the root LICENSE.
 *
 * Hosted Orbit: by workspace plan. Self-hosted: by license key (ORBIT_EE_LICENSE_KEY), never by plan.
 * Local development (NODE_ENV=development) always has them.
 */

import { prisma } from "@/lib/db";
import type { WorkspaceTier } from "@/lib/auth/tier-limits";
import { isSelfHosted } from "@/lib/self-host";
import { hasEeLicense, type Env } from "./license-key";

/** Hosted plans that include each feature. Team is the `professional` tier. */
export const EE_FEATURE_TIERS = {
  audit_export: ["professional", "enterprise"],
} as const satisfies Record<string, readonly WorkspaceTier[]>;

export type EeFeature = keyof typeof EE_FEATURE_TIERS;

/** A workspace by id or by its known tier, or "instance" for operator-level features (admin views) with no workspace. */
export type EeSubject = { workspaceId: string } | { tier: WorkspaceTier } | "instance";

/** Pure check for a known tier (null: no workspace, operator level). */
export function tierHasEeFeature(tier: WorkspaceTier | null, feature: EeFeature, env: Env = process.env): boolean {
  if (env.NODE_ENV === "development") return true;
  if (isSelfHosted(env)) return hasEeLicense(env);
  if (tier === null) return true;
  return (EE_FEATURE_TIERS[feature] as readonly WorkspaceTier[]).includes(tier);
}

export async function hasEeFeature(subject: EeSubject, feature: EeFeature, env: Env = process.env): Promise<boolean> {
  if (subject === "instance") return tierHasEeFeature(null, feature, env);
  if ("tier" in subject) return tierHasEeFeature(subject.tier, feature, env);
  if (env.NODE_ENV === "development" || isSelfHosted(env)) return tierHasEeFeature(null, feature, env);
  const workspace = await prisma.workspace.findUnique({ where: { id: subject.workspaceId }, select: { tier: true } });
  return workspace ? tierHasEeFeature(workspace.tier, feature, env) : false;
}
