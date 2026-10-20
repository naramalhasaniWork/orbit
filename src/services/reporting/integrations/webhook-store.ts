import { prisma } from "@/lib/db";
import { openSecret, type SealedSecret } from "@/lib/integrations/secret-field";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Outbound webhook endpoints live in `project.settings.webhooks`. This module
 * owns that shape so the settings routes, the dispatcher and the retry route
 * agree on it.
 */
export interface StoredWebhook {
  id?: string;
  url: string;
  events: string[];
  enabled?: boolean;
  /** Legacy plaintext secret. New endpoints store `secretSealed` instead. */
  secret?: string;
  secretSealed?: SealedSecret;
}

export function readStoredWebhooks(settings: unknown): StoredWebhook[] {
  const webhooks = (settings as Record<string, unknown> | null)?.webhooks;
  return Array.isArray(webhooks) ? (webhooks as StoredWebhook[]) : [];
}

export function resolveWebhookSecret(webhook: StoredWebhook): string | null {
  return openSecret(webhook.secretSealed ?? webhook.secret);
}

/** Read-modify-write of the project's webhook list. Returns null when the project is missing. */
export async function updateProjectWebhooks(
  projectId: string,
  mutate: (webhooks: StoredWebhook[]) => StoredWebhook[]
): Promise<StoredWebhook[] | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { settings: true },
  });
  if (!project) return null;

  const settings = (project.settings ?? {}) as Record<string, unknown>;
  const webhooks = mutate(readStoredWebhooks(settings));

  await prisma.project.update({
    where: { id: projectId },
    data: { settings: { ...settings, webhooks } as unknown as Prisma.InputJsonValue },
  });
  return webhooks;
}
