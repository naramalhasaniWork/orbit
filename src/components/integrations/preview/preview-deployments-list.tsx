import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PreviewDeploymentRow {
  id: string;
  commitSha: string;
  branch: string | null;
  prNumber: number | null;
  url: string | null;
  status: string;
  error: string | null;
  runId: string | null;
  createdAt: string;
}

const STATUS: Record<string, { glyph: string; label: string; className: string }> = {
  pending: { glyph: "○", label: "Waiting for preview", className: "text-muted-foreground" },
  ready: { glyph: "✓", label: "Tested", className: "text-orbit-pass" },
  failed: { glyph: "✕", label: "No preview", className: "text-orbit-fail" },
  gone: { glyph: "–", label: "Closed", className: "text-muted-foreground" },
};

/** Recent PR previews for the project: what was waited for, what URL was tested, and the run. */
export function PreviewDeploymentsList({ rows }: { rows: PreviewDeploymentRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-pretty">
        No PR previews yet. Open or push to a pull request and Orbit will wait for its preview here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
      {rows.map((row) => {
        const status = STATUS[row.status] ?? STATUS.pending;
        return (
          <li key={row.id} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3">
            <span className={cn("shrink-0 w-40", status.className)}>
              <span aria-hidden>{status.glyph}</span> {status.label}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">
              {row.prNumber ? `PR #${row.prNumber}` : "—"} · {row.commitSha.slice(0, 7)}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.error ?? row.url ?? undefined}>
              {row.url ?? row.error ?? row.branch ?? ""}
            </span>
            {row.runId && (
              <Link href={`/dashboard/runs/${row.runId}`} className="shrink-0 text-foreground hover:underline">
                View run
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
