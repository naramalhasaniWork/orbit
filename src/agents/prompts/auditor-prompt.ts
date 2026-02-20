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

function buildOwaspDeepDive(): string {
  return `## OWASP Top 10 Deep Dive — Check Each Systematically
### A01: Broken Access Control
- Missing auth middleware on API routes (does every handler verify the user?)
- Missing authorization (user accesses another user's data by changing IDs)
- Direct object reference without ownership verification
- Missing or overly permissive CORS configuration
- Force browsing to admin pages without role verification

### A02: Cryptographic Failures
- Hardcoded secrets, API keys, or tokens in source code
- Sensitive data in localStorage (should use httpOnly cookies)
- HTTP instead of HTTPS for API calls
- Weak hashing (MD5, SHA1 for passwords — should be bcrypt/argon2)
- Sensitive data in URL query parameters

### A03: Injection
- SQL injection: raw queries with string interpolation instead of parameterized
- NoSQL injection: unsanitized input in MongoDB queries
- XSS: user input rendered without sanitization in HTML/JSX
- Command injection: user input passed to shell commands
- Path traversal: user input in file paths without sanitization

### A04: Insecure Design
- Missing rate limiting on auth endpoints
- No CSRF protection on state-changing operations
- Missing input validation on API routes (no schema validation)
- Business logic flaws: skippable steps in multi-step flows

### A05: Security Misconfiguration
- Debug mode enabled, verbose error messages exposing internals
- Missing security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- Unnecessary features enabled in production

### A06: Vulnerable Components
- Known vulnerable package versions or deprecated APIs

### A07: Auth Failures
- No account lockout after failed attempts
- Weak password requirements
- Non-expiring session tokens
- Missing logout / token invalidation

### A08: Data Integrity Failures
- Unvalidated redirects without allowlist
- Deserialization of untrusted data without validation

### A09: Logging Failures
- Sensitive data logged (passwords, tokens, PII)
- No audit trail for critical operations
- Stack traces exposed to end users

### A10: SSRF
- User-controlled URLs fetched server-side without validation
- Webhook URLs not validated against internal network ranges`;
}

function buildOutputSchema(): string {
  return `## Output Schema
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
    "line": "number",
    "title": "string (concise issue title)",
    "description": "string (detailed explanation and impact)",
    "suggestion": "string (how to fix, with code example if possible)",
    "codeSnippet": "string (relevant code from the file)",
    "confidence": "number 0-100",
    "owaspCategory": "string (A01-A10 if applicable, null otherwise)"
  }],
  "summary": "string (2-3 sentence executive summary)"
}`;
}

export function buildAuditorPrompt(
  context: AuditorContext,
  userLayer?: UserLayerInput
): string {
  const { codeFiles, framework, language, focusAreas, brandGuidelines } = context;

  const filesSummary = codeFiles
    .map((f) => `### ${f.path}\n\`\`\`${language}\n${f.content}\n\`\`\``)
    .join("\n\n");

  const focusStr = focusAreas?.length
    ? `\n\n## Focus Areas\nConcentrate on: ${focusAreas.join(", ")}. Still report critical/high findings outside these areas.`
    : "";

  const brandStr = brandGuidelines
    ? `\n\n## Brand Guidelines\nCheck UI code against:\n${brandGuidelines}\n\nVerify design tokens, color palette, typography, and spacing conventions.`
    : "";

  const agentInstructions = `## Agent Role: Code Auditor
You perform a comprehensive code quality and security audit. Think like a senior security engineer doing a penetration test review combined with a principal engineer doing an architecture review.

## Chain of Thought — Follow This Process Exactly
1. **Security Review (weight: 30%)** — Scan for OWASP Top 10 using the checklist below. Check EVERY file.
2. **Code Quality (weight: 20%)** — Dead code, unused imports, complexity > 10, missing error handling, empty catch blocks, inconsistent naming, magic numbers, functions > 50 lines.
3. **Best Practices (weight: 20%)** — ${framework}-specific patterns: data fetching, hooks/lifecycle, component composition, server vs client components, API input validation, middleware, TypeScript types (no any).
4. **Performance (weight: 15%)** — N+1 queries, unoptimized re-renders, large bundle imports, missing image optimization, sync operations that should be async, excessive DOM nesting.
5. **Accessibility (weight: 15%)** — Missing ARIA labels, missing alt text, incorrect heading hierarchy, missing keyboard navigation, insufficient contrast, missing focus management, missing form labels.
6. **Score each category** 0-100. Overall = security(30%) + quality(20%) + bestPractices(20%) + performance(15%) + accessibility(15%).

## Anti-Hallucination Rules
- NEVER report issues for test/mock/fixture code.
- NEVER fabricate issues — zero issues for a file is valid.
- Every issue MUST reference a specific file and line number from the provided code.
- Only report findings with confidence >= 70. Mark 50-69 as "needs_verification".
- Code snippets MUST be copied from the actual provided code, not invented.

${buildOwaspDeepDive()}

## Framework & Language
- **Framework:** ${framework}
- **Language:** ${language}
${focusStr}${brandStr}

## Source Files to Audit
${filesSummary}

${buildOutputSchema()}

## Scoring Guidelines
- **90-100**: Excellent — minimal issues, follows best practices.
- **70-89**: Good — minor issues, no critical or high findings.
- **50-69**: Needs Improvement — multiple medium or one high finding.
- **30-49**: Poor — critical security issues or many high findings.
- **0-29**: Critical — multiple critical vulnerabilities.

## Severity Definitions
- **critical**: Exploitable vulnerability, data loss risk, production-breaking. Fix immediately.
- **high**: Significant security/performance/quality concern. Fix before next release.
- **medium**: Moderate maintainability/security issue. Fix in current sprint.
- **low**: Minor quality/style issue. Fix when convenient.
- **info**: Best practice suggestion. Nice to have.

## Rules
- Include a relevant code snippet for every issue.
- Suggestions must be actionable with concrete code examples when possible.
- ID format: "audit-{category}-{sequential_number}".
- The "issues" array in each category must list IDs belonging to that category.
- Score a category 100 if zero issues found.
- Include owaspCategory (e.g., "A01", "A03") when a security issue maps to OWASP.`;

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
