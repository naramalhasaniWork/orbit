import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE } from "@/lib/marketing/site";
import { isSelfHosted } from "@/lib/self-host";

// Read ORBIT_SELF_HOSTED at request time: a build-time render would bake the hosted answer into self-hosted images.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  if (isSelfHosted()) return [];
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
