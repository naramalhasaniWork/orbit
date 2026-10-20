"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { useShortcutAction } from "@/components/shortcuts/shortcut-provider";
import type { ShortcutId } from "@/lib/shortcuts/registry";
import { Input } from "@/components/ui/input";
import {
  Play,
  Search,
  BarChart3,
  FolderGit2,
  TestTube2,
  Map as MapIcon,
  Settings,
  FileText,
  Zap,
  ArrowRight,
  Command,
} from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  category: "navigation" | "action" | "project";
  shortcutId?: ShortcutId;
  href?: string;
  action?: () => void;
}

interface QuickActionsProps {
  projectId?: string;
  projectName?: string;
  onTriggerRun?: () => void;
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function QuickActions({
  projectId,
  projectName,
  onTriggerRun,
}: QuickActionsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Build actions list
  const actions: QuickAction[] = useMemo(() => {
    const items: QuickAction[] = [
      {
        id: "trigger-run",
        label: "Trigger Test Run",
        description: "Start a new test run for the current project",
        icon: Play,
        category: "action",
        shortcutId: "run",
        action: () => {
          onTriggerRun?.();
          setOpen(false);
        },
      },
      {
        id: "view-results",
        label: "View Latest Results",
        description: "See results from the most recent test run",
        icon: BarChart3,
        category: "navigation",
        shortcutId: "latest",
        href: "/dashboard/runs",
      },
      {
        id: "system-map",
        label: "Open System Map",
        description: "View the system architecture map",
        icon: MapIcon,
        category: "navigation",
        shortcutId: "map",
        href: "/dashboard/map",
      },
      {
        id: "test-plans",
        label: "Test Plans",
        description: "View and manage test plans",
        icon: FileText,
        category: "navigation",
        shortcutId: "go-plans",
        href: "/dashboard/plans",
      },
      {
        id: "runs",
        label: "All Runs",
        description: "Browse test run history",
        icon: TestTube2,
        category: "navigation",
        shortcutId: "go-runs",
        href: "/dashboard/runs",
      },
      {
        id: "settings",
        label: "Settings",
        description: "Project and workspace settings",
        icon: Settings,
        category: "navigation",
        shortcutId: "settings",
        href: "/dashboard/settings",
      },
      {
        id: "onboarding",
        label: "Connect Repository",
        description: "Set up a new project",
        icon: FolderGit2,
        category: "project",
        href: "/dashboard/onboarding",
      },
    ];

    if (projectId) {
      items.push({
        id: "quick-run-smoke",
        label: "Quick Smoke Test",
        description: `Run smoke tests for ${projectName ?? "project"}`,
        icon: Zap,
        category: "action",
        action: () => {
          onTriggerRun?.();
          setOpen(false);
        },
      });
    }

    return items;
  }, [projectId, projectName, onTriggerRun]);

  // Filter actions by query
  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.includes(q)
    );
  }, [actions, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, QuickAction[]> = {};
    for (const action of filtered) {
      if (!groups[action.category]) {
        groups[action.category] = [];
      }
      groups[action.category].push(action);
    }
    return groups;
  }, [filtered]);

  // Flatten for keyboard nav
  const flatList = useMemo(() => {
    const items: QuickAction[] = [];
    for (const key of Object.keys(grouped)) {
      items.push(...grouped[key]);
    }
    return items;
  }, [grouped]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Execute action
  const executeAction = useCallback(
    (action: QuickAction) => {
      if (action.action) {
        action.action();
      } else if (action.href) {
        router.push(action.href);
        setOpen(false);
      }
    },
    [router]
  );

  // Cmd/Ctrl+K is bound globally by the ShortcutProvider
  useShortcutAction("palette", () => setOpen((prev) => !prev));

  // Keyboard navigation inside dialog
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const action = flatList[selectedIndex];
        if (action) executeAction(action);
      }
    },
    [flatList, selectedIndex, executeAction]
  );

  const categoryLabels: Record<string, string> = {
    action: "Actions",
    navigation: "Navigate",
    project: "Projects",
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Search and commands"
        className={cn(
          "flex items-center justify-center gap-2 h-8 min-w-8 px-2 sm:px-3 sm:py-1.5 rounded-lg",
          "border border-border bg-foreground/[0.03]",
          "text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]",
          "transition-all duration-200"
        )}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline text-xs">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-foreground/[0.08] text-[10px] font-mono text-muted-foreground">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      {/* Command palette dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg p-0 gap-0 overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search for a page or action. Use the arrow keys to move and Enter to select.
          </DialogDescription>
          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-transparent px-0 h-auto text-sm"
              autoFocus
            />
          </div>

          {/* Results */}
          <div className="max-h-[320px] overflow-y-auto py-2">
            {flatList.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results found for &ldquo;{query}&rdquo;
              </div>
            )}

            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1.5">
                  <span className=" text-muted-foreground tm-label">
                    {categoryLabels[category] ?? category}
                  </span>
                </div>
                {items.map((action: QuickAction) => {
                  const globalIdx = flatList.indexOf(action);
                  const isSelected = globalIdx === selectedIndex;

                  return (
                    <button
                      key={action.id}
                      onClick={() => executeAction(action)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors",
                        isSelected
                          ? "bg-foreground/[0.06]"
                          : "hover:bg-foreground/[0.04]"
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center h-7 w-7 rounded-md shrink-0",
                          isSelected
                            ? "bg-foreground/[0.06] text-foreground"
                            : "bg-foreground/[0.06] text-muted-foreground"
                        )}
                      >
                        <action.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground block">
                          {action.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground block truncate">
                          {action.description}
                        </span>
                      </div>
                      {action.shortcutId && <ShortcutKeys id={action.shortcutId} className="shrink-0" />}
                      {isSelected && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-foreground/[0.06] font-mono">&#8593;&#8595;</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-foreground/[0.06] font-mono">&#9166;</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-foreground/[0.06] font-mono">esc</kbd>
              close
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
