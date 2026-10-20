"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { clearWorkspaceCookie, readWorkspaceCookie } from "@/lib/workspace-cookie";

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

    const cookieWorkspaceId = readWorkspaceCookie();
    const sessionWorkspaceId = (session as { workspaceId?: string }).workspaceId;
    synced.current = true;

    if (cookieWorkspaceId && cookieWorkspaceId !== sessionWorkspaceId) {
      // Trigger JWT update to match the cookie preference
      update({ workspaceId: cookieWorkspaceId }).then((updated) => {
        if ((updated as { workspaceId?: string } | null)?.workspaceId === cookieWorkspaceId) {
          window.location.reload();
        } else {
          // Not a member (anymore), e.g. the workspace was deleted: drop the stale preference
          clearWorkspaceCookie();
        }
      });
    }
  }, [session, update]);
}
