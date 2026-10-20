"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { pickEvidence, type EvidenceShot } from "@/lib/runs/steps";

interface FailureEvidenceProps {
  projectId: string;
  runId: string;
  resultId: string;
  failedIndex: number;
  action: string;
}

function Shot({ shot, caption }: { shot?: EvidenceShot; caption: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <div className="aspect-[16/10] overflow-hidden rounded-md border border-border bg-muted">
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt={caption} loading="lazy" className="size-full object-cover object-top" />
        )}
      </div>
      <figcaption className="tm-label truncate text-tm-t3">{caption}</figcaption>
    </figure>
  );
}

/** Before / Action / After around the failing step. Renders nothing when no screenshots were captured. */
export function FailureEvidence({ projectId, runId, resultId, failedIndex, action }: FailureEvidenceProps) {
  const { data } = useSWR<EvidenceShot[]>(
    `/api/projects/${projectId}/runs/${runId}/artifacts?type=screenshot`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { before, after } = pickEvidence(data ?? [], resultId, failedIndex);
  if (!before && !after) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Shot shot={before} caption="Before" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex aspect-[16/10] items-center justify-center rounded-md border border-dashed border-tm-line-strong p-3">
          <span className="line-clamp-3 text-center font-mono text-[12px] text-tm-t2">{action}</span>
        </div>
        <span className="tm-label text-tm-t3">Action · step {String(failedIndex + 1).padStart(2, "0")}</span>
      </div>
      <Shot shot={after} caption="After" />
    </div>
  );
}
