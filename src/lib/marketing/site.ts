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

/** Visible placeholders for what is not decided yet (never filled with invented values), plus the owner. */
export const PLACEHOLDER = {
  price: "[PRICE]",
  measured: "[MEASURED]",
  stars: "[stars]",
  owner: "Naram Alhasani",
  demoApp: "[PUBLIC DEMO APP]",
} as const;

/** Page title in the site's one format: "Page · Orbit". */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${SITE.name}` : `${SITE.name}: ${SITE.headline}`;
}

/** Public pages that exist and have content; docs, blog and changelog join when they do. */
export const PUBLIC_PATHS = ["/", "/features", "/pricing", "/about", "/security", "/privacy", "/terms"] as const;

/**
 * A page's Open Graph block. Next replaces (not merges) the root openGraph when a page sets its own,
 * so type, site name and locale are repeated here with the page's url, title and description.
 */
export function openGraphFor(path: string, title: string, description: string) {
  return { type: "website" as const, siteName: SITE.name, locale: "en_US", url: path, title, description };
}
