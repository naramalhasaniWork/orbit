"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReindexLink } from "@/components/dashboard/reindex-link";

export interface SyncInfo {
  commitsBehind: number;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastCommitAt: string | null;
  autoSync: boolean;
  syncDiff: { added: number; modified: number; removed: number } | null;
}

/** Where the index stands against the repo: synced, or N commits behind, with a re-check. */
export function SyncStatus({ projectId, info }: { projectId: string; info: SyncInfo }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [result, setResult] = useState<{ commitsBehind: number; sha: string | null } | null>(null);

  const check = useCallback(() => {
    if (checking) return;
    setChecking(true);
    setCheckError(null);
    fetch(`/api/projects/${projectId}/sync/check`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((json: { data: { commitsBehind: number; lastCommitSha: string | null } }) => {
        setResult({ commitsBehind: json.data.commitsBehind, sha: json.data.lastCommitSha });
        router.refresh();
      })
      .catch(() => setCheckError("Couldn't check the repo."))
      .finally(() => setChecking(false));
  }, [checking, projectId, router]);

  const behind = result?.commitsBehind ?? info.commitsBehind;
  const sha = result?.sha ?? info.lastCommitSha;
  const diff = info.syncDiff;

  return (
    <div className="tm-label flex flex-wrap items-center gap-x-3 gap-y-1 text-tm-t3">
      {behind > 0 ? (
        <span className="flex items-center gap-1.5 text-tm-warn">
          {behind} commit{behind === 1 ? "" : "s"} behind
          {sha && <span className="normal-case">· {sha.slice(0, 7)}</span>}
          <ReindexLink projectId={projectId} />
        </span>
      ) : sha ? (
        <span>
          <span aria-hidden="true" className="text-tm-pass">✓ </span>Synced <span className="normal-case">· {sha.slice(0, 7)}</span>
        </span>
      ) : (
        <span>{info.autoSync ? "Auto-sync on" : "Auto-sync off"}</span>
      )}
      {diff && (diff.added > 0 || diff.modified > 0 || diff.removed > 0) && (
        <span className="tm-num">
          +{diff.added} ~{diff.modified} −{diff.removed} <span className="tm-label">since last sync</span>
        </span>
      )}
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={check} disabled={checking} aria-busy={checking || undefined}>
        {checking ? "Checking…" : "Check now"}
      </Button>
      {checkError && <span role="alert" className="normal-case text-tm-fail">{checkError}</span>}
    </div>
  );
}
