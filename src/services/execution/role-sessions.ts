import type { StorageState } from "@/services/execution/browser-manager";

/**
 * Logged-in browser sessions for a run, one per required role. A session
 * captured while logged in as one role must never be reused for another
 * (an admin test would silently run as a member).
 */
export interface RoleSessions {
  get(role?: string | null): StorageState | undefined;
  /** Keep the first session captured for the role (later ones are equivalent). */
  remember(role: string | null | undefined, state: StorageState): void;
  replace(role: string | null | undefined, state: StorageState | undefined): void;
}

const DEFAULT_ROLE = "__default__";

function roleKey(role?: string | null): string {
  return role?.trim().toUpperCase() || DEFAULT_ROLE;
}

export function createRoleSessions(): RoleSessions {
  const sessions = new Map<string, StorageState>();
  return {
    get: (role) => sessions.get(roleKey(role)),
    remember: (role, state) => {
      const key = roleKey(role);
      if (!sessions.has(key)) sessions.set(key, state);
    },
    replace: (role, state) => {
      const key = roleKey(role);
      if (state) sessions.set(key, state);
      else sessions.delete(key);
    },
  };
}
