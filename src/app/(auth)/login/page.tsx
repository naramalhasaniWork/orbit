"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Orbit } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center surface-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orbit-accent/[0.06] via-transparent to-transparent" />

      <div className="relative flex flex-col items-center gap-8 max-w-sm w-full px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-orbit-accent/10">
            <Orbit className="h-7 w-7 text-orbit-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Orbit
          </h1>
          <p className="text-[13px] text-muted-foreground text-center leading-relaxed max-w-[280px]">
            AI-native testing that understands your codebase. Connect your repo,
            get a complete test suite in minutes.
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <Button
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            size="lg"
            className="w-full bg-white text-black hover:bg-white/90 gap-2 h-11 text-sm font-medium"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </Button>

          <p className="text-[11px] text-muted-foreground/70 text-center mt-2 leading-relaxed">
            Orbit needs read access to your repository. We never store your
            source code — only the structural index.
          </p>
        </div>
      </div>
    </div>
  );
}
