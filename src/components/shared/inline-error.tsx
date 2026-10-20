import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Visible, announced error for a failed action. Renders nothing without a message. */
export function InlineError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 text-xs text-red-400 bg-red-400/[0.06] rounded-md px-3 py-2",
        className
      )}
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
