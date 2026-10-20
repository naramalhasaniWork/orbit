/**
 * Knowledge Upload API — CRUD for domain knowledge files.
 * GET: List all knowledge files for a workspace
 * POST: Upload and process a new knowledge file
 * DELETE: Remove a knowledge file and its chunks
 */

import { apiSuccess, apiError } from "@/lib/utils/api";
import { getStorage, sanitizeFilename } from "@/lib/storage";
import { chunkDocument } from "@/services/knowledge/chunker";
import { embedChunks } from "@/services/knowledge/embedder";
import type { KnowledgeFileType } from "@/server/data/types";
import { route } from "@/server/http/route";

const ALLOWED_EXTENSIONS = [".md", ".txt", ".json", ".yaml", ".yml", ".pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const VALID_TYPES: KnowledgeFileType[] = [
  "openapi",
  "markdown",
  "design_system",
  "business_rules",
  "test_credentials",
  "other",
];

function isValidType(type: string): type is KnowledgeFileType {
  return VALID_TYPES.includes(type as KnowledgeFileType);
}

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : "";
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".pdf": "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ workspaceId, db }) => {
    const files = await db.domainKnowledgeFile.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        sizeBytes: true,
        chunkCount: true,
        metadata: true,
        createdAt: true,
      },
    });

    return apiSuccess(files);
  }
);

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId, session, db }) => {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("type") as string | null;

    if (!file) {
      return apiError("No file provided", "VALIDATION_ERROR", 400);
    }

    if (!fileType || !isValidType(fileType)) {
      return apiError(
        `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Validate file extension
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return apiError(
        `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return apiError(
        "File too large. Maximum size is 10 MB.",
        "VALIDATION_ERROR",
        400
      );
    }

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = buffer.toString("utf-8");

    // Store file in storage
    const storageKey = `knowledge/${workspaceId}/${Date.now()}-${sanitizeFilename(file.name)}`;
    const storage = getStorage();
    await storage.upload(storageKey, buffer, getContentType(ext));

    // Create the knowledge file record
    const knowledgeFile = await db.domainKnowledgeFile.create({
      data: {
        workspaceId,
        name: file.name,
        type: fileType,
        storageKey,
        sizeBytes: file.size,
        uploadedBy: session.user.id,
        metadata: { originalName: file.name, contentType: getContentType(ext) },
      },
    });

    // Chunk the content
    const chunks = chunkDocument(content, file.name);

    // Generate embeddings and store chunks
    if (chunks.length > 0) {
      await embedChunks(chunks, knowledgeFile.id, workspaceId);
    }

    return apiSuccess(
      {
        id: knowledgeFile.id,
        name: knowledgeFile.name,
        type: knowledgeFile.type,
        sizeBytes: knowledgeFile.sizeBytes,
        chunkCount: chunks.length,
        createdAt: knowledgeFile.createdAt,
      },
      201
    );
  }
);

export const DELETE = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId, db }) => {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return apiError("fileId query parameter is required", "VALIDATION_ERROR", 400);
    }

    // Verify file belongs to this workspace
    const file = await db.domainKnowledgeFile.findFirst({
      where: { id: fileId, workspaceId },
    });

    if (!file) {
      return apiError("Knowledge file not found", "NOT_FOUND", 404);
    }

    // Delete the file (cascade deletes chunks)
    await db.domainKnowledgeFile.delete({
      where: { id: fileId },
    });

    return apiSuccess({ deleted: true });
  }
);
