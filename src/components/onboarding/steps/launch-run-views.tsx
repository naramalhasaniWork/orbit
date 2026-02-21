"use client";

import { useRouter } from "next/navigation";
import { Play, Check, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/shared/status-dot";

export interface TestProgress {
  name: string;
  status: "pending" | "running" | "pass" | "fail";
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
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Ready to launch
        </h2>
        <p className="text-sm text-muted-foreground">
          Orbit will execute {enabledTestCount} tests against {repoName} in a
          cloud browser environment.
        </p>
      </div>

      <div className="w-full rounded-lg surface-1 p-5 mb-8 space-y-3">
        <SummaryRow label="Repository" value={repoName} />
        <SummaryRow label="Test cases" value={`${enabledTestCount} enabled`} />
        <SummaryRow label="Browser" value="Chromium (headless)" />
        <SummaryRow label="Est. duration" value="~2 minutes" />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2 h-12 px-8 text-base"
          onClick={onLaunch}
        >
          <Play className="h-5 w-5" />
          Launch First Run
        </Button>
      </div>
    </>
  );
}

export function RunningView({
  tests,
  progress,
  passCount,
  failCount,
}: {
  tests: TestProgress[];
  progress: number;
  passCount: number;
  failCount: number;
}) {
  return (
    <>
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Running tests
        </h2>
        <p className="text-sm text-muted-foreground">
          {passCount + failCount} of {tests.length || "?"} complete
        </p>
      </div>

      <div className="w-full h-2 rounded-full bg-muted mb-6 overflow-hidden">
        <div
          className="h-full bg-orbit-accent rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {tests.length > 0 && (
        <div className="w-full space-y-1">
          {tests.slice(0, 10).map((test, idx) => (
            <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-md">
              <TestStatusIcon status={test.status} />
              <span className={cn(
                "text-sm flex-1 truncate",
                test.status === "pending" && "text-muted-foreground/50",
                test.status === "running" && "text-foreground",
                test.status === "pass" && "text-muted-foreground",
                test.status === "fail" && "text-orbit-fail",
              )}>
                {test.name}
              </span>
            </div>
          ))}
          {tests.length > 10 && (
            <div className="px-3 py-1 text-xs text-muted-foreground">
              +{tests.length - 10} more tests
            </div>
          )}
        </div>
      )}

      {tests.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Waiting for test results...
        </div>
      )}
    </>
  );
}

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
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;

  return (
    <>
      <div className="text-center mb-6">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-orbit-pass/10 mx-auto mb-4">
          <Check className="h-8 w-8 text-orbit-pass" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          First run complete
        </h2>
        <p className="text-sm text-muted-foreground">
          {passRate}% pass rate across {total} tests
        </p>
      </div>

      <div className="flex gap-3 mb-8">
        <Badge variant="outline" className="text-orbit-pass border-orbit-pass/30 gap-1.5">
          <StatusDot status="pass" />
          {passCount} passed
        </Badge>
        {failCount > 0 && (
          <Badge variant="outline" className="text-orbit-fail border-orbit-fail/30 gap-1.5">
            <StatusDot status="fail" />
            {failCount} failed
          </Badge>
        )}
      </div>

      <Button
        className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2"
        size="lg"
        onClick={() => {
          const url = projectId ? `/dashboard?project=${projectId}` : "/dashboard";
          router.push(url);
        }}
      >
        Go to Dashboard
        <ArrowRight className="h-4 w-4" />
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
      <div className="flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2 mb-6">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        {onConfigureEnv && (
          <Button variant="outline" onClick={onConfigureEnv}>
            Configure Environment
          </Button>
        )}
        <Button variant="outline" onClick={onRetry}>Retry</Button>
      </div>
    </>
  );
}

function TestStatusIcon({ status }: { status: TestProgress["status"] }) {
  if (status === "running") return <Loader2 className="h-4 w-4 text-orbit-accent animate-spin" />;
  if (status === "pass") return <StatusDot status="pass" size="md" />;
  if (status === "fail") return <StatusDot status="fail" size="md" />;
  return <StatusDot status="untested" size="md" />;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
