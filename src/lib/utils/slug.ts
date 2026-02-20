export function generateSlug(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
