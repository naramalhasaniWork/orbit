"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PromptVersionData {
  id: string;
  version: number;
  changelog: string | null;
  createdAt: string;
  promptType: string;
  content: string;
}

interface PromptVersionHistoryProps {
  workspaceId: string;
  agentPhase: string;
  onRestore: (versionId: string) => void;
  disabled: boolean;
}

export function PromptVersionHistory({
  workspaceId,
  agentPhase,
  onRestore,
  disabled,
}: PromptVersionHistoryProps) {
  const [versions, setVersions] = useState<PromptVersionData[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/prompts/${agentPhase}/versions`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setVersions(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, agentPhase]);

  useEffect(() => {
    if (showVersions && versions.length === 0) {
      fetchVersions();
    }
  }, [showVersions, versions.length, fetchVersions]);

  return (
    <div className="border-t border-white/[0.06] pt-3">
      <button
        type="button"
        onClick={() => setShowVersions(!showVersions)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showVersions ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <History className="h-3 w-3" />
        Version History
      </button>

      {showVersions && (
        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No version history yet.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02]"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">v{v.version}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                  {v.changelog && (
                    <span className="text-xs text-foreground truncate max-w-[200px]">
                      {v.changelog}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() => onRestore(v.id)}
                  disabled={disabled}
                >
                  Restore
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
