"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PromptPhaseEditor, type PhaseData } from "@/components/admin/prompt-phase-editor";

interface PromptsClientProps {
  initialPrompts: Record<string, PhaseData>;
}

const PHASE_LABELS: Record<string, string> = {
  analyst: "Analyst",
  planner: "Planner",
  executor: "Executor",
  reporter: "Reporter",
  auditor: "Auditor",
};

export function PromptsClient({ initialPrompts }: PromptsClientProps) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [activeTab, setActiveTab] = useState("analyst");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Global Prompts</h2>
        <p className="text-sm text-muted-foreground">
          Manage default system prompts for each agent phase. These apply to all workspaces without custom overrides.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {Object.entries(PHASE_LABELS).map(([key, label]) => (
            <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(PHASE_LABELS).map(([phase]) => (
          <TabsContent key={phase} value={phase}>
            <PromptPhaseEditor
              phase={phase}
              data={prompts[phase]}
              onSaved={(updated) => setPrompts((prev) => ({ ...prev, [phase]: updated }))}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
