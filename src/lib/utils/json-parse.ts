/**
 * Shared LLM JSON response parsing with progressive repair.
 * LLMs occasionally emit malformed JSON: markdown fences, control characters,
 * trailing commas, unquoted keys, truncated output, etc.
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
 * Recover a JSON string that was truncated mid-output (e.g. by a maxTokens
 * limit). Finds the last position where a complete element inside a top-level
 * array was closed (stack depth goes from 3→2 for object-in-array) and
 * closes all remaining open structures.
 *
 * Example: {"testCases":[{...},{...},{...TRUNCATED → {"testCases":[{...},{...}]}
 *
 * Returns the original string unchanged if it is not truncated.
 */
function recoverTruncatedJson(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafeEnd = -1;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];

    if (escaped) { escaped = false; continue; }
    if (char === "\\" && inString) { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      stack.pop();
      // A complete element in a top-level array: stack depth 2 with open array on top
      if (char === "}" && stack.length === 2 && stack[1] === "[") {
        lastSafeEnd = i;
      }
    }
  }

  // Not truncated — nothing to do
  if (!inString && stack.length === 0) return s;

  if (lastSafeEnd >= 0) {
    // Truncate to the last complete element, strip any trailing comma, close open structures
    const truncated = s.slice(0, lastSafeEnd + 1).replace(/,\s*$/, "");
    return truncated + "]}";
  }

  // Flat object recovery: truncated mid-value in a simple {...} object.
  // Find the last complete "key": "value" pair and close the object.
  if (stack.length >= 1 && stack[0] === "{") {
    const lastCompleteProperty = s.lastIndexOf('",');
    if (lastCompleteProperty > 0) {
      const truncated = s.slice(0, lastCompleteProperty + 1).replace(/,\s*$/, "");
      const closers = stack.map((b) => (b === "{" ? "}" : "]")).reverse().join("");
      return truncated + closers;
    }
  }

  return s;
}

/**
 * Parse a JSON string from an LLM response, applying progressive repair:
 *  1. Strip markdown code fences
 *  2. Raw parse
 *  3. Escape control characters in string literals → parse again
 *  4. Truncation recovery FIRST (before structural repair that can mangle cut-off JSON)
 *  5. Structural repair: strip JS comments, trailing commas, unquoted keys → parse again
 *  6. Truncation recovery again on structurally-repaired version
 *  7. Extract largest JSON-like block → last resort
 *
 * Throws if all repair attempts fail.
 *
 * IMPORTANT: truncation recovery runs before structural repair because the
 * `.replace(/([}\]])\s*[^}\]]*$/, "$1")` strip is harmful on cut-off JSON —
 * it moves the truncation point to the last bracket in the *middle* of the
 * response rather than the true end, discarding many valid test cases.
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

  // 2. Escape control characters in string literals
  const sanitized = escapeControlCharsInStrings(cleaned);
  try {
    return JSON.parse(sanitized);
  } catch {
    // fall through
  }

  // 3. Truncation recovery on the sanitized (minimally-modified) string.
  //    Do this BEFORE structural repair — the aggressive bracket-strip in step 4
  //    corrupts truncated JSON by moving the apparent end point backwards into
  //    the middle of a valid array, discarding many recovered elements.
  const recoveredEarly = recoverTruncatedJson(sanitized);
  if (recoveredEarly !== sanitized) {
    try {
      return JSON.parse(recoveredEarly);
    } catch {
      // fall through
    }
  }

  // 4. Structural repair: strip comments, trailing commas, unquoted keys.
  //    Intentionally NOT stripping "trailing garbage after last bracket" here —
  //    that pattern destroys truncated JSON before recovery can handle it.
  cleaned = sanitized
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  // 5. Truncation recovery on the structurally-repaired version
  const recoveredLate = recoverTruncatedJson(cleaned);
  if (recoveredLate !== cleaned) {
    try {
      return JSON.parse(recoveredLate);
    } catch {
      // fall through
    }
  }

  // 6. Last resort: extract the largest JSON-like block
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
