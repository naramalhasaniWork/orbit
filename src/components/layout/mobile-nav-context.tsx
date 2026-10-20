"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface MobileNavValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavValue>({ open: false, setOpen: () => {} });

/** Open state of the off-canvas sidebar drawer (below md). */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavValue {
  return useContext(MobileNavContext);
}
