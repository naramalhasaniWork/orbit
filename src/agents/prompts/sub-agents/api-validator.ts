/**
 * API Validator Sub-Agent Prompt
 * Validates API endpoints return expected schema and status codes.
 * Used during test execution for API contract testing.
 */

import { buildPrompt } from "@/agents/prompts/prompt-builder";

export interface ApiValidatorContext {
  /** The API endpoint being validated */
  endpoint: string;
  /** HTTP method */
  method: string;
  /** Expected status code */
  expectedStatus: number;
  /** Actual status code received */
  actualStatus: number;
  /** Expected response schema (JSON schema or example) */
  expectedSchema?: Record<string, unknown>;
  /** Actual response body */
  actualBody: string;
  /** Request headers sent */
  requestHeaders?: Record<string, string>;
  /** Request body sent */
  requestBody?: string;
  /** Response headers received */
  responseHeaders?: Record<string, string>;
}

export function buildApiValidatorPrompt(
  context: ApiValidatorContext
): string {
  const {
    endpoint,
    method,
    expectedStatus,
    actualStatus,
    expectedSchema,
    actualBody,
    requestHeaders,
    requestBody,
    responseHeaders,
  } = context;

  const schemaStr = expectedSchema
    ? JSON.stringify(expectedSchema, null, 2)
    : "(no expected schema provided)";

  const reqHeadersStr = requestHeaders
    ? Object.entries(requestHeaders)
        .map(([k, v]) => `  ${k}: ${v.startsWith("Bearer") ? "Bearer ••••••" : v}`)
        .join("\n")
    : "  (none)";

  const resHeadersStr = responseHeaders
    ? Object.entries(responseHeaders)
        .filter(([k]) => ["content-type", "x-request-id", "x-ratelimit-remaining"].includes(k.toLowerCase()))
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")
    : "  (none)";

  const agentInstructions = `## Sub-Agent Role: API Validator
You validate API responses against expected schemas and status codes. You identify contract violations, unexpected fields, missing fields, and type mismatches.

## Endpoint Under Test
- **Method:** ${method}
- **URL:** ${endpoint}
- **Expected Status:** ${expectedStatus}
- **Actual Status:** ${actualStatus}

## Request Headers
${reqHeadersStr}

## Request Body
${requestBody ?? "(none)"}

## Response Headers
${resHeadersStr}

## Expected Schema
${schemaStr}

## Actual Response Body
${actualBody.slice(0, 4000)}

## Output Schema
Your response MUST be valid JSON:
{
  "valid": true/false,
  "statusMatch": true/false,
  "schemaViolations": [
    {
      "field": "path.to.field",
      "expected": "expected type or value",
      "actual": "actual type or value",
      "severity": "error | warning"
    }
  ],
  "missingFields": ["field1", "field2"],
  "unexpectedFields": ["field1", "field2"],
  "securityIssues": [
    {
      "issue": "description",
      "severity": "critical | high | medium | low"
    }
  ],
  "summary": "One-line validation summary"
}

## Validation Rules
- Status code mismatch is always an error.
- Missing required fields are errors; missing optional fields are warnings.
- Extra fields are warnings unless they expose sensitive data (then critical).
- Check for security issues: exposed stack traces, internal IDs, PII in error messages.
- Type mismatches (string vs number) are errors.
- Null values where non-null expected are errors.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    maxOutputTokens: 500,
  });

  return systemPrompt;
}
