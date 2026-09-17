import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PRODUCT_TOUR } from "./product-tour-content";

const PUBLIC_BRAND = "apps/web/public/brand";
const PAGE_SOURCE = "apps/web/src/domains/marketing/ProductTourPage.tsx";
const PLAYER_SOURCE = "apps/web/src/domains/marketing/ProductTourPlayer.tsx";
const ROUTE_SOURCE = "apps/web/src/app/routes/groups/marketing.routes.tsx";
const HOME_SOURCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const REMOTION_SOURCE = "media/brand-film/src/ProductTourFilm.tsx";
const REMOTION_ROOT = "media/brand-film/src/index.tsx";

describe("long-form product tour contracts", () => {
  it("keeps the walkthrough intentionally long and chaptered", () => {
    expect(PRODUCT_TOUR.duration).toBe(504);
    expect(PRODUCT_TOUR.chapters).toHaveLength(9);
    expect(PRODUCT_TOUR.chapters[0].start).toBe(0);
    expect(PRODUCT_TOUR.chapters.at(-1)?.end).toBe(PRODUCT_TOUR.duration);
    expect(PRODUCT_TOUR.chapters.every((chapter, index) => index === 0 || chapter.start === PRODUCT_TOUR.chapters[index - 1].end)).toBe(true);
  });

  it("registers the public page and links it from the creator home", () => {
    const routeSource = readFileSync(ROUTE_SOURCE, "utf8");
    const homeSource = readFileSync(HOME_SOURCE, "utf8");

    expect(routeSource).toContain('path: "/product-tour"');
    expect(homeSource).toContain('href="/product-tour"');
    expect(homeSource).toContain("8분 제품 투어 보기");
  });

  it("uses video metadata, chapter navigation and actual product surfaces", () => {
    const pageSource = readFileSync(PAGE_SOURCE, "utf8");
    const playerSource = readFileSync(PLAYER_SOURCE, "utf8");

    expect(pageSource).toContain('"@type": "VideoObject"');
    expect(pageSource).toContain('duration: "PT8M24S"');
    expect(pageSource).toContain("product-tour-page__journey-grid");
    expect(playerSource).toContain('preload="metadata"');
    expect(playerSource).toContain('kind="captions"');
    expect(playerSource).toContain("PRODUCT_TOUR.chapters.map");
  });

  it("registers the Remotion composition at the same duration", () => {
    const filmSource = readFileSync(REMOTION_SOURCE, "utf8");
    const rootSource = readFileSync(REMOTION_ROOT, "utf8");

    expect(filmSource).toContain("PRODUCT_TOUR_DURATION_SECONDS = 504");
    expect(filmSource).toContain("PRODUCT_TOUR_FPS = 30");
    expect(rootSource).toContain('id="ToonStudioProductTour"');
    expect(rootSource).toContain("PRODUCT_TOUR_DURATION_SECONDS * PRODUCT_TOUR_FPS");
  });

  it("ships the poster, bilingual captions and real-screen chapter media locally", () => {
    for (const asset of [
      "toonstudio-product-tour-poster.jpg",
      "toonstudio-product-tour.ko.vtt",
      "toonstudio-product-tour.en.vtt",
      "product-tour/01-overview.png",
      "product-tour/02-plan.png",
      "product-tour/03-draw.png",
      "product-tour/05-3d.png",
      "product-tour/06-ai.png",
      "product-tour/07-production.png",
      "product-tour/07-review.png",
      "product-tour/08-learn.png",
      "product-tour/09-publish.png",
    ]) {
      expect(existsSync(`${PUBLIC_BRAND}/${asset}`), asset).toBe(true);
    }
  });
});
