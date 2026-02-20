import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const borderMap = {
  sm: "border-[1.5px]",
  md: "border-2",
  lg: "border-2",
};

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-muted border-t-orbit-accent",
        sizeMap[size],
        borderMap[size],
        className
      )}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
      <div className="relative">
        <div className="h-10 w-10 rounded-full border-2 border-muted animate-spin border-t-orbit-accent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-orbit-accent animate-pulse" />
        </div>
      </div>
      <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
    </div>
  );
}
