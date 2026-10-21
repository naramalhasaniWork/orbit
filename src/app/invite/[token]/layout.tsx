import type { Metadata } from "next";

// Invite links are personal: never indexed.
export const metadata: Metadata = {
  title: "Workspace invitation · Orbit",
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
