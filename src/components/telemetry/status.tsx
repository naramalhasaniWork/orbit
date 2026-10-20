import { STATUS_TONES, type StatusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/telemetry/live-dot";

interface StatusProps {
  tone: StatusTone;
  /** Word next to the glyph. Defaults to the tone's label. */
  label?: string;
  /** Glyph only; the word moves to an accessible name. Use in dense rows that already say it. */
  glyphOnly?: boolean;
  /** Instrument-label styling (Martian Mono, uppercase). */
  mono?: boolean;
  className?: string;
}

/** Status = glyph + word + colour. Never colour alone. */
export function Status({ tone, label, glyphOnly = false, mono = false, className }: StatusProps) {
  const spec = STATUS_TONES[tone];
  const word = label ?? spec.label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        spec.text,
        mono ? "tm-label" : "text-[13px]",
        className
      )}
      title={glyphOnly ? word : undefined}
    >
      {tone === "live" ? (
        <LiveDot size="sm" />
      ) : (
        <span aria-hidden="true" className="font-label text-[0.9em] leading-none">
          {spec.glyph}
        </span>
      )}
      {glyphOnly ? <span className="sr-only">{word}</span> : <span>{word}</span>}
    </span>
  );
}
