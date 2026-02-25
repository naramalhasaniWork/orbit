"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

/**
 * Syncs the JWT workspace with the `orbit_workspace` cookie.
 * Handles the case where a user signs in and the JWT defaults to their first
 * workspace, but the cookie remembers a different preferred workspace.
 */
export function useWorkspaceSync() {
  const { data: session, update } = useSession();
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current || !session) return;

    const cookieMatch = document.cookie
      .split("; ")
      .find((c) => c.startsWith("orbit_workspace="));
    const cookieWorkspaceId = cookieMatch?.split("=")[1];

    if (
      cookieWorkspaceId &&
      cookieWorkspaceId !== (session as { workspaceId?: string }).workspaceId
    ) {
      synced.current = true;
      // Trigger JWT update to match the cookie preference
      update({ workspaceId: cookieWorkspaceId }).then(() => {
        window.location.reload();
      });
    } else {
      synced.current = true;
    }
  }, [session, update]);
}
