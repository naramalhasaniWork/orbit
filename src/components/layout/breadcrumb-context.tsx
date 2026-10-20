"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface BreadcrumbValue {
  label: string | null;
  setLabel: (label: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbValue>({ label: null, setLabel: () => {} });

/** Lets a page replace the generic header breadcrumb ("Run Detail") with its own label. */
export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const value = useMemo(() => ({ label, setLabel }), [label]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbValue(): string | null {
  return useContext(BreadcrumbContext).label;
}

export function useBreadcrumbLabel(label: string | null) {
  const { setLabel } = useContext(BreadcrumbContext);
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
}
