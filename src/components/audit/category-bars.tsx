"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getScoreColor } from "@/components/audit/score-display";
import {
  Shield,
  Code2,
  Gauge,
  Accessibility,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CategoryBarProps {
  name: string;
  score: number;
  issueCount: number;
  index: number;
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: LucideIcon }
> = {
  security: { label: "Security", icon: Shield },
  quality: { label: "Code Quality", icon: Code2 },
  performance: { label: "Performance", icon: Gauge },
  accessibility: { label: "Accessibility", icon: Accessibility },
  bestPractices: { label: "Best Practices", icon: Sparkles },
};

function getBarColor(score: number): string {
  if (score >= 90) return "bg-tm-pass/80";
  if (score >= 70) return "bg-tm-warn/80";
  return "bg-tm-fail/80";
}

function getBarTrack(score: number): string {
  if (score >= 90) return "bg-tm-pass/10";
  if (score >= 70) return "bg-tm-warn/10";
  return "bg-tm-fail/10";
}

export function CategoryBar({ name, score, issueCount, index }: CategoryBarProps) {
  const meta = CATEGORY_META[name] ?? {
    label: name,
    icon: Code2,
  };
  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{meta.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {issueCount} {issueCount === 1 ? "issue" : "issues"}
          </span>
          <span className={cn("text-sm font-medium tabular-nums", getScoreColor(score))}>
            {score}
          </span>
        </div>
      </div>
      <div className={cn("h-2 rounded-full overflow-hidden", getBarTrack(score))}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: index * 0.08, ease: "easeOut" }}
          className={cn("h-full rounded-full", getBarColor(score))}
        />
      </div>
    </motion.div>
  );
}

interface CategoryBarsProps {
  categories: Record<string, { score: number; issues: string[] }>;
}

export function CategoryBars({ categories }: CategoryBarsProps) {
  const order = ["security", "quality", "performance", "accessibility", "bestPractices"];

  return (
    <div className="space-y-4">
      {order.map((key, i) => {
        const cat = categories[key];
        if (!cat) return null;
        return (
          <CategoryBar
            key={key}
            name={key}
            score={cat.score}
            issueCount={cat.issues.length}
            index={i}
          />
        );
      })}
    </div>
  );
}
