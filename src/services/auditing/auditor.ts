import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { buildAuditorPrompt } from "@/agents/prompts/auditor-prompt";
import { AuditResultOutputSchema } from "@/agents/schemas/audit-result";
import type { AuditIssue, AuditResultOutput } from "@/agents/schemas/audit-result";
import type { Prisma } from "@/generated/prisma/client";

interface AuditInput {
  projectId: string;
  runId?: string;
  focusAreas?: string[];
  filePaths?: string[];
  maxFiles?: number;
}

interface AuditResult {
  id: string;
  overallScore: number;
  categories: Record<string, { score: number; issues: string[] }>;
  issues: AuditIssue[];
  tokensUsed: { input: number; output: number };
}

/**
 * Run a code quality audit against indexed project files.
 * Loads code from storage, builds an auditor prompt, and parses
 * the structured JSON output from the LLM.
 */
export async function runCodeAudit(input: AuditInput): Promise<AuditResult> {
  const { projectId, runId, focusAreas, filePaths, maxFiles = 30 } = input;

  // Load project metadata
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      framework: true,
      defaultBranch: true,
      repoOwner: true,
      repoName: true,
      workspaceId: true,
      workspace: { select: { name: true } },
    },
  });

  // Determine which files to audit
  const codeFiles = await loadCodeFiles(
    projectId,
    project.defaultBranch,
    filePaths,
    maxFiles
  );

  if (codeFiles.length === 0) {
    throw new Error("No code files found to audit. Index the repository first.");
  }

  const framework = project.framework ?? "unknown";
  const language = detectLanguage(codeFiles);

  // Build the auditor prompt
  const systemPrompt = buildAuditorPrompt({
    codeFiles,
    framework,
    language,
    projectId,
    workspaceName: project.workspace.name,
    focusAreas,
  });

  // Call the LLM
  const model = await getModelForTask("code_audit", project.workspaceId);

  const completion = await createTrackedCompletion(
    {
      model,
      systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Audit the provided source files and return the structured JSON audit result.",
        },
      ],
      maxTokens: 8192,
      temperature: 0.1,
    },
    {
      workspaceId: project.workspaceId,
      projectId,
      runId,
      agentPhase: "auditor",
    }
  );

  // Parse and validate the response
  const parsed = parseAuditOutput(completion.content);

  // Persist to database
  const auditRecord = await prisma.auditResult.create({
    data: {
      projectId,
      runId,
      overallScore: parsed.overallScore,
      categories: JSON.parse(JSON.stringify(parsed.categories)) as Prisma.InputJsonValue,
      issues: JSON.parse(JSON.stringify(parsed.issues)) as Prisma.InputJsonValue,
      issueCount: parsed.issues.length,
      criticalCount: parsed.issues.filter((i) => i.severity === "critical")
        .length,
      metadata: {
        model,
        filesAudited: codeFiles.length,
        focusAreas: focusAreas ?? [],
        framework,
        language,
      },
    },
  });

  return {
    id: auditRecord.id,
    overallScore: parsed.overallScore,
    categories: parsed.categories,
    issues: parsed.issues,
    tokensUsed: {
      input: completion.usage.inputTokens,
      output: completion.usage.outputTokens,
    },
  };
}

/**
 * Load code files from storage using the system map for file discovery.
 */
async function loadCodeFiles(
  projectId: string,
  branch: string,
  filePaths: string[] | undefined,
  maxFiles: number
): Promise<Array<{ path: string; content: string }>> {
  const storage = getStorage();
  const storagePrefix = `repos/${projectId}/${branch}`;

  // Determine which files to load
  let targetPaths: string[];

  if (filePaths && filePaths.length > 0) {
    targetPaths = filePaths.slice(0, maxFiles);
  } else {
    // Get file paths from the system map
    const nodes = await prisma.systemMapNode.findMany({
      where: { projectId },
      select: { filePath: true },
      orderBy: { updatedAt: "desc" },
    });

    // Deduplicate and limit
    const unique = Array.from(new Set(nodes.map((n) => n.filePath)));
    targetPaths = unique.slice(0, maxFiles);
  }

  // Load file contents from storage
  const results: Array<{ path: string; content: string }> = [];

  for (const filePath of targetPaths) {
    try {
      const storageKey = `${storagePrefix}/${filePath}`;
      const buffer = await storage.download(storageKey);
      const content = buffer.toString("utf-8");

      // Skip very large files (> 50KB) to fit within token budget
      if (content.length > 50_000) continue;

      results.push({ path: filePath, content });
    } catch {
      // File may not exist in storage — skip silently
      continue;
    }
  }

  return results;
}

/**
 * Detect the primary language from file extensions.
 */
function detectLanguage(
  files: Array<{ path: string }>
): string {
  const extCounts: Record<string, number> = {};

  for (const file of files) {
    const ext = file.path.substring(file.path.lastIndexOf("."));
    extCounts[ext] = (extCounts[ext] ?? 0) + 1;
  }

  const sorted = Object.entries(extCounts).sort((a, b) => b[1] - a[1]);
  const topExt = sorted[0]?.[0] ?? ".ts";

  const langMap: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".rb": "Ruby",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".vue": "Vue",
    ".svelte": "Svelte",
  };

  return langMap[topExt] ?? "TypeScript";
}

/**
 * Parse and validate the LLM output as an AuditResultOutput.
 */
function parseAuditOutput(content: string): AuditResultOutput {
  // Strip markdown code fences if present
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  const raw = JSON.parse(cleaned);
  return AuditResultOutputSchema.parse(raw);
}
