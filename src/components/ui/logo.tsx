import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { container: "h-6 w-6", dot: "h-2 w-2", text: "text-sm", ring: "h-4 w-4" },
  md: { container: "h-8 w-8", dot: "h-3 w-3", text: "text-lg", ring: "h-5 w-5" },
  lg: { container: "h-10 w-10", dot: "h-3.5 w-3.5", text: "text-xl", ring: "h-6 w-6" },
};

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  const s = sizeMap[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "relative flex items-center justify-center rounded-lg",
          "bg-primary/15 border border-primary/25",
          s.container
        )}
      >
        {/* Orbital ring — subtle SVG ring around center dot */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={cn("absolute", s.ring)}
          aria-hidden="true"
        >
          <ellipse
            cx="12"
            cy="12"
            rx="10"
            ry="4"
            transform="rotate(-30 12 12)"
            stroke="hsl(var(--primary))"
            strokeWidth="1"
            opacity="0.4"
          />
        </svg>
        {/* Center dot */}
        <span
          className={cn(
            "rounded-full bg-primary shadow-glow-sm",
            s.dot
          )}
        />
      </span>
      {showText && (
        <span className={cn("font-semibold tracking-tight", s.text)}>
          Orbit
        </span>
      )}
    </span>
  );
}
