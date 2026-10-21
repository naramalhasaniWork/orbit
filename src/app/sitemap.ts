import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE } from "@/lib/marketing/site";
import { isSelfHosted } from "@/lib/self-host";


export default function sitemap(): MetadataRoute.Sitemap {
  if (isSelfHosted()) return [];
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
