"use client";

import {
  type OperationType,
  type Operation,
  type Flow,
  OPERATION_TYPE_COLORS,
  OPERATION_TYPE_LABELS,
} from "./operations-flow-types";

interface OperationsControlsProps {
  activeTypes: Set<OperationType>;
  onToggleType: (type: OperationType) => void;
  flows: Flow[];
  selectedOp: Operation | null;
  selectedFlow: Flow | null;
}

export function OperationsControls({
  activeTypes,
  onToggleType,
  flows,
  selectedOp,
  selectedFlow,
}: OperationsControlsProps) {
  const types = Object.keys(OPERATION_TYPE_COLORS) as OperationType[];

  return (
    <div className="w-56 shrink-0 p-3 overflow-y-auto space-y-4">
      {/* Type filters */}
      <div>
        <p className=" tm-label text-muted-foreground mb-2">
          Operation Types
        </p>
        <div className="space-y-1">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className="flex items-center gap-2 w-full px-2 py-1 rounded text-xs hover:bg-foreground/[0.04] transition-colors"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: activeTypes.has(type)
                    ? OPERATION_TYPE_COLORS[type]
                    : "rgba(107,114,128,0.3)",
                }}
              />
              <span className={activeTypes.has(type) ? "text-foreground" : "text-muted-foreground"}>
                {OPERATION_TYPE_LABELS[type]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Flows summary */}
      <div>
        <p className=" tm-label text-muted-foreground mb-2">
          Flows ({flows.length})
        </p>
        <div className="space-y-1">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className={`px-2 py-1.5 rounded text-xs ${
                flow.criticalPath
                  ? "border border-tm-line-strong bg-foreground/[0.06]"
                  : "bg-foreground/[0.02]"
              }`}
            >
              <span className="text-foreground">{flow.name}</span>
              {flow.criticalPath && (
                <span className="ml-1 text-[9px] text-foreground">critical</span>
              )}
              <p className="text-muted-foreground text-[10px] mt-0.5 line-clamp-2">
                {flow.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Selected operation detail */}
      {selectedOp && (
        <div className="border-t border-border pt-3">
          <p className=" tm-label text-muted-foreground mb-1">
            Selected
          </p>
          <p className="text-sm font-medium text-foreground">{selectedOp.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {OPERATION_TYPE_LABELS[selectedOp.type]}
            {selectedOp.nodeIds.length > 0 &&
              ` -- ${selectedOp.nodeIds.length} node${selectedOp.nodeIds.length === 1 ? "" : "s"}`}
          </p>
          {selectedFlow && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Flow: {selectedFlow.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
