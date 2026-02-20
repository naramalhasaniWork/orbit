"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Trash2,
  FileText,
  BookOpen,
  Palette,
  Shield,
  KeyRound,
  Code,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface KnowledgeFile {
  id: string;
  name: string;
  type: string;
  sizeBytes: number;
  chunkCount: number;
  createdAt: string;
}

interface KnowledgeUploadProps {
  workspaceId: string;
  initialFiles?: KnowledgeFile[];
}

const FILE_TYPES = [
  { value: "openapi", label: "API Documentation", icon: Code },
  { value: "markdown", label: "Documentation", icon: FileText },
  { value: "design_system", label: "Design System", icon: Palette },
  { value: "business_rules", label: "Business Rules", icon: Shield },
  { value: "test_credentials", label: "Test Credentials", icon: KeyRound },
  { value: "other", label: "Other", icon: BookOpen },
] as const;

const TYPE_BADGE_COLORS: Record<string, string> = {
  openapi: "bg-blue-500/15 text-blue-400",
  markdown: "bg-emerald-500/15 text-emerald-400",
  design_system: "bg-violet-500/15 text-violet-400",
  business_rules: "bg-amber-500/15 text-amber-400",
  test_credentials: "bg-red-500/15 text-red-400",
  other: "bg-zinc-500/15 text-zinc-400",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTypeIcon(type: string) {
  const found = FILE_TYPES.find((t) => t.value === type);
  return found?.icon ?? BookOpen;
}

function getTypeLabel(type: string): string {
  const found = FILE_TYPES.find((t) => t.value === type);
  return found?.label ?? "Other";
}

export function KnowledgeUpload({ workspaceId, initialFiles = [] }: KnowledgeUploadProps) {
  const [files, setFiles] = useState<KnowledgeFile[]>(initialFiles);
  const [selectedType, setSelectedType] = useState<string>("markdown");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  async function uploadFile(file: File) {
    clearMessages();
    setUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", selectedType);

      setUploadProgress(30);

      const res = await fetch(`/api/workspaces/${workspaceId}/knowledge`, {
        method: "POST",
        body: formData,
      });

      setUploadProgress(80);

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message ?? "Upload failed");
      }

      const { data } = await res.json();
      setFiles((prev) => [data, ...prev]);
      setUploadProgress(100);
      setSuccess(`"${file.name}" uploaded and chunked into ${data.chunkCount} pieces.`);

      // Clear success message after 4 seconds
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 500);
    }
  }

  async function handleDelete(fileId: string, fileName: string) {
    clearMessages();
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/knowledge?fileId=${fileId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message ?? "Delete failed");
      }

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setSuccess(`"${fileName}" deleted.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) uploadFile(droppedFile);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) uploadFile(selected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          Upload domain knowledge files to give Orbit&apos;s agents context about your application.
          Files are chunked, embedded, and injected into agent prompts via RAG retrieval.
        </p>
      </div>

      {/* Type selector */}
      <div className="flex flex-wrap gap-1.5">
        {FILE_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.value}
              onClick={() => setSelectedType(type.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedType === type.value
                  ? "bg-white/[0.08] text-foreground ring-1 ring-white/[0.12]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              }`}
            >
              <Icon className="h-3 w-3" />
              {type.label}
            </button>
          );
        })}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-orbit-accent/60 bg-orbit-accent/5"
            : "border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,.json,.yaml,.yml,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 text-orbit-accent mx-auto animate-spin" />
            <p className="text-sm text-muted-foreground">Processing file...</p>
            <div className="w-48 mx-auto h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-orbit-accent rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Drop a file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Supports .md, .txt, .json, .yaml, .pdf (max 10 MB)
            </p>
          </>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          {success}
        </div>
      )}

      {/* File list */}
      <div className="space-y-2">
        {files.length === 0 ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No knowledge files uploaded yet.
            </p>
          </div>
        ) : (
          files.map((file) => {
            const TypeIcon = getTypeIcon(file.type);
            return (
              <div
                key={file.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl surface-1"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">
                      {file.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          TYPE_BADGE_COLORS[file.type] ?? TYPE_BADGE_COLORS.other
                        }`}
                      >
                        {getTypeLabel(file.type)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(file.sizeBytes)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {file.chunkCount} chunks
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-red-400 shrink-0"
                  onClick={() => handleDelete(file.id, file.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
