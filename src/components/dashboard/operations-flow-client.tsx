"use client";

import { motion } from "framer-motion";
import { Workflow } from "lucide-react";
import { fadeUp } from "@/lib/motion";
import { EmptyState } from "@/components/shared/empty-state";
import { OperationsFlow } from "./operations-flow";
import type { Operation, Flow, Dependency } from "./operations-flow-types";

interface OperationsFlowClientProps {
  projectId: string;
  projectName: string;
  operations: Operation[];
  flows: Flow[];
  dependencies: Dependency[];
}

export function OperationsFlowClient({
  projectName,
  operations,
  flows,
  dependencies,
}: OperationsFlowClientProps) {
  const hasData = operations.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <OperationsHeader projectName={projectName} operationCount={0} flowCount={0} />
        <EmptyState
          icon={Workflow}
          title="No operations analysis"
          description="Run a test plan to generate the operations dependency graph for this project."
        />
      </div>
    );
  }

  const criticalCount = flows.filter((f) => f.criticalPath).length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <OperationsHeader
        projectName={projectName}
        operationCount={operations.length}
        flowCount={flows.length}
        criticalCount={criticalCount}
      />
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="flex-1 min-h-0 rounded-xl surface-1 overflow-hidden"
      >
        <OperationsFlow
          operations={operations}
          flows={flows}
          dependencies={dependencies}
        />
      </motion.div>
    </div>
  );
}

function OperationsHeader({
  projectName,
  operationCount,
  flowCount,
  criticalCount,
}: {
  projectName: string;
  operationCount: number;
  flowCount: number;
  criticalCount?: number;
}) {
  return (
    <div className="flex items-center justify-between px-1 pb-3">
      <div>
        <h1 className="text-lg font-medium text-foreground">Operations</h1>
        <p className="text-xs text-muted-foreground">
          {projectName}
          {operationCount > 0 && (
            <>
              {" -- "}
              {operationCount} operation{operationCount !== 1 ? "s" : ""}
              {", "}
              {flowCount} flow{flowCount !== 1 ? "s" : ""}
              {criticalCount !== undefined && criticalCount > 0 && (
                <span className="text-foreground">
                  {" "}({criticalCount} critical)
                </span>
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
