import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SITEMAP_SOURCE = "apps/web/src/domains/legal/SitemapPage.tsx";

describe("site directory experience contracts", () => {
  it("uses the same purpose-based navigation model as the global site chrome", () => {
    const source = readFileSync(SITEMAP_SOURCE, "utf8");
    expect(source).toContain("SITE_NAVIGATION_GROUPS");
    expect(source).toContain("SITE_UTILITY_NAVIGATION");
    expect(source).toContain("SITE_NAVIGATION_ITEMS.me");
    expect(source).toContain("siteNavigationText");
  });

  it("keeps specialist creation, collection, discovery and policy destinations reachable", () => {
    const source = readFileSync(SITEMAP_SOURCE, "utf8");
    for (const href of [
      "/brush-lab",
      "/music",
      "/learn/recipes",
      "/story-lab",
      "/publishing",
      "/create/challenges",
      "/market/library",
      "/research/assets",
      "/research/books",
      "/compare",
      "/random",
      "/community/cafes",
      "/about/data",
      "/privacy",
      "/feedback",
    ]) {
      expect(source).toContain(`\"${href}\"`);
    }
  });

  it("provides bilingual page copy and keyboard-visible focus treatments", () => {
    const source = readFileSync(SITEMAP_SOURCE, "utf8");
    expect(source).toContain("TOONSTUDIO DIRECTORY");
    expect(source).toContain("Start with what");
    expect(source).toContain("하고 싶은 일에서");
    expect(source).toContain("focus-visible:ring-2");
  });
});
