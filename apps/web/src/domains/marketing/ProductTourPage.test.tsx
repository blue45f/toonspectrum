import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PRODUCT_TOUR_RUNTIME_AUDIO } from "./product-tour-audio.generated";
import { PRODUCT_TOUR } from "./product-tour-content";

const PUBLIC_BRAND = "apps/web/public/brand";
const PAGE_SOURCE = "apps/web/src/domains/marketing/ProductTourPage.tsx";
const PLAYER_SOURCE = "apps/web/src/domains/marketing/ProductTourPlayer.tsx";
const ROUTE_SOURCE = "apps/web/src/app/routes/groups/marketing.routes.tsx";
const HOME_SOURCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const REMOTION_SOURCE = "tools/media/brand-film/src/ProductTourFilm.tsx";
const SHARED_REMOTION_SOURCE = "packages/product-tour-film/src/ProductTourFilm.tsx";
const FALLBACK_PLAYER_SOURCE = "apps/web/src/domains/marketing/ProductTourMp4Player.tsx";
const RUNTIME_AUDIO_MANIFEST = `${PUBLIC_BRAND}/product-tour/product-tour-audio.json`;
const REMOTION_ROOT = "tools/media/brand-film/src/index.tsx";

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
    expect(pageSource).toContain("<CreatorFeatureReels showFilm={false} embedded />");
    const fallbackSource = readFileSync(FALLBACK_PLAYER_SOURCE, "utf8");
    expect(playerSource).toContain("component={ProductTourRemotionComposition}");
    expect(playerSource).toContain("initiallyMuted={false}");
    expect(playerSource).toContain("numberOfSharedAudioTags={2}");
    expect(playerSource).toContain("enableSound");
    expect(playerSource).toContain("ProductTourMp4Player");
    expect(fallbackSource).toContain('preload="metadata"');
    expect(fallbackSource).toContain('srcLang="ko"');
    expect(fallbackSource).toContain('srcLang="en"');
    expect(fallbackSource).toContain("PRODUCT_TOUR_STALL_TIMEOUT_MS");
    expect(fallbackSource).toContain("recoverPlayback");
    expect(playerSource).toContain("PRODUCT_TOUR.chapters.map");
  });

  it("shares one reviewed Remotion composition between rendering and runtime playback", () => {
    const bridgeSource = readFileSync(REMOTION_SOURCE, "utf8");
    const filmSource = readFileSync(SHARED_REMOTION_SOURCE, "utf8");
    const rootSource = readFileSync(REMOTION_ROOT, "utf8");

    expect(bridgeSource).toContain("@toonspectrum/product-tour-film");
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

  it("ships versioned Remotion runtime narration, BGM and shared cue data", () => {
    const manifest = JSON.parse(readFileSync(RUNTIME_AUDIO_MANIFEST, "utf8")) as typeof PRODUCT_TOUR_RUNTIME_AUDIO;
    const narration = readFileSync(`${PUBLIC_BRAND}/product-tour/toonstudio-product-tour-narration.ko.m4a`);
    const bgm = readFileSync(`${PUBLIC_BRAND}/product-tour/toonstudio-product-tour-bgm.m4a`);

    expect(manifest).toEqual(PRODUCT_TOUR_RUNTIME_AUDIO);
    expect(manifest.version).toBe(1);
    expect(manifest.duration).toBe(504);
    expect(manifest.cues).toHaveLength(27);
    expect(manifest.narration.src).toMatch(/\?v=[a-f0-9]{16}$/u);
    expect(manifest.bgm.src).toMatch(/\?v=[a-f0-9]{16}$/u);
    expect(manifest.narration.bytes).toBe(narration.byteLength);
    expect(manifest.bgm.bytes).toBe(bgm.byteLength);
    expect(createHash("sha256").update(narration).digest("hex")).toBe(manifest.narration.sha256);
    expect(createHash("sha256").update(bgm).digest("hex")).toBe(manifest.bgm.sha256);
  });

  it("ships a versioned narrated mix with original BGM and synchronized captions", () => {
    const video = readFileSync(`${PUBLIC_BRAND}/toonstudio-product-tour.mp4`);
    const manifest = JSON.parse(
      readFileSync(`${PUBLIC_BRAND}/product-tour-manifest.json`, "utf8"),
    ) as {
      version: number;
      bytes: number;
      sha256: string;
      audio?: { narration?: { locale?: string }; bgm?: unknown[]; mix?: string };
    };
    const sha256 = createHash("sha256").update(video).digest("hex");

    expect(PRODUCT_TOUR.src).toMatch(/^\/brand\/toonstudio-product-tour\.mp4\?v=[a-f0-9]{16}$/u);
    expect(PRODUCT_TOUR.bytes).toBe(video.byteLength);
    expect(manifest).toMatchObject({
      version: 2,
      bytes: video.byteLength,
      sha256,
      audio: {
        narration: { locale: "ko-KR" },
        mix: "stereo-aac-128k-with-narration-ducking",
      },
    });
    expect(manifest.audio?.bgm).toHaveLength(2);
    expect(existsSync("tools/media/brand-film/audio/toonstudio-product-tour-narration.ko.m4a")).toBe(true);

    for (const locale of ["ko", "en"] as const) {
      const captions = readFileSync(`${PUBLIC_BRAND}/toonstudio-product-tour.${locale}.vtt`, "utf8");
      const cueLines = captions
        .split(/\r?\n/u)
        .filter((line) => line.includes(" --> "));
      expect(cueLines).toHaveLength(27);
      expect(captions).toContain("00:08:16.000");
    }
  });

});
