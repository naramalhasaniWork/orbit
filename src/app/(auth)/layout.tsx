import type { Metadata } from "next";

// Sign-in is reachable but not a search result.
export const metadata: Metadata = {
  title: "Sign in · Orbit",
  robots: { index: false, follow: true },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
