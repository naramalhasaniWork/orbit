"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RouteNode {
  id: string;
  name: string;
  type: string;
  filePath: string;
  coverageStatus: "covered" | "partial" | "none";
  testCount: number;
}

interface CoverageMapProps {
  nodes: RouteNode[];
}

const statusColors: Record<string, string> = {
  covered: "bg-orbit-pass/60 hover:bg-orbit-pass/80",
  partial: "bg-orbit-flaky/50 hover:bg-orbit-flaky/70",
  none: "bg-white/[0.06] hover:bg-white/[0.12]",
};

const statusLabels: Record<string, string> = {
  covered: "Covered",
  partial: "Partial",
  none: "No coverage",
};

export function CoverageMap({ nodes }: CoverageMapProps) {
  if (nodes.length === 0) return null;

  const covered = nodes.filter((n) => n.coverageStatus === "covered").length;
  const partial = nodes.filter((n) => n.coverageStatus === "partial").length;
  const none = nodes.filter((n) => n.coverageStatus === "none").length;

  return (
    <div className="rounded-xl surface-1 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-foreground">
          Coverage Map
        </h3>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-orbit-pass/60" />
            Covered ({covered})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-orbit-flaky/50" />
            Partial ({partial})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-white/[0.06]" />
            None ({none})
          </span>
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(28px,1fr))] gap-1">
          {nodes.map((node) => (
            <Tooltip key={node.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "aspect-square rounded-sm cursor-default transition-colors",
                    statusColors[node.coverageStatus]
                  )}
                />
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-popover border text-xs max-w-[220px]"
              >
                <div className="font-medium text-foreground">{node.name}</div>
                <div className="text-muted-foreground mt-0.5">
                  {node.filePath}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={cn(
                      node.coverageStatus === "covered" && "text-orbit-pass",
                      node.coverageStatus === "partial" && "text-orbit-flaky",
                      node.coverageStatus === "none" && "text-muted-foreground"
                    )}
                  >
                    {statusLabels[node.coverageStatus]}
                  </span>
                  {node.testCount > 0 && (
                    <span className="text-muted-foreground">
                      {node.testCount} {node.testCount === 1 ? "test" : "tests"}
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
