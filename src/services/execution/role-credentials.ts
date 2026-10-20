/**
 * Resolve credentials for a specific user role.
 * Looks for role-prefixed keys (e.g. ADMIN_EMAIL, ADMIN_PASSWORD) first,
 * then falls back to generic TEST_* keys.
 */
export function resolveRoleCredentials(
  allCredentials: Record<string, string>,
  requiredRole?: string
): Record<string, string> {
  if (!requiredRole) return allCredentials;

  const prefix = requiredRole.toUpperCase();
  const roleCredentials: Record<string, string> = { ...allCredentials };
  const suffixes = ["EMAIL", "PASSWORD", "API_KEY", "TOKEN", "USERNAME"];

  for (const suffix of suffixes) {
    const roleKey = `${prefix}_${suffix}`;
    const genericKey = `TEST_${suffix}`;
    if (allCredentials[roleKey]) {
      roleCredentials[genericKey] = allCredentials[roleKey];
    }
  }

  return roleCredentials;
}
