"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export interface GalleryScreenshot {
  id: string;
  storageUrl: string;
  stepIndex: number | null;
  testCaseId: string;
  testCaseName: string;
  fileName: string;
  timestamp: number;
}

interface ScreenshotGalleryProps {
  screenshots: GalleryScreenshot[];
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function ScreenshotGallery({
  screenshots,
  className,
}: ScreenshotGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [testCaseFilter, setTestCaseFilter] = useState<string | null>(null);

  // Unique test cases for filter
  const testCases = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of screenshots) {
      if (!map.has(s.testCaseId)) {
        map.set(s.testCaseId, s.testCaseName);
      }
    }
    return Array.from(map.entries());
  }, [screenshots]);

  const filtered = useMemo(() => {
    if (!testCaseFilter) return screenshots;
    return screenshots.filter((s) => s.testCaseId === testCaseFilter);
  }, [screenshots, testCaseFilter]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? Math.min(prev + 1, filtered.length - 1) : null
    );
  }, [filtered.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? Math.max(prev - 1, 0) : null
    );
  }, []);

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, closeLightbox, goNext, goPrev]);

  if (screenshots.length === 0) {
    return (
      <EmptyState />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filter bar */}
      {testCases.length > 1 && (
        <FilterBar
          testCases={testCases}
          selected={testCaseFilter}
          onSelect={setTestCaseFilter}
        />
      )}

      {/* Grid */}
      <div className="grid grid-cols-4 gap-3">
        {filtered.map((shot, index) => (
          <ThumbnailCard
            key={shot.id}
            screenshot={shot}
            onClick={() => openLightbox(index)}
          />
        ))}
      </div>

      {/* Lightbox */}
      <Lightbox
        screenshots={filtered}
        currentIndex={lightboxIndex}
        onClose={closeLightbox}
        onNext={goNext}
        onPrev={goPrev}
      />
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <ImageIcon className="h-8 w-8 opacity-50" />
      <span className="text-sm">No screenshots captured for this run</span>
    </div>
  );
}

function FilterBar({
  testCases,
  selected,
  onSelect,
}: {
  testCases: [string, string][];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "text-xs px-2.5 py-1 rounded-md transition-colors",
          !selected
            ? "bg-white/[0.06] text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
        )}
      >
        All
      </button>
      {testCases.map(([id, name]) => (
        <button
          key={id}
          onClick={() => onSelect(selected === id ? null : id)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-md transition-colors truncate max-w-[200px]",
            selected === id
              ? "bg-white/[0.06] text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function ThumbnailCard({
  screenshot,
  onClick,
}: {
  screenshot: GalleryScreenshot;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg border border-white/[0.06] overflow-hidden bg-black/20 hover:border-white/[0.12] transition-all focus:outline-none focus:ring-1 focus:ring-orbit-accent"
    >
      <div className="aspect-video">
        <img
          src={screenshot.storageUrl}
          alt={`Step ${screenshot.stepIndex ?? 0}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white truncate font-medium">
          {screenshot.testCaseName}
        </p>
        <p className="text-[9px] text-white/60">
          Step {screenshot.stepIndex !== null ? screenshot.stepIndex + 1 : "--"}
        </p>
      </div>
    </button>
  );
}

function Lightbox({
  screenshots,
  currentIndex,
  onClose,
  onNext,
  onPrev,
}: {
  screenshots: GalleryScreenshot[];
  currentIndex: number | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  if (currentIndex === null) return null;
  const current = screenshots[currentIndex];
  if (!current) return null;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = current.storageUrl;
    link.download = current.fileName;
    link.click();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/60 rounded-t-lg">
            <div>
              <span className="text-sm text-white font-medium">
                {current.testCaseName}
              </span>
              <span className="text-xs text-white/50 ml-3">
                Step {current.stepIndex !== null ? current.stepIndex + 1 : "--"} / {currentIndex + 1} of {screenshots.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Image */}
          <img
            src={current.storageUrl}
            alt={`Step ${current.stepIndex ?? 0}`}
            className="max-w-full max-h-[calc(90vh-80px)] object-contain bg-black"
          />

          {/* Navigation arrows */}
          {currentIndex > 0 && (
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
              onClick={onPrev}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {currentIndex < screenshots.length - 1 && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
              onClick={onNext}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
