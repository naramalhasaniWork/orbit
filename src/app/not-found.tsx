import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-muted-foreground/30 mb-4">404</h1>
        <p className="text-muted-foreground mb-6">Page not found</p>
        <Link
          href="/dashboard"
          className="text-sm text-orbit-accent hover:underline"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
