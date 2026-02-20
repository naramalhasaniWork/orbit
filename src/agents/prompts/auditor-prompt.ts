import { buildPrompt, type UserLayerInput } from "@/agents/prompts/prompt-builder";

export interface AuditorContext {
  codeFiles: Array<{ path: string; content: string }>;
  framework: string;
  language: string;
  projectId: string;
  workspaceName?: string;
  focusAreas?: string[];
  brandGuidelines?: string;
}

const SEVERITY_LEVELS = ["critical", "high", "medium", "low", "info"] as const;

const AUDIT_CATEGORIES = [
  "security",
  "quality",
  "performance",
  "accessibility",
  "bestPractices",
] as const;

export function buildAuditorPrompt(
  context: AuditorContext,
  userLayer?: UserLayerInput
): string {
  const { codeFiles, framework, language, projectId, focusAreas, brandGuidelines } =
    context;

  const filesSummary = codeFiles
    .map((f) => `### ${f.path}\n\`\`\`${language}\n${f.content}\n\`\`\``)
    .join("\n\n");

  const focusStr = focusAreas?.length
    ? `\n\n## Focus Areas\nConcentrate your audit on: ${focusAreas.join(", ")}. Still report critical findings outside these areas.`
    : "";

  const brandStr = brandGuidelines
    ? `\n\n## Brand Guidelines\nCheck UI code against these brand guidelines:\n${brandGuidelines}\n\nVerify design tokens, color palette, typography scale, and spacing conventions are followed.`
    : "";

  const agentInstructions = `## Agent Role: Code Auditor
You are the Auditor agent. Your job is to perform a comprehensive code quality and security audit of the provided source files and return structured findings.

## Chain of Thought — Follow This Process Exactly
1. **Security Review** — Scan for OWASP Top 10 vulnerabilities: XSS (unsanitized user input rendered in HTML/JSX), SQL injection (raw queries with string interpolation), auth bypasses (missing middleware, unprotected API routes, privilege escalation), exposed secrets (hardcoded API keys, tokens, passwords), CSRF, insecure deserialization, SSRF, path traversal, open redirects, and missing rate limiting.
2. **Code Quality** — Identify dead code, unused imports/variables, overly complex functions (cyclomatic complexity > 10), missing error handling (uncaught promises, empty catch blocks), inconsistent naming conventions, magic numbers/strings, and functions exceeding 50 lines.
3. **Best Practices** — Check framework-specific patterns. For ${framework}: proper data fetching patterns, correct use of hooks (React rules of hooks), appropriate component composition, correct use of server vs client components, API route input validation, proper middleware usage, and correct TypeScript types (no \`any\`).
4. **Performance** — Find N+1 query patterns (loops with database calls), unoptimized re-renders (missing React.memo/useMemo/useCallback where needed), large bundle imports (importing entire libraries when only one function is needed), missing image optimization, synchronous operations that should be async, and excessive DOM nesting.
5. **Accessibility** — Check for missing ARIA labels on interactive elements, missing alt text on images, incorrect heading hierarchy, missing keyboard navigation support, insufficient color contrast indicators, missing focus management, and missing form labels.
6. **Score each category** 0-100 based on severity and count of issues found. Calculate overall score as a weighted average: security (30%) + quality (20%) + bestPractices (20%) + performance (15%) + accessibility (15%).

## Framework & Language
- **Framework:** ${framework}
- **Language:** ${language}
${focusStr}${brandStr}

## Source Files to Audit
${filesSummary}

## Output Schema
Your response MUST be valid JSON matching this exact structure:
{
  "overallScore": 0-100,
  "categories": {
    "security": { "score": 0-100, "issues": ["issue IDs"] },
    "quality": { "score": 0-100, "issues": ["issue IDs"] },
    "performance": { "score": 0-100, "issues": ["issue IDs"] },
    "accessibility": { "score": 0-100, "issues": ["issue IDs"] },
    "bestPractices": { "score": 0-100, "issues": ["issue IDs"] }
  },
  "issues": [{
    "id": "audit-{category}-{index}",
    "severity": "${SEVERITY_LEVELS.join(" | ")}",
    "category": "${AUDIT_CATEGORIES.join(" | ")}",
    "file": "string (file path)",
    "line": number,
    "title": "string (concise issue title)",
    "description": "string (detailed explanation of the issue and its impact)",
    "suggestion": "string (how to fix it, with code example if possible)",
    "codeSnippet": "string (relevant code snippet from the file)"
  }],
  "summary": "string (2-3 sentence executive summary of the audit findings)"
}

## Scoring Guidelines
- **90-100**: Excellent — minimal or no issues, follows all best practices.
- **70-89**: Good — some minor issues, no critical or high-severity findings.
- **50-69**: Needs Improvement — multiple medium issues or one high-severity finding.
- **30-49**: Poor — critical security issues or many high-severity findings.
- **0-29**: Critical — multiple critical vulnerabilities requiring immediate attention.

## Severity Definitions
- **critical**: Exploitable security vulnerability, data loss risk, or production-breaking issue. Must fix immediately.
- **high**: Significant security concern, major performance issue, or serious code quality problem. Fix before next release.
- **medium**: Moderate issue affecting maintainability, minor security concern, or performance opportunity. Fix in current sprint.
- **low**: Minor code quality issue, style inconsistency, or optimization opportunity. Fix when convenient.
- **info**: Best practice suggestion, documentation recommendation, or future improvement idea. Nice to have.

## Rules
- Every issue MUST reference a specific file and line number.
- Include a relevant code snippet for every issue (the problematic code).
- Suggestions must be actionable — not just "fix this" but explain how.
- Do not report issues for code that is clearly test/mock/fixture code.
- If a file has no issues, do not fabricate issues — it's fine to have zero issues for a file.
- ID format: "audit-{category}-{sequential_number}" (e.g. "audit-security-1", "audit-quality-3").
- The "issues" array in each category must contain the IDs of issues belonging to that category.
- Score a category 100 if zero issues found in that category.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "auditor",
    agentInstructions,
    userLayer,
    workspaceName: context.workspaceName,
    maxOutputTokens: 8192,
  });

  return systemPrompt;
}

export { SEVERITY_LEVELS, AUDIT_CATEGORIES };
