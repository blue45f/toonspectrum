import type { MetadataRoute } from "next";
import { getTitleSitemapEntries } from "@/lib/server/title";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://webdex.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/ranking", "/search", "/explore", "/recommend", "/reviews", "/insights", "/library"].map(
    (p) => ({
      url: `${BASE}${p}`,
      changeFrequency: "daily" as const,
      priority: p === "" ? 1 : 0.7,
    })
  );
  return [...routes, ...getTitleSitemapEntries(BASE)];
}
