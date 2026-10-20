import { ACTION_TYPES, ACTION_VERDICTS, ASSERTION_TYPES } from "@/agents/schemas/execution-result";

// JSON Schema for structured outputs. Mirrors ExecutorActionSchema minus tool_call, whose
// free-form toolArgs object structured outputs cannot express (additionalProperties must be
// false); requests that offer MCP tools fall back to prompt-instructed JSON. Numeric bounds
// and the cross-field rules stay in the Zod schema, which still validates every response.
export const EXECUTOR_ACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["action", "reason"],
  properties: {
    action: { type: "string", enum: ACTION_TYPES.filter((a) => a !== "tool_call") },
    selector: { type: "string" },
    value: { type: "string" },
    url: { type: "string" },
    waitMs: { type: "number" },
    assertion: {
      type: "object",
      additionalProperties: false,
      required: ["type", "expected"],
      properties: {
        type: { type: "string", enum: [...ASSERTION_TYPES] },
        expected: { type: "string" },
        attribute: { type: "string" },
        selector: { type: "string" },
      },
    },
    verdict: { type: "string", enum: [...ACTION_VERDICTS] },
    reason: { type: "string" },
  },
};
