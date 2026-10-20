import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        // Quiet fills, text carries the colour. Pair status variants with a glyph (<Status>).
        default: "border-transparent bg-secondary text-foreground",
        secondary: "border-transparent bg-secondary text-tm-t2",
        destructive: "border-transparent bg-tm-fail-bg text-tm-fail",
        outline: "border-border text-tm-t2",
        pass: "border-transparent bg-tm-pass/10 text-tm-pass",
        fail: "border-transparent bg-tm-fail-bg text-tm-fail",
        flaky: "border-transparent bg-secondary text-tm-flaky",
        /** Live only: a browser is running now. */
        accent: "border-tm-live/40 bg-transparent text-tm-live-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
