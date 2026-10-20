/**
 * Credential placeholders keep secret values away from the LLM.
 *
 * Prompts describe credentials only by key, e.g. {{credential:TEST_PASSWORD}}.
 * The real value is substituted at the last moment, inside the browser/HTTP
 * action that needs it, and never flows back into any prompt.
 */

const PLACEHOLDER_PATTERN = /\{\{credential:([^}]+)\}\}/g;

/** Values shorter than this are not scrubbed: they would mangle ordinary text. */
const MIN_REDACTABLE_LENGTH = 4;

export function credentialPlaceholder(key: string): string {
  return `{{credential:${key}}}`;
}

/** Replace {{credential:KEY}} with the real value ("" for unknown keys). */
export function substituteCredentials(
  value: string,
  credentials: Record<string, string>
): string {
  return value.replace(PLACEHOLDER_PATTERN, (_, key: string) => credentials[key.trim()] ?? "");
}

/** Placeholder keys referenced in `value` that have no entry in `credentials`. */
export function findMissingCredentialKeys(
  value: string,
  credentials: Record<string, string>
): string[] {
  const missing: string[] = [];
  for (const match of Array.from(value.matchAll(PLACEHOLDER_PATTERN))) {
    const key = match[1].trim();
    if (!(key in credentials) && !missing.includes(key)) missing.push(key);
  }
  return missing;
}

/**
 * Replace any occurrence of a secret value in text bound for the LLM
 * (page text, action history, user notes) with its placeholder.
 * Longest values first so a value containing another is fully replaced.
 */
export function redactCredentials(
  text: string,
  credentials: Record<string, string> | undefined
): string {
  if (!credentials) return text;
  const entries = Object.entries(credentials)
    .filter(([, value]) => value.length >= MIN_REDACTABLE_LENGTH)
    .sort((a, b) => b[1].length - a[1].length);

  let result = text;
  for (const [key, value] of entries) {
    result = result.split(value).join(credentialPlaceholder(key));
  }
  return result;
}

/** Value to type into a field: placeholders resolved. Throws (naming the key only) for unknown keys. */
export function resolveFillValue(value: string, credentials: Record<string, string>): string {
  const missing = findMissingCredentialKeys(value, credentials);
  if (missing.length > 0) throw new Error(`Unknown credential placeholder: ${missing.join(", ")}`);
  return substituteCredentials(value, credentials);
}

/**
 * Pretty-print an agent context for the model with `testCredentials` values replaced by
 * placeholders, and any other occurrence of a secret value scrubbed from the output.
 */
export function serializeContextWithoutSecrets(context: Record<string, unknown>): string {
  const raw = context.testCredentials;
  if (!raw || typeof raw !== "object") return JSON.stringify(context, null, 2);

  const credentials = Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  const placeholders = Object.fromEntries(
    Object.keys(credentials).map((key) => [key, credentialPlaceholder(key)])
  );
  return redactCredentials(
    JSON.stringify({ ...context, testCredentials: placeholders }, null, 2),
    credentials
  );
}

/** Prompt lines listing the credential keys with how to reference them (never values). */
export function describeCredentialPlaceholders(
  credentials: Record<string, string> | undefined
): string {
  const keys = Object.keys(credentials ?? {});
  if (keys.length === 0) return "  (none provided)";
  return keys.map((key) => `  - ${key}: use the exact text ${credentialPlaceholder(key)}`).join("\n");
}

export const CREDENTIAL_PLACEHOLDER_INSTRUCTIONS =
  'To type a credential, put its placeholder verbatim in the "value" field (for example {{credential:TEST_PASSWORD}}). ' +
  "Orbit substitutes the real value when the field is filled. You never see the actual values; never try to guess or reconstruct them.";
