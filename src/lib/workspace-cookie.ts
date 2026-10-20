/** Client-side helpers for the `orbit_workspace` preference cookie. */
const COOKIE_NAME = "orbit_workspace";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function setWorkspaceCookie(workspaceId: string): void {
  document.cookie = `${COOKIE_NAME}=${workspaceId};path=/;max-age=${MAX_AGE_SECONDS}`;
}

export function clearWorkspaceCookie(): void {
  document.cookie = `${COOKIE_NAME}=;path=/;max-age=0`;
}

export function readWorkspaceCookie(): string | undefined {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return match?.split("=")[1] || undefined;
}
