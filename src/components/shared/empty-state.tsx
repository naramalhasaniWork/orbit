import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Exactly one clear next action. */
  action?: React.ReactNode;
  className?: string;
}

/** Still by design: an empty page has nothing to report, so nothing moves. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="mb-5 flex size-12 items-center justify-center rounded-lg border border-border bg-muted">
        <Icon aria-hidden="true" className="size-5 text-tm-t2" strokeWidth={1.6} />
      </div>
      <h3 className="mb-1.5 text-balance text-sm font-medium text-foreground">{title}</h3>
      <p className="mb-5 max-w-sm text-pretty text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}
