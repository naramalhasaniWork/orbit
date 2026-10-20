import { RollingNumber } from "@/components/telemetry/rolling-number";
import { GroundTrack, type GroundTrackTick } from "@/components/telemetry/ground-track";
import { cn } from "@/lib/utils";

interface RunStatStripProps {
  passed: number;
  failed: number;
  flaky: number;
  total: number;
  /** One tick per test, in run order; untested slots fill to `total`. */
  ticks: GroundTrackTick[];
  live: boolean;
}

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 border-border px-4 py-3 [&:not(:last-child)]:border-r", className)}>
      <span className="tm-label text-tm-t3">{label}</span>
      <span className="tm-num text-[24px] leading-none tracking-[-0.02em]">{children}</span>
    </div>
  );
}

/** Stat strip plus the run's ground track: one tick per test, coloured by verdict. */
export function RunStatStrip({ passed, failed, flaky, total, ticks, live }: RunStatStripProps) {
  const executed = passed + failed + flaky;
  const passRate = executed > 0 ? Math.round((passed / executed) * 100) : null;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <Cell label="Pass rate">
          {passRate === null ? "–" : <RollingNumber value={passRate} />}
          {passRate !== null && <span className="text-[13px] text-tm-t3">%</span>}
        </Cell>
        <Cell label="Passed" className="text-tm-pass">
          <RollingNumber value={passed} />
        </Cell>
        <Cell label="Failed" className={failed > 0 ? "text-tm-fail" : undefined}>
          <RollingNumber value={failed} />
        </Cell>
        <Cell label="Flaky">
          <RollingNumber value={flaky} />
        </Cell>
      </div>
      {total > 0 && (
        <div className="border-t border-border px-4 py-3">
          <GroundTrack ticks={ticks} slots={total} variant="strip" animate={live} noun="tests" />
        </div>
      )}
    </div>
  );
}
