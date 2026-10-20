import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { resolveGitHubToken } from "@/lib/github/token";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { buildAuditorPrompt } from "@/agents/prompts/auditor-prompt";
import { AuditResultOutputSchema } from "@/agents/schemas/audit-result";
import type { AuditIssue, AuditResultOutput } from "@/agents/schemas/audit-result";
import type { Prisma } from "@/generated/prisma/client";

/** The audit can't run for a reason the user can fix (shown verbatim, 409). */
export class AuditUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditUnavailableError";
  }
}

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
    maxFiles,
    project.repoOwner,
    project.repoName
  );

  if (codeFiles.length === 0) {
    throw new AuditUnavailableError("No code files found to audit. Index the repository first.");
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
 * Falls back to GitHub API if storage returns no files.
 */
async function loadCodeFiles(
  projectId: string,
  branch: string,
  filePaths: string[] | undefined,
  maxFiles: number,
  repoOwner: string,
  repoName: string
): Promise<Array<{ path: string; content: string }>> {
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

  // Try loading from storage first
  const storage = getStorage();
  const storagePrefix = `repos/${projectId}/${branch}`;
  const results: Array<{ path: string; content: string }> = [];

  for (const filePath of targetPaths) {
    try {
      const storageKey = `${storagePrefix}/${filePath}`;
      const buffer = await storage.download(storageKey);
      const content = buffer.toString("utf-8");

      if (content.length > 50_000) continue;
      results.push({ path: filePath, content });
    } catch {
      continue;
    }
  }

  if (results.length > 0) return results;

  // Fallback: fetch files from GitHub with the same token resolution as
  // indexing (App installation, then OAuth, then env)
  const resolved = await resolveGitHubToken(projectId);
  if (!resolved) {
    throw new AuditUnavailableError(
      "The repository files aren't available and Orbit has no GitHub access for this project. Reconnect GitHub and re-index."
    );
  }
  const token = resolved.token;

  for (const filePath of targetPaths) {
    const content = await fetchFromGitHub(repoOwner, repoName, filePath, branch, token);
    if (!content) continue;
    if (content.length > 50_000) continue;
    results.push({ path: filePath, content });
  }

  return results;
}

/**
 * Fetch a single file's content from the GitHub API.
 */
async function fetchFromGitHub(
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
  token: string
): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;

    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
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

  try {
    return AuditResultOutputSchema.parse(JSON.parse(cleaned));
  } catch {
    throw new AuditUnavailableError(
      "The audit model returned a result Orbit couldn't read. Try again, or audit fewer files."
    );
  }
}
