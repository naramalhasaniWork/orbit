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

function buildFrameworkPatterns(framework: string): string {
  const patterns: string[] = [];

  if (framework.toLowerCase().includes("next")) {
    patterns.push(`### Next.js Patterns to Check
- **Server vs Client Components:** Is "use client" added only when necessary (event handlers, hooks, browser APIs)? Server Components should be the default.
- **Data Fetching:** Are API calls in Server Components using fetch with proper caching? Avoid useEffect for data fetching when Server Components can handle it.
- **Route Handlers:** Do API routes in app/api/ validate input with Zod/schema? Do they check auth?
- **Middleware:** Is middleware.ts properly configured for auth redirect and path matching?
- **Image Optimization:** Using next/image instead of plain <img>? Width/height or fill specified?
- **Metadata:** Are pages using generateMetadata for SEO?
- **Streaming:** Are loading.tsx and Suspense boundaries used for large data fetches?`);
  }

  if (framework.toLowerCase().includes("react") || framework.toLowerCase().includes("next")) {
    patterns.push(`### React Patterns to Check
- **Rules of Hooks:** Are hooks called at the top level (not inside conditions or loops)?
- **Dependency Arrays:** Are useEffect/useMemo/useCallback dependency arrays complete? Missing deps cause stale closures.
- **State Updates:** Are state updates using the functional form when depending on previous state? (setCount(c => c + 1) not setCount(count + 1))
- **Unmount Cleanup:** Do effects that create subscriptions/timers clean them up in the return function?
- **Key Prop:** Are list items using stable, unique keys (not array index unless static list)?
- **Memoization:** Is React.memo/useMemo/useCallback used appropriately (not prematurely, but for expensive renders)?
- **Error Boundaries:** Are error boundaries wrapping sections that might throw?`);
  }

  if (patterns.length === 0) {
    patterns.push(`### General Web Framework Patterns
- Input validation on all API endpoints
- Auth middleware applied consistently
- Error handling with proper HTTP status codes
- Proper async/await usage (no unhandled promises)`);
  }

  return patterns.join("\n\n");
}

function buildFewShotFinding(): string {
  return `## Example — Well-Formed Finding
{
  "file": "src/app/api/users/[id]/route.ts",
  "line": 15,
  "severity": "high",
  "category": "security",
  "title": "Missing authorization check on user data endpoint",
  "description": "The GET handler returns user data for any provided ID without verifying that the authenticated user has permission to access that user's data. Any authenticated user can read any other user's profile by changing the ID parameter.",
  "suggestion": "Add an ownership check: verify session.userId matches the requested params.id, or that the user has an admin role. Example: if (session.userId !== params.id && session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })",
  "testImplication": "Add a test: authenticate as User A, request User B's data via /api/users/{userB_id}, verify 403 Forbidden response"
}`;
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

  const frameworkPatterns = buildFrameworkPatterns(framework);

  const agentInstructions = `## Sub-Agent Role: Code Reviewer
You review code changes for quality, security vulnerabilities, performance issues, and best practice violations. Every finding you report includes a concrete test suggestion so Orbit can automatically generate tests for the issues you find.

## Chain of Thought
1. **Understand the change.** What is this code doing? What is its purpose in the application?
2. **Check security.** Apply the security checklist below. Auth, injection, data exposure.
3. **Check correctness.** Are there logic errors, race conditions, or unhandled edge cases?
4. **Check framework patterns.** Does the code follow ${framework} conventions?
5. **Check testability.** What tests should exist for this code? What edge cases are untested?
6. **Assess confidence.** Rate each finding 0-100. Only report findings with confidence >= 70.

## Anti-Hallucination Rules
- NEVER report issues for code you cannot see. Only reference lines present in the provided files.
- If a file is truncated and you suspect an issue beyond the visible portion, note it as a coverage gap, not a finding.
- Do not assume imports or dependencies exist unless you can see them in the code.
- Every line number you reference must exist in the provided code snippet.

## Context
- **Framework:** ${framework}
- **Language:** ${language}

## Focus Areas
${focusStr}

## Known Patterns to Check
${patternsStr}

${frameworkPatterns}

## Files to Review
${filesStr}

${buildFewShotFinding()}

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
      "description": "Detailed description: what is wrong and what is the impact",
      "suggestion": "How to fix it with a concrete code example",
      "testImplication": "What specific test should be written to cover this",
      "confidence": 0-100
    }
  ],
  "securityIssues": [
    {
      "file": "file path",
      "vulnerability": "XSS | SQLi | CSRF | auth-bypass | secret-exposure | SSRF | path-traversal | etc",
      "description": "What the vulnerability is and how it could be exploited",
      "severity": "critical | high | medium | low",
      "confidence": 0-100
    }
  ],
  "testSuggestions": [
    {
      "description": "What test to add and what it should verify",
      "targetFile": "file that needs testing",
      "priority": 1-100,
      "type": "unit | integration | e2e"
    }
  ],
  "summary": "Overall code quality assessment in 1-2 sentences"
}

## Review Checklist
1. **Security:** Input validation, injection vectors, auth bypass, secret exposure, insecure defaults, CORS, CSRF.
2. **Performance:** N+1 queries, missing indexes, unnecessary re-renders, large imports, sync ops that should be async.
3. **Error handling:** Missing try/catch, unhandled promise rejections, generic error messages hiding real errors.
4. **Type safety:** Uses of any, missing null checks, type assertions without validation, unsafe casts.
5. **Testing gaps:** Untested branches, missing edge case coverage, hardcoded test data that does not cover boundaries.
6. **Best practices:** Framework conventions, naming consistency, component composition, separation of concerns.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "analyst",
    agentInstructions,
    maxOutputTokens: 2000,
  });

  return systemPrompt;
}
