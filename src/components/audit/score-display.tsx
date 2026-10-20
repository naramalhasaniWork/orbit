"use client";

import { motion } from "framer-motion";
import { tween } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg";
}

function getScoreColor(score: number): string {
  if (score >= 90) return "text-tm-pass";
  if (score >= 70) return "text-tm-warn";
  return "text-tm-fail";
}

function getScoreGlow(score: number): string {
  if (score >= 90) return "shadow-[0_0_24px_rgba(52,211,153,0.2)]";
  if (score >= 70) return "shadow-[0_0_24px_rgba(251,191,36,0.2)]";
  return "shadow-[0_0_24px_rgba(248,113,113,0.2)]";
}

function getScoreBg(score: number): string {
  if (score >= 90) return "bg-tm-pass/10";
  if (score >= 70) return "bg-tm-warn/10";
  return "bg-tm-fail/10";
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
      transition={tween.change}
      className={cn(
        "flex flex-col items-center justify-center rounded-full",
        s.wrapper,
        getScoreBg(score),
        getScoreGlow(score)
      )}
    >
      <span className={cn("font-medium tabular-nums", s.text, getScoreColor(score))}>
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
