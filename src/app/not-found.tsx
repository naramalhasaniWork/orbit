import Link from "next/link";
import { Orbit } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center surface-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orbit-accent/[0.04] via-transparent to-transparent" />
      <div className="relative text-center">
        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-foreground/[0.06] mx-auto mb-6">
          <Orbit className="h-6 w-6 text-foreground" />
        </div>
        <h1 className="text-5xl font-medium text-muted-foreground/20 mb-2 tabular-nums">404</h1>
        <p className="text-sm text-muted-foreground mb-6">
          This page drifted out of orbit
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-foreground hover:text-foreground transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
