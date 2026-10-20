"use client";

import { useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

  useEffect(() => {
    if (lightboxIndex === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) =>
          prev !== null && prev > 0 ? prev - 1 : prev
        );
      }
      if (e.key === "ArrowRight") {
        setLightboxIndex((prev) =>
          prev !== null && prev < screenshots.length - 1 ? prev + 1 : prev
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, screenshots.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchScreenshots}
          className="mt-3 text-xs text-orbit-accent hover:underline"
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
            className="group relative rounded-lg overflow-hidden border border-border hover:border-orbit-accent/40 transition-colors bg-foreground/[0.02]"
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 rounded-t-xl">
          <div>
            <p className="text-sm font-medium text-foreground">
              {stepLabel(current.stepIndex, current.fileName)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {currentIndex + 1} of {screenshots.length}
              {" -- "}
              {formatDistanceToNow(new Date(current.createdAt), { addSuffix: true })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-foreground/[0.1] transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image */}
        <div className="relative overflow-auto bg-black/40 rounded-b-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={stepLabel(current.stepIndex, current.fileName)}
            className="max-w-full max-h-[75vh] object-contain mx-auto"
          />
        </div>

        {/* Navigation */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full",
              "bg-black/60 hover:bg-black/80 text-white transition-colors"
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full",
              "bg-black/60 hover:bg-black/80 text-white transition-colors"
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
