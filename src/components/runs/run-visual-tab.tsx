"use client";

import { useRouter } from "next/navigation";
import { VisualDiffViewer, type VisualDiffData } from "@/components/runs/visual-diff-viewer";

interface RunVisualTabProps {
  results: VisualDiffData[];
  projectId: string;
  runId: string;
}

export function RunVisualTab({ results, projectId, runId }: RunVisualTabProps) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {results.map((data) => (
        <VisualDiffViewer
          key={data.screenshotKey}
          data={data}
          projectId={projectId}
          runId={runId}
          onAcceptBaseline={() => router.refresh()}
        />
      ))}
    </div>
  );
}
