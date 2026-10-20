"use client";

import {
  Globe,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewportToolbarProps {
  currentUrl: string | null;
  currentStep: string | null;
  currentTestName: string | null;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  connected: boolean;
  status: string;
}

export function ViewportToolbar({
  currentUrl,
  currentStep,
  currentTestName,
  zoom,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
  isFullscreen,
  onToggleFullscreen,
  connected,
  status,
}: ViewportToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
      {/* Connection indicator */}
      <div
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          connected && status === "streaming" && "bg-orbit-pass",
          connected && status !== "streaming" && "bg-orbit-accent",
          !connected && "bg-orbit-fail"
        )}
      />

      {/* URL bar */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {currentUrl ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
            <Globe className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{currentUrl}</span>
          </div>
        ) : currentTestName ? (
          <span className="text-xs text-foreground truncate">{currentTestName}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Live Browser</span>
        )}
      </div>

      {/* Current step label */}
      {currentStep && (
        <span className="text-[11px] text-muted-foreground truncate max-w-[200px] shrink-0">
          {currentStep}
        </span>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onZoomOut}
          disabled={!canZoomOut}
        >
          <ZoomOut className="h-3 w-3" />
        </Button>
        <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onZoomIn}
          disabled={!canZoomIn}
        >
          <ZoomIn className="h-3 w-3" />
        </Button>
      </div>

      {/* Fullscreen toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onToggleFullscreen}
      >
        {isFullscreen ? (
          <Minimize2 className="h-3 w-3" />
        ) : (
          <Maximize2 className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}
