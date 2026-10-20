"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDistanceToNow } from "date-fns";

interface ScreenshotArtifact {
  id: string;
  type: string;
  storageKey: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  stepIndex: number | null;
  createdAt: string;
  url: string;
}

interface RunScreenshotsTabProps {
  runId: string;
  projectId: string;
}

function stepLabel(stepIndex: number | null, fileName: string | null): string {
  if (stepIndex === -1) return "Initial State";
  if (stepIndex !== null) return `Step ${stepIndex}`;
  if (fileName) return fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  return "Screenshot";
}

export function RunScreenshotsTab({ runId, projectId }: RunScreenshotsTabProps) {
  const [screenshots, setScreenshots] = useState<ScreenshotArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fetchScreenshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/runs/${runId}/artifacts?type=screenshot`
      );
      if (!res.ok) throw new Error("Failed to load screenshots");
      const json = await res.json();
      if (json.success) {
        setScreenshots(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load screenshots");
    } finally {
      setLoading(false);
    }
  }, [projectId, runId]);

  useEffect(() => {
    fetchScreenshots();
  }, [fetchScreenshots]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Pending />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-tm-fail">{error}</p>
        <button
          onClick={fetchScreenshots}
          className="mt-3 text-xs text-foreground hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No screenshots"
        description="Screenshots are captured during test execution and will appear here."
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {screenshots.map((shot, index) => (
          <button
            key={shot.id}
            type="button"
            onClick={() => setLightboxIndex(index)}
            className="group relative rounded-lg overflow-hidden border border-border hover:border-tm-line-strong transition-colors bg-foreground/[0.02]"
          >
            <div className="aspect-video relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.url}
                alt={stepLabel(shot.stepIndex, shot.fileName)}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            </div>
            <div className="px-2.5 py-2">
              <p className="text-xs font-medium text-foreground truncate">
                {stepLabel(shot.stepIndex, shot.fileName)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(shot.createdAt), { addSuffix: true })}
              </p>
            </div>
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          screenshots={screenshots}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}

/** Screenshot viewer on the Dialog primitive: focus trap, Escape, focus returns to the thumbnail; ← → step. */
function Lightbox({
  screenshots,
  currentIndex,
  onClose,
  onNavigate,
}: {
  screenshots: ScreenshotArtifact[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const current = screenshots[currentIndex];
  if (!current) return null;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < screenshots.length - 1;
  const label = stepLabel(current.stepIndex, current.fileName);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[min(1100px,calc(100%-2rem))] gap-3 p-4"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIndex - 1);
          if (e.key === "ArrowRight" && hasNext) onNavigate(currentIndex + 1);
        }}
      >
        <DialogHeader className="pr-10">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription className="tm-label text-tm-t3">
            {currentIndex + 1} of {screenshots.length} · {formatDistanceToNow(new Date(current.createdAt), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[240px] items-center justify-center overflow-auto rounded-md border border-border bg-tm-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={label} className="mx-auto max-h-[70dvh] max-w-full object-contain" />
        </div>
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => onNavigate(currentIndex - 1)}>
            <ChevronLeft aria-hidden="true" /> Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onNavigate(currentIndex + 1)}>
            Next <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
