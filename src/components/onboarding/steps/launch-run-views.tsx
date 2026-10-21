"use client";

import { useRouter } from "next/navigation";
import { Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pending } from "@/components/telemetry/pending";
import { ClosingO } from "@/components/telemetry/closing-o";
import { GroundTrack } from "@/components/telemetry/ground-track";
import { RollingNumber } from "@/components/telemetry/rolling-number";
import { LiveRow } from "@/components/execution/live-list";
import type { StatusTone } from "@/lib/status-tone";

export interface TestProgress {
  name: string;
  status: "pending" | "running" | "pass" | "fail";
}

const TONE: Record<TestProgress["status"], StatusTone> = {
  pending: "untested",
  running: "live",
  pass: "pass",
  fail: "fail",
};

const VISIBLE_TESTS = 10;

function StepHeading({ title, lead }: { title: string; lead: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-2 text-center">
      <h2 className="text-balance text-[22px] font-medium tracking-display">{title}</h2>
      <p className="text-pretty text-[14px] text-tm-t2">{lead}</p>
    </div>
  );
}

export function ReadyView({
  enabledTestCount,
  repoName,
  onLaunch,
  onBack,
}: {
  enabledTestCount: number;
  repoName: string;
  onLaunch: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <StepHeading
        title="Ready for the first run"
        lead={`Orbit will run ${enabledTestCount} tests against ${repoName} in a real browser.`}
      />
      <dl className="mb-8 w-full rounded-lg border border-border bg-card">
        <SummaryRow label="Repository" value={repoName} />
        <SummaryRow label="Test cases" value={`${enabledTestCount} enabled`} />
        <SummaryRow label="Browser" value="Chromium, headless" />
      </dl>
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={onLaunch}>
          <Play aria-hidden="true" />
          Launch first run
        </Button>
      </div>
    </>
  );
}

/** The first run, live: one ground-track tick per test, and the running test grows its StepBar. */
export function RunningView({
  tests,
  passCount,
  failCount,
}: {
  tests: TestProgress[];
  passCount: number;
  failCount: number;
}) {
  const done = passCount + failCount;
  const ticks = tests.filter((t) => t.status !== "pending").map((t) => ({ tone: TONE[t.status] }));

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <ClosingO size={40} state="running" />
        <h2 className="text-[22px] font-medium tracking-display">Running tests</h2>
        <p className="tm-label text-tm-t2">
          <RollingNumber value={`${String(done).padStart(2, "0")}/${String(tests.length || 0).padStart(2, "0")}`} /> complete
        </p>
      </div>

      {tests.length > 0 && (
        <div className="mb-4 w-full">
          <GroundTrack ticks={ticks} slots={tests.length} animate noun="tests" />
        </div>
      )}

      {tests.length > 0 ? (
        <ol aria-live="polite" className="w-full overflow-hidden rounded-lg border border-border bg-card">
          {tests.slice(0, VISIBLE_TESTS).map((test, idx) => (
            <LiveRow key={`${idx}-${test.name}`} index={idx} tone={TONE[test.status]} label={test.name} />
          ))}
          {tests.length > VISIBLE_TESTS && (
            <li className="tm-label px-3 py-2 text-tm-t3">+{tests.length - VISIBLE_TESTS} more tests</li>
          )}
        </ol>
      ) : (
        <Pending label="Waiting for the first test result" showLabel />
      )}
    </>
  );
}

/** Says how the run went: the O closes on a pass and stops on a square when anything failed. */
export function CompleteView({
  total,
  passCount,
  failCount,
  projectId,
}: {
  total: number;
  passCount: number;
  failCount: number;
  projectId?: string;
}) {
  const router = useRouter();
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : null;

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <ClosingO size={48} state={failCount > 0 ? "failed" : "passed"} />
        <h2 className="text-[22px] font-medium tracking-display">
          {failCount > 0 ? `First run finished, ${failCount} failed` : "First run passed"}
        </h2>
        <p className="tm-label flex gap-3 text-tm-t2">
          <span className="text-tm-pass"><span aria-hidden="true">✓</span> {passCount} passed</span>
          {failCount > 0 && <span className="text-tm-fail"><span aria-hidden="true">✕</span> {failCount} failed</span>}
          {passRate !== null && <span>· {passRate}% of {total}</span>}
        </p>
      </div>
      <Button
        size="lg"
        onClick={() => router.push(projectId ? `/dashboard?project=${projectId}` : "/dashboard")}
      >
        {failCount > 0 ? "See what broke" : "Go to home"}
        <ArrowRight aria-hidden="true" />
      </Button>
    </>
  );
}

export function ErrorView({
  error,
  onRetry,
  onBack,
  onConfigureEnv,
}: {
  error: string;
  onRetry: () => void;
  onBack: () => void;
  onConfigureEnv?: () => void;
}) {
  return (
    <>
      <p role="alert" className="mb-6 w-full rounded-md border border-tm-fail/30 bg-tm-fail-bg px-3 py-2 text-[13px] text-tm-fail">
        <span aria-hidden="true">✕ </span>
        {error}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        {onConfigureEnv && (
          <Button variant="outline" onClick={onConfigureEnv}>
            Configure environment
          </Button>
        )}
        <Button variant="outline" onClick={onRetry}>Retry</Button>
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <dt className="tm-label text-tm-t3">{label}</dt>
      <dd className="truncate text-[13px] font-medium">{value}</dd>
    </div>
  );
}
