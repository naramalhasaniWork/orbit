import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { connectionAccess, webhookTokenMatches } from "./connections";
import { getPreviewProvider } from "./registry";
import { handleProviderSignal } from "./coordinator";
import { launchDeploySmokeRuns } from "./deploy-smoke";
import { PREVIEW_PROVIDER_IDS, type VerifiedDeploy } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Provider deployment webhooks (Railway today). Railway webhooks are unsigned, so each
 * connection has its own token, sent in an X-Orbit-Token header the user configures on the
 * Railway webhook, compared in constant time against the stored hash. Fails closed: an
 * unknown connection, a connection without a token, or a wrong token are all 401.
 * The body is only a hint; the coordinator re-reads the deployment from the provider API.
 */
export async function handlePreviewWebhook(req: NextRequest, providerId: string, connectionId: string | null) {
  const provider = getPreviewProvider(providerId);
  if (!provider?.parseEvent) {
    return NextResponse.json({ error: "Unknown preview provider" }, { status: 404 });
  }

  const connection =
    connectionId && UUID_RE.test(connectionId)
      ? await prisma.previewConnection.findFirst({
          where: { id: connectionId, provider: provider.id },
          select: {
            id: true, webhookTokenHash: true, credentials: true, config: true,
            bindings: { select: { projectId: true, targetRef: true } },
          },
        })
      : null;
  if (!connection || !webhookTokenMatches(req.headers.get("x-orbit-token"), connection.webhookTokenHash)) {
    return NextResponse.json({ error: "Invalid or missing X-Orbit-Token" }, { status: 401 });
  }

  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hint = provider.parseEvent(payload);
  if (!hint) return NextResponse.json({ status: "ignored" });

  if (!hint.isPreview) {
    // Smoke runs only for a deployment the Railway API confirms: right project/service,
    // succeeded, not a PR environment. Branch and commit come from the API, not the body.
    const access = connectionAccess(connection);
    const verified: Array<VerifiedDeploy & { projectId: string }> = [];
    if (access && provider.verifyDeploy) {
      for (const binding of connection.bindings) {
        const deploy = await provider.verifyDeploy(access, binding.targetRef, hint);
        if (deploy) verified.push({ projectId: binding.projectId, ...deploy });
      }
    }
    const runs = provider.id === PREVIEW_PROVIDER_IDS.railway ? await launchDeploySmokeRuns("railway", verified) : [];
    return NextResponse.json({ status: "deploy_processed", event: hint.event, runs });
  }

  const { advanced } = await handleProviderSignal(connection.id, hint);
  return NextResponse.json({ status: "preview_processed", event: hint.event, advanced });
}
