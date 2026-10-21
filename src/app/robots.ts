import type { MetadataRoute } from "next";
import { SITE } from "@/lib/marketing/site";
import { isSelfHosted } from "@/lib/self-host";

// Read ORBIT_SELF_HOSTED at request time: a build-time render would bake the hosted answer into self-hosted images.
export const dynamic = "force-dynamic";

/** Public site is indexable; the app, admin, API and setup are not. A self-hosted instance is private. */
export default function robots(): MetadataRoute.Robots {
  if (isSelfHosted()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api", "/setup", "/invite", "/login"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
