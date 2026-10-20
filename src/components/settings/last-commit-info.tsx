import { CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

interface LastCommitInfoProps {
  info: { lastCommitMessage?: string; lastCommitAt?: string; commitsBehind?: number };
  sha: string;
}

/** Last synced commit and how far the index is behind GitHub. */
export function LastCommitInfo({ info, sha }: LastCommitInfoProps) {
  return (
    <div className="space-y-1 border border-border rounded-lg px-3 py-2.5 bg-foreground/[0.02]">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <CircleDot className={cn(
          "h-3 w-3",
          (info.commitsBehind ?? 0) > 0 ? "text-yellow-400" : "text-emerald-400"
        )} />
        {(info.commitsBehind ?? 0) > 0
          ? `${info.commitsBehind} new commit${info.commitsBehind === 1 ? "" : "s"} since last sync`
          : "Up to date with GitHub"}
      </div>
      <p className="text-[12px] text-foreground/70 font-mono truncate">
        {sha.slice(0, 7)}
        {info.lastCommitMessage && (
          <span className="font-sans text-muted-foreground ml-2 not-italic">
            {info.lastCommitMessage}
          </span>
        )}
      </p>
      {info.lastCommitAt && (
        <p className="text-[10px] text-muted-foreground/60">
          {new Date(info.lastCommitAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
