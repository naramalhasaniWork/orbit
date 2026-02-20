"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg";
}

function getScoreColor(score: number): string {
  if (score >= 90) return "text-emerald-400";
  if (score >= 70) return "text-amber-400";
  return "text-red-400";
}

function getScoreGlow(score: number): string {
  if (score >= 90) return "shadow-[0_0_24px_rgba(52,211,153,0.2)]";
  if (score >= 70) return "shadow-[0_0_24px_rgba(251,191,36,0.2)]";
  return "shadow-[0_0_24px_rgba(248,113,113,0.2)]";
}

function getScoreBg(score: number): string {
  if (score >= 90) return "bg-emerald-400/10";
  if (score >= 70) return "bg-amber-400/10";
  return "bg-red-400/10";
}

const sizeMap = {
  sm: { wrapper: "h-16 w-16", text: "text-xl", label: "text-[10px]" },
  md: { wrapper: "h-24 w-24", text: "text-3xl", label: "text-xs" },
  lg: { wrapper: "h-32 w-32", text: "text-5xl", label: "text-sm" },
};

export function ScoreDisplay({ score, label, size = "lg" }: ScoreDisplayProps) {
  const s = sizeMap[size];

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className={cn(
        "flex flex-col items-center justify-center rounded-full",
        s.wrapper,
        getScoreBg(score),
        getScoreGlow(score)
      )}
    >
      <span className={cn("font-bold tabular-nums", s.text, getScoreColor(score))}>
        {score}
      </span>
      {label && (
        <span className={cn("text-muted-foreground mt-0.5", s.label)}>
          {label}
        </span>
      )}
    </motion.div>
  );
}

export { getScoreColor, getScoreBg };
