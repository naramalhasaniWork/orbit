"use client";

import { SWRConfig } from "swr";
import { useWorkspaceSync } from "@/hooks/use-workspace-sync";

interface SWRProviderProps {
  fallback: Record<string, unknown>;
  children: React.ReactNode;
}

export function SWRProvider({ fallback, children }: SWRProviderProps) {
  // Sync JWT workspace with cookie preference on mount
  useWorkspaceSync();

  return (
    <SWRConfig value={{ fallback }}>
      {children}
    </SWRConfig>
  );
}
