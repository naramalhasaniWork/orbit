"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when the user's GitHub token is missing or expired. Replaces the empty list. */
export function GitHubReconnect() {
  const [redirecting, setRedirecting] = useState(false);

  return (
    <div
      role="alert"
      className="w-full mb-4 flex flex-col items-center gap-3 rounded-lg border border-orbit-flaky/30 bg-orbit-flaky/[0.06] px-4 py-6 text-center"
    >
      <GitBranch className="h-5 w-5 text-orbit-flaky" />
      <div>
        <p className="text-sm font-medium text-foreground">GitHub isn&apos;t connected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Orbit has no GitHub access for your account, so it can&apos;t list your repositories.
          Reconnect to continue, or paste a public repository link below.
        </p>
      </div>
      <Button
        size="sm"
        className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
        disabled={redirecting}
        onClick={() => {
          setRedirecting(true);
          signIn("github", { callbackUrl: window.location.href });
        }}
      >
        {redirecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
        Reconnect GitHub
      </Button>
    </div>
  );
}
