/**
 * Code Reviewer Sub-Agent Prompt
 * Reviews code changes for quality, security, and best practices.
 * Used by the analyst to validate code patterns and detect issues.
 */

import { buildPrompt } from "@/agents/prompts/prompt-builder";

export interface CodeReviewerContext {
  /** Files being reviewed */
  files: Array<{
    path: string;
    content: string;
    diff?: string;
    changeType?: "added" | "modified" | "deleted";
  }>;
  /** Framework context */
  framework: string;
  /** Language */
  language: string;
  /** Focus areas for the review */
  focusAreas?: Array<"security" | "performance" | "testing" | "best-practices" | "accessibility">;
  /** Known patterns to check against */
  knownPatterns?: Array<{
    pattern: string;
    severity: string;
    description: string;
  }>;
}

export function buildCodeReviewerPrompt(
  context: CodeReviewerContext
): string {
  const {
    files,
    framework,
    language,
    focusAreas,
    knownPatterns,
  } = context;

  const filesStr = files
    .map((f) => {
      const header = f.changeType
        ? `### [${f.changeType.toUpperCase()}] ${f.path}`
        : `### ${f.path}`;
      const content = f.diff ?? f.content;
      return `${header}\n\`\`\`${language.toLowerCase()}\n${content.slice(0, 3000)}\n\`\`\``;
    })
    .join("\n\n");

  const focusStr = focusAreas?.length
    ? focusAreas.map((area) => `  - ${area}`).join("\n")
    : "  - all areas";

  const patternsStr = knownPatterns?.length
    ? knownPatterns
        .map((p) => `  - [${p.severity}] ${p.pattern}: ${p.description}`)
        .join("\n")
    : "  (none)";

  const agentInstructions = `## Sub-Agent Role: Code Reviewer
You review code changes for quality, security vulnerabilities, performance issues, and best practice violations. You produce actionable findings that help improve test coverage.

## Context
- **Framework:** ${framework}
- **Language:** ${language}

## Focus Areas
${focusStr}

## Known Patterns to Check
${patternsStr}

## Files to Review
${filesStr}

## Output Schema
Your response MUST be valid JSON:
{
  "findings": [
    {
      "file": "file path",
      "line": 0,
      "severity": "critical | high | medium | low | info",
      "category": "security | performance | testing | best-practice | accessibility | bug",
      "title": "Short finding title",
      "description": "Detailed description of the issue",
      "suggestion": "How to fix it",
      "testImplication": "What test should be written to cover this"
    }
  ],
  "securityIssues": [
    {
      "file": "file path",
      "vulnerability": "XSS | SQLi | CSRF | auth-bypass | secret-exposure | etc",
      "description": "Description",
      "severity": "critical | high | medium | low"
    }
  ],
  "testSuggestions": [
    {
      "description": "What test to add",
      "targetFile": "file that needs testing",
      "priority": 1-100
    }
  ],
  "summary": "Overall code quality assessment"
}

## Review Checklist
1. **Security:** Input validation, SQL injection, XSS, CSRF, auth bypass, secret exposure, insecure defaults.
2. **Performance:** N+1 queries, missing indexes, unnecessary re-renders, large bundle imports.
3. **Error handling:** Missing try/catch, unhandled promise rejections, generic error messages.
4. **Type safety:** Uses of \`any\`, missing null checks, type assertions without validation.
5. **Testing gaps:** Untested branches, missing edge case coverage, hardcoded test data.
6. **Best practices:** Framework-specific conventions, naming, documentation.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "analyst",
    agentInstructions,
    maxOutputTokens: 2000,
  });

  return systemPrompt;
}
