import { z } from "zod";

export const AUDIT_SEVERITY_LEVELS = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
} as const;

export const AUDIT_CATEGORIES = {
  security: "security",
  quality: "quality",
  performance: "performance",
  accessibility: "accessibility",
  bestPractices: "bestPractices",
} as const;

export const AuditIssueSchema = z.object({
  id: z.string().describe("Unique identifier (audit-{category}-{index})"),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.enum([
    "security",
    "quality",
    "performance",
    "accessibility",
    "bestPractices",
  ]),
  file: z.string().describe("File path where the issue was found"),
  line: z.number().int().min(0).describe("Line number of the issue"),
  title: z.string().describe("Concise issue title"),
  description: z
    .string()
    .describe("Detailed explanation of the issue and its impact"),
  suggestion: z.string().describe("Actionable fix recommendation"),
  codeSnippet: z
    .string()
    .describe("Relevant code snippet from the file"),
});

export const AuditCategoryResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z.array(z.string()).describe("Issue IDs belonging to this category"),
});

export const AuditResultOutputSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  categories: z.object({
    security: AuditCategoryResultSchema,
    quality: AuditCategoryResultSchema,
    performance: AuditCategoryResultSchema,
    accessibility: AuditCategoryResultSchema,
    bestPractices: AuditCategoryResultSchema,
  }),
  issues: z.array(AuditIssueSchema),
  summary: z.string().describe("Executive summary of the audit findings"),
});

export type AuditIssue = z.infer<typeof AuditIssueSchema>;
export type AuditCategoryResult = z.infer<typeof AuditCategoryResultSchema>;
export type AuditResultOutput = z.infer<typeof AuditResultOutputSchema>;
