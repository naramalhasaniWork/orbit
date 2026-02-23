/**
 * Shared LLM JSON response parsing with progressive repair.
 * LLMs occasionally emit malformed JSON: markdown fences, control characters,
 * trailing commas, unquoted keys, etc. This module handles all known cases.
 */

/**
 * Escape raw control characters (0x00–0x1F) inside JSON string literals.
 * The LLM sometimes emits literal newlines or other control chars inside
 * string values, which are invalid per the JSON spec.
 */
function escapeControlCharsInStrings(s: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    const code = s.charCodeAt(i);

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString && code < 0x20) {
      result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Parse a JSON string from an LLM response, applying progressive repair:
 *  1. Strip markdown code fences
 *  2. Raw parse
 *  3. Escape control characters in string literals → parse again
 *  4. Strip JS comments, trailing commas, unquoted keys → parse again
 *  5. Extract largest JSON-like block → parse as last resort
 *
 * Throws if all repair attempts fail.
 */
export function parseLlmJson(content: string): unknown {
  let cleaned = content
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  // 1. Raw parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  // 2. Escape control characters in string literals → parse again
  const sanitized = escapeControlCharsInStrings(cleaned);
  try {
    return JSON.parse(sanitized);
  } catch {
    // fall through
  }

  // 3. Structural repair: strip comments, trailing commas, unquoted keys
  cleaned = sanitized
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":')
    .replace(/([}\]])\s*[^}\]]*$/, "$1")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  // 4. Last resort: extract the largest JSON-like block
  const jsonMatch = cleaned.match(/[{\[]([\s\S]*)[}\]]/);
  if (jsonMatch) {
    const startIdx = cleaned.indexOf(jsonMatch[0]);
    const bracket = cleaned[startIdx];
    const closer = bracket === "{" ? "}" : "]";
    const extracted = bracket + jsonMatch[1] + closer;
    try {
      return JSON.parse(extracted);
    } catch {
      // fall through
    }
  }

  throw new Error(
    `Failed to parse LLM JSON response (length: ${content.length}). First 200 chars: ${content.slice(0, 200)}`
  );
}
