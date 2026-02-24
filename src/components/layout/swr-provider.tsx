"use client";

import { SWRConfig } from "swr";

interface SWRProviderProps {
  fallback: Record<string, unknown>;
  children: React.ReactNode;
}

export function SWRProvider({ fallback, children }: SWRProviderProps) {
  return (
    <SWRConfig value={{ fallback }}>
      {children}
    </SWRConfig>
  );
}
