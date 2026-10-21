import Link from "next/link";
import { ClosingO } from "@/components/telemetry/closing-o";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <ClosingO size={40} />
        <p className="tm-label text-tm-t3">Error 404</p>
        <h1 className="text-balance text-[26px] font-medium leading-tight tracking-display">This page isn&apos;t on the map.</h1>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex h-9 items-center rounded-md border border-tm-line-strong px-4 text-[13px] font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
