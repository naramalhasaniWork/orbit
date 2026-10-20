"use client";

import { cn } from "@/lib/utils";

interface SelectCheckboxProps {
  checked: boolean;
  /** `shift` is true when Shift was held, for range selection. */
  onToggle: (shift: boolean) => void;
  label: string;
  className?: string;
}

/** Native checkbox that reports Shift state (the change event does not carry it). */
export function SelectCheckbox({ checked, onToggle, label, className }: SelectCheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={() => {}}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      className={cn("h-4 w-4 shrink-0 cursor-pointer rounded accent-[hsl(var(--orbit-accent))]", className)}
    />
  );
}
