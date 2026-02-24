"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Sparkline } from "@/components/shared/sparkline";
import { springs } from "@/lib/motion";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number;
  trendInverted?: boolean;
  sparklineData?: number[];
  sparklineColor?: string;
  suffix?: string;
  className?: string;
}

/** Animated number display — smoothly ticks between numeric values */
function AnimatedValue({ value, suffix }: { value: string | number; suffix?: string }) {
  const isNumeric = typeof value === "number";
  const spring = useSpring(isNumeric ? value : 0, { stiffness: 200, damping: 30 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [displayStr, setDisplayStr] = useState(String(value));
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (isNumeric) {
      spring.set(value);
    } else {
      setDisplayStr(String(value));
    }
    prevValueRef.current = value;
  }, [value, isNumeric, spring]);

  useEffect(() => {
    if (!isNumeric) return;
    const unsubscribe = display.on("change", (v) => setDisplayStr(String(v)));
    return unsubscribe;
  }, [display, isNumeric]);

  return (
    <span className="text-2xl font-semibold tabular-nums text-foreground tracking-tight">
      {displayStr}
      {suffix && (
        <span className="text-sm font-normal text-muted-foreground ml-0.5">
          {suffix}
        </span>
      )}
    </span>
  );
}

export function StatCard({
  label,
  value,
  trend,
  trendInverted,
  sparklineData,
  sparklineColor,
  suffix,
  className,
}: StatCardProps) {
  const trendPositive = trendInverted ? (trend ?? 0) < 0 : (trend ?? 0) > 0;
  const trendNegative = trendInverted ? (trend ?? 0) > 0 : (trend ?? 0) < 0;

  return (
    <motion.div
      className={cn(
        "flex flex-col gap-1.5 p-4 rounded-xl surface-1 border border-border",
        "hover:border-border/80 dark:hover:border-white/[0.12] transition-colors",
        className
      )}
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </span>
        {sparklineData && sparklineData.length >= 2 && (
          <Sparkline
            data={sparklineData}
            width={64}
            height={20}
            strokeColor={sparklineColor ?? "hsl(var(--orbit-accent))"}
            fillColor={sparklineColor ?? "hsl(var(--orbit-accent))"}
          />
        )}
      </div>
      <div className="flex items-end gap-2">
        <AnimatedValue value={value} suffix={suffix} />
        {trend !== undefined && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={springs.snappy}
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium pb-1",
              trendPositive && "text-orbit-pass",
              trendNegative && "text-orbit-fail",
              trend === 0 && "text-muted-foreground"
            )}
          >
            {trend > 0 && <TrendingUp className="h-3 w-3" />}
            {trend < 0 && <TrendingDown className="h-3 w-3" />}
            {trend === 0 && <Minus className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}
