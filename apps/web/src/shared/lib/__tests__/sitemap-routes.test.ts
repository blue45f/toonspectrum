import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const script = readFileSync(join(process.cwd(), "scripts/build-static-catalog.ts"), "utf8");
const staticRoutes = script.match(/const STATIC_ROUTES = \[([\s\S]*?)\];/)?.[1] ?? "";

// canonical 공개 표면이 사이트맵 색인에서 다시 빠지거나 utility URL이 섞이는 회귀를 막는다.
describe("sitemap static routes", () => {

  it("keeps the Remotion brand film in the sitemap static routes", () => {
    expect(staticRoutes).toContain('"/brand-film"');
  });

  it("keeps the canonical creator showcase in the sitemap static routes", () => {
    expect(staticRoutes).toContain('"/showcase"');
    expect(staticRoutes).not.toContain('"/create"');
  });

  it("keeps indexable discovery routes and excludes search utilities", () => {
    for (const route of ['"/"', '"/ranking"', '"/explore"', '"/calendar"']) {
      expect(staticRoutes).toContain(route);
    }
    for (const route of ['"/search"', '"/compare"', '"/random"', '"/shaper"']) {
      expect(staticRoutes).not.toContain(route);
    }
  });

  it("keeps the creator market landing and discovery routes indexable", () => {
    expect(staticRoutes).toContain('"/market"');
    expect(staticRoutes).toContain('"/market/browse"');
    expect(staticRoutes).not.toContain('"/market/compare"');
  });

  it("keeps the engineering story hub and reusable formats indexable", () => {
    for (const route of [
      '"/about/technology"',
      '"/about/technology/story"',
      '"/about/technology/guides"',
      '"/about/technology/references"',
      '"/about/technology/field-notes"',
      '"/about/technology/deck"',
      '"/about/technology/videos"',
      '"/about/technology/licenses"',
    ]) {
      expect(staticRoutes).toContain(route);
    }
  });
});

describe("sitemap output shape", () => {
  it("writes a sitemap index with separately chunked pages, titles and authors", () => {
    expect(script).toContain("<sitemapindex");
    expect(script).toContain('writeChunkedSitemaps("pages"');
    expect(script).toContain('writeChunkedSitemaps("titles"');
    expect(script).toContain('writeChunkedSitemaps("authors"');
    expect(script).toContain("SITEMAP_MAX_URLS = 45_000");
  });
});

describe("home creator funnel", () => {
  const home = readFileSync(join(process.cwd(), "apps/web/src/domains/catalog/HomePage.tsx"), "utf8");

  it("links the landing page to the creator studio and the creator board", () => {
    expect(home).toContain('href="/studio"');
    expect(home).toContain('href="/create"');
  });
});
