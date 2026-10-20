"use client";

import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <main className="flex min-h-dvh items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="tm-label text-tm-fail">
              <span aria-hidden="true">✕ </span>Error 500
            </p>
            <h1 className="text-2xl font-medium tracking-display text-balance">Something went wrong.</h1>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-2 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
