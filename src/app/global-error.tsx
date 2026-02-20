"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-neutral-700 mb-4">500</h1>
            <p className="text-neutral-400 mb-6">Something went wrong</p>
            <button
              onClick={() => reset()}
              className="text-sm text-blue-400 hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
