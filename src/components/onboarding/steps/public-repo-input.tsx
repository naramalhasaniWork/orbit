"use client";

import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseGitHubRepoUrl } from "@/lib/github/public-repo";
import type { RepoItem } from "../onboarding-types";

interface PublicRepoInputProps {
  onResolved: (repo: RepoItem) => void;
}

/** Look up a public GitHub repo from its link. Works without a GitHub connection. */
export function PublicRepoInput({ onResolved }: PublicRepoInputProps) {
  const [value, setValue] = useState("");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookUp() {
    setError(null);
    if (!parseGitHubRepoUrl(value)) {
      setError("Enter a GitHub repository link like https://github.com/owner/repo.");
      return;
    }
    setLooking(true);
    try {
      const res = await fetch(`/api/github/public-repo?url=${encodeURIComponent(value.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Couldn't look up that repository.");
        return;
      }
      onResolved(json.data as RepoItem);
      setValue("");
    } catch {
      setError("Couldn't reach Orbit. Check your connection and try again.");
    } finally {
      setLooking(false);
    }
  }

  return (
    <form
      className="w-full mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        lookUp();
      }}
    >
      <label htmlFor="public-repo-url" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <Globe className="h-3 w-3" />
        Or paste a public repository link
      </label>
      <div className="flex gap-2">
        <Input
          id="public-repo-url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://github.com/owner/repo"
          inputMode="url"
          autoComplete="off"
          className="bg-background"
          aria-invalid={!!error}
          aria-describedby={error ? "public-repo-error" : undefined}
        />
        <Button type="submit" variant="outline" disabled={looking || !value.trim()} className="shrink-0">
          {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look up"}
        </Button>
      </div>
      {error && (
        <p id="public-repo-error" role="alert" className="mt-1.5 text-xs text-orbit-fail">
          {error}
        </p>
      )}
    </form>
  );
}
