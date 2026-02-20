"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-[hsl(245,40%,4%)] text-[hsl(220,20%,93%)]">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[hsl(0,72%,51%,0.1)] mx-auto mb-6">
              <AlertTriangle className="h-6 w-6 text-[hsl(0,72%,51%)]" />
            </div>
            <h1 className="text-5xl font-bold text-white/10 mb-2 tabular-nums">500</h1>
            <p className="text-sm text-white/50 mb-6">Something went wrong</p>
            <button
              onClick={() => reset()}
              className="text-sm text-[hsl(263,70%,66%)] hover:text-[hsl(263,70%,76%)] transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
