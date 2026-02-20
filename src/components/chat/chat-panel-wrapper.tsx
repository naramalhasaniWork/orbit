"use client";

import { useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";

interface ChatPanelWrapperProps {
  projects: Array<{ id: string }>;
}

/**
 * Reads the selected project from URL search params and renders
 * the ChatPanel with the appropriate projectId.
 */
export function ChatPanelWrapper({ projects }: ChatPanelWrapperProps) {
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get("project");

  const projectId = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)?.id ?? projects[0]?.id
    : projects[0]?.id;

  if (!projectId) return null;

  return <ChatPanel projectId={projectId} />;
}
