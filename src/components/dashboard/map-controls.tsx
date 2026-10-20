"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Circle,
  Square,
  Diamond,
  Hexagon,
} from "lucide-react";
import {
  NODE_TYPE_CONFIG,
  STATUS_CONFIG,
  type NodeType,
  type TestStatus,
} from "./map-types";

interface MapControlsProps {
  activeTypes: Set<string>;
  activeStatuses: Set<TestStatus>;
  searchQuery: string;
  onToggleType: (type: string) => void;
  onToggleStatus: (status: TestStatus) => void;
  onSearchChange: (query: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  route: <Circle className="h-3 w-3" />,
  component: <Square className="h-3 w-3" />,
  endpoint: <Diamond className="h-3 w-3" />,
  model: <Hexagon className="h-3 w-3" />,
  auth_strategy: <Circle className="h-3 w-3" />,
  middleware: <Square className="h-3 w-3" />,
};

export function MapControls({
  activeTypes,
  activeStatuses,
  searchQuery,
  onToggleType,
  onToggleStatus,
  onSearchChange,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: MapControlsProps) {
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl surface-1 border border-border">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter nodes..."
          value={searchQuery}
          onChange={handleSearch}
          className="pl-8 h-8 text-xs bg-foreground/[0.06] border-border focus:border-orbit-accent/40"
        />
      </div>

      {/* Node Types */}
      <div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 block">
          Node Types
        </span>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(NODE_TYPE_CONFIG).map(([type, config]) => (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                activeTypes.has(type)
                  ? "bg-secondary text-foreground"
                  : "bg-transparent text-muted-foreground/50 line-through"
              )}
            >
              {typeIcons[type]}
              {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Filters */}
      <div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 block">
          Test Status
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(STATUS_CONFIG) as [TestStatus, { label: string; color: string }][]).map(
            ([status, config]) => (
              <button
                key={status}
                onClick={() => onToggleStatus(status)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                  activeStatuses.has(status)
                    ? "bg-secondary text-foreground"
                    : "bg-transparent text-muted-foreground/50 line-through"
                )}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                {config.label}
              </button>
            )
          )}
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1 pt-1 border-t border-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onZoomIn}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onZoomOut}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onZoomFit}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] text-muted-foreground ml-1">Zoom</span>
      </div>

      {/* Legend */}
      <div className="pt-1 border-t border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 block">
          Legend
        </span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Circle className="h-2.5 w-2.5" /> Route
          </div>
          <div className="flex items-center gap-1.5">
            <Square className="h-2.5 w-2.5" /> Component
          </div>
          <div className="flex items-center gap-1.5">
            <Diamond className="h-2.5 w-2.5" /> Endpoint
          </div>
          <div className="flex items-center gap-1.5">
            <Hexagon className="h-2.5 w-2.5" /> Model
          </div>
        </div>
      </div>
    </div>
  );
}
