"use client";

import { type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="flex items-center justify-center h-14 w-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-5"
      >
        <Icon className="h-6 w-6 text-muted-foreground" />
      </motion.div>
      <h3 className="text-sm font-medium text-foreground mb-1.5">{title}</h3>
      <p className="text-[13px] text-muted-foreground max-w-sm mb-5 leading-relaxed">
        {description}
      </p>
      {action}
    </motion.div>
  );
}
