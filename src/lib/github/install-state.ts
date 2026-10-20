/**
 * Signed, expiring `state` for the GitHub App install flow. It binds the install to the
 * workspace and user that started it, so a callback URL cannot be replayed or forged
 * to attach an installation to someone else's workspace.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

interface InstallStatePayload {
  workspaceId: string;
  userId: string;
  exp: number;
  nonce: string;
}

function sign(body: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`github-install:${body}`).digest("base64url");
}

export function createInstallState(workspaceId: string, userId: string, now = Date.now()): string {
  const payload: InstallStatePayload = {
    workspaceId,
    userId,
    exp: now + STATE_TTL_MS,
    nonce: randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the payload if the signature is valid and the state has not expired, else null. */
export function verifyInstallState(
  state: string | null | undefined,
  now = Date.now()
): Pick<InstallStatePayload, "workspaceId" | "userId"> | null {
  if (!state) return null;
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InstallStatePayload;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (!payload.workspaceId || !payload.userId) return null;
    return { workspaceId: payload.workspaceId, userId: payload.userId };
  } catch {
    return null;
  }
}
