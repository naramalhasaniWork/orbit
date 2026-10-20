"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Compact "Re-index" action for the sync banner; shows the server's reason on failure. */
export function ReindexLink({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reindex() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setError(await apiErrorMessage(res, "Re-index failed"));
        return;
      }
      router.refresh();
    } catch {
      setError("Re-index failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={reindex}
        disabled={pending}
        className="ml-1 flex items-center gap-1 text-yellow-400 hover:text-yellow-300 font-medium transition-colors disabled:opacity-60"
      >
        <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
        Re-index
      </button>
      {error && <span role="alert" className="text-red-400">{error}</span>}
    </>
  );
}
