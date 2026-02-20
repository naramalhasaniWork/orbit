"use client";

import { motion } from "framer-motion";
import { X, FileCode2, ArrowRightLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusDot } from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";
import {
  type MapNode,
  type MapEdge,
  NODE_TYPE_CONFIG,
  STATUS_CONFIG,
} from "./map-types";

interface MapNodeDetailProps {
  node: MapNode;
  edges: MapEdge[];
  allNodes: MapNode[];
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

export function MapNodeDetail({
  node,
  edges,
  allNodes,
  onClose,
  onSelectNode,
}: MapNodeDetailProps) {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  const outgoing = edges.filter((e) => e.sourceId === node.id);
  const incoming = edges.filter((e) => e.targetId === node.id);

  const status = node.testStatus ?? "untested";
  const statusConfig = STATUS_CONFIG[status];
  const typeConfig = NODE_TYPE_CONFIG[node.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-72 surface-1 border-l border-border flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {node.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {typeConfig?.label ?? node.type}
            </Badge>
            <div className="flex items-center gap-1">
              <StatusDot status={status === "untested" ? "untested" : status} size="sm" />
              <span className="text-[10px] text-muted-foreground">
                {statusConfig.label}
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* File Path */}
          {node.filePath && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-1">
                File Path
              </span>
              <div className="flex items-start gap-1.5">
                <FileCode2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-xs text-foreground/80 break-all font-mono">
                  {node.filePath}
                </span>
              </div>
            </div>
          )}

          {/* Test Status Summary */}
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-1">
              Test Coverage
            </span>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: `${statusConfig.color}10` }}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: statusConfig.color }}
              />
              <span className="text-xs font-medium text-foreground">
                {statusConfig.label}
              </span>
            </div>
          </div>

          {/* Outgoing Connections */}
          {outgoing.length > 0 && (
            <ConnectionList
              title="Depends On"
              edges={outgoing}
              nodeMap={nodeMap}
              direction="outgoing"
              onSelect={onSelectNode}
            />
          )}

          {/* Incoming Connections */}
          {incoming.length > 0 && (
            <ConnectionList
              title="Used By"
              edges={incoming}
              nodeMap={nodeMap}
              direction="incoming"
              onSelect={onSelectNode}
            />
          )}

          {/* View Tests Placeholder */}
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              disabled
            >
              <ExternalLink className="h-3 w-3" />
              View Tests
            </Button>
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  );
}

interface ConnectionListProps {
  title: string;
  edges: MapEdge[];
  nodeMap: Map<string, MapNode>;
  direction: "outgoing" | "incoming";
  onSelect: (nodeId: string) => void;
}

function ConnectionList({
  title,
  edges,
  nodeMap,
  direction,
  onSelect,
}: ConnectionListProps) {
  return (
    <div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-1.5">
        {title} ({edges.length})
      </span>
      <div className="space-y-1">
        {edges.map((edge) => {
          const targetId =
            direction === "outgoing" ? edge.targetId : edge.sourceId;
          const connectedNode = nodeMap.get(targetId);
          if (!connectedNode) return null;

          return (
            <button
              key={edge.id}
              onClick={() => onSelect(targetId)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                "hover:bg-secondary/50 transition-colors"
              )}
            >
              <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-foreground truncate block">
                  {connectedNode.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {edge.relationship}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
