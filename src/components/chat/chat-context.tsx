"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface ChatOpenValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ChatOpenContext = createContext<ChatOpenValue>({ open: false, setOpen: () => {} });

/** Whether the agent chat sheet is open; the topbar button and the sheet share it. */
export function ChatOpenProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <ChatOpenContext.Provider value={value}>{children}</ChatOpenContext.Provider>;
}

export function useChatOpen(): ChatOpenValue {
  return useContext(ChatOpenContext);
}
