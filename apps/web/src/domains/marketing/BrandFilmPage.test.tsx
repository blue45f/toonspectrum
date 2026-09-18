import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PAGE_SOURCE = "apps/web/src/domains/marketing/BrandFilmPage.tsx";
const PAGE_STYLES = "apps/web/src/domains/marketing/brand-film-page.css";
const PUBLIC_BRAND = "apps/web/public/brand";


describe("brand film public page contracts", () => {
  it("uses the shared accessible player and localized page metadata", () => {
    const source = readFileSync(PAGE_SOURCE, "utf8");

    expect(source).toContain("<CreatorBrandFilm");
    expect(source).toContain('canonicalPath: "/brand-film"');
    expect(source).toContain('"@type": "VideoObject"');
    expect(source).toContain('data-brand-film="remotion"');
    expect(source).toContain('href="/studio/new"');
    expect(source).toContain('href="/showcase/promo"');
  });

  it("ships every rendered ratio, the poster and bilingual captions locally", () => {
    for (const asset of [
      "toonstudio-intro.mp4",
      "toonstudio-intro-portrait.mp4",
      "toonstudio-intro-square.mp4",
      "toonstudio-film-poster.jpg",
      "toonstudio-intro.ko.vtt",
      "toonstudio-intro.en.vtt",
    ]) {
      expect(existsSync(`${PUBLIC_BRAND}/${asset}`), asset).toBe(true);
    }
  });

  it("keeps mobile, reduced-motion and high-contrast layouts explicit", () => {
    const styles = readFileSync(PAGE_STYLES, "utf8");

    expect(styles).toContain("overflow-x: clip");
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain("@media (max-width: 460px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (prefers-contrast: more), (forced-colors: active)");
  });
});
