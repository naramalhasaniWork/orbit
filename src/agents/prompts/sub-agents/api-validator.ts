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

function buildFewShotExample(): string {
  return `## Example — Well-Formed Validation Output
**Input:** GET /api/users/123, Expected 200, Got 200. Expected schema has "id" (number), "email" (string), "name" (string). Actual body: {"id": "123", "email": "user@test.com", "name": null, "internalId": "abc-def"}

**Output:**
{
  "valid": false,
  "statusMatch": true,
  "schemaViolations": [
    { "field": "id", "expected": "number", "actual": "string ('123')", "severity": "error" },
    { "field": "name", "expected": "string (non-null)", "actual": "null", "severity": "error" }
  ],
  "missingFields": [],
  "unexpectedFields": ["internalId"],
  "securityIssues": [
    { "issue": "Response exposes 'internalId' field which appears to be an internal database identifier. This could leak implementation details.", "severity": "medium" }
  ],
  "summary": "Status matched but 2 schema violations found: 'id' is string instead of number, 'name' is null. Also exposes internal ID field.",
  "confidence": 92
}`;
}

function buildSecurityChecklist(): string {
  return `## Security Checks for API Responses
- **Stack traces:** Does the error response include a stack trace or internal file paths?
- **Internal IDs:** Does the response expose internal database IDs, UUIDs, or implementation details not needed by the client?
- **PII leakage:** Does the response include sensitive user data (password hash, SSN, full credit card) that shouldn't be returned?
- **Verbose errors:** Does a 4xx/5xx response reveal database schema, query details, or internal service names?
- **Missing security headers:** Are Content-Type, X-Content-Type-Options, and Cache-Control set appropriately?
- **CORS issues:** Does the response include overly permissive Access-Control-Allow-Origin?`;
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
    : "(no expected schema provided — validate structure and types from the response itself)";

  const reqHeadersStr = requestHeaders
    ? Object.entries(requestHeaders)
        .map(([k, v]) => `  ${k}: ${v.startsWith("Bearer") ? "Bearer ••••••" : v}`)
        .join("\n")
    : "  (none)";

  const resHeadersStr = responseHeaders
    ? Object.entries(responseHeaders)
        .filter(([k]) => ["content-type", "x-request-id", "x-ratelimit-remaining", "cache-control", "access-control-allow-origin"].includes(k.toLowerCase()))
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")
    : "  (none)";

  const agentInstructions = `## Sub-Agent Role: API Validator
You validate API responses against expected schemas and status codes. You identify contract violations, type mismatches, missing fields, unexpected fields, and security issues. You are thorough and precise.

## Chain of Thought
1. **Check status code.** Does actual match expected? A mismatch is always an error.
2. **Parse response body.** Is it valid JSON? If not, that is itself a violation.
3. **Validate schema.** For each expected field: does it exist? Is the type correct? Is it null when non-null was expected?
4. **Check for extras.** Are there unexpected fields? Could they expose sensitive data?
5. **Security scan.** Apply the security checklist below.
6. **Summarize.** One clear sentence describing the overall result.

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

${buildSecurityChecklist()}

${buildFewShotExample()}

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
      "issue": "description of the security concern",
      "severity": "critical | high | medium | low"
    }
  ],
  "summary": "One-line validation summary",
  "confidence": 0-100
}

## Validation Rules
- Status code mismatch is always an error.
- Missing required fields are errors; missing optional fields are warnings.
- Extra fields are warnings unless they expose sensitive data (then critical).
- Check for security issues: exposed stack traces, internal IDs, PII in error messages.
- Type mismatches (string vs number) are errors.
- Null values where non-null expected are errors.
- If no expected schema is provided, validate that the response is well-formed JSON with consistent types and no obvious security issues.`;

  const { systemPrompt } = buildPrompt({
    agentRole: "executor",
    agentInstructions,
    maxOutputTokens: 500,
  });

  return systemPrompt;
}
