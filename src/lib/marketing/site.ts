/** One source for public-site facts: names, URLs and the placeholders still to be decided. */
export const SITE = {
  name: "Orbit",
  /** Absolute origin for canonical URLs and social cards. */
  url: (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, ""),
  repoUrl: "https://github.com/naramalhasaniWork/orbit",
  headline: "Know what this PR broke before you merge it.",
  description:
    "Orbit reads the diff, works out which user journeys it touches, and walks them in a real browser on your preview deployment. What broke lands on the PR in plain English.",
} as const;

export const LINKS = {
  railwayGuide: `${SITE.repoUrl}/blob/main/docs/self-hosting/railway.md`,
  firstRun: `${SITE.repoUrl}/blob/main/docs/self-hosting/first-run.md`,
  selfHosting: `${SITE.repoUrl}/tree/main/docs/self-hosting`,
} as const;

/** Visible on purpose: not decided yet, never filled with invented values. */
export const PLACEHOLDER = {
  price: "[PRICE]",
  measured: "[MEASURED]",
  stars: "[stars]",
  owner: "[OWNER]",
  demoApp: "[PUBLIC DEMO APP]",
} as const;

/** Page title in the site's one format: "Page · Orbit". */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${SITE.name}` : `${SITE.name}: ${SITE.headline}`;
}
