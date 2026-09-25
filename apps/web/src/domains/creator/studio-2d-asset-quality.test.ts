import { describe, expect, it } from "vitest";

import {
  filterStudio2dScenes,
  getStudio2dAssetMetadata,
  isLargeStudio2dAsset,
  isRecommendedStudio2dScene,
  STUDIO_2D_ASSET_METADATA,
  studio2dOrientation,
  studio2dResolutionLabel,
} from "./studio-2d-asset-quality";
import {
  ALL_BG_SCENES,
  BG_SCENE_COMPATIBILITY_LIBRARY,
  BG_SCENES,
  bgSceneSections,
  CURATED_CC0_BG_SCENES,
  groupBgScenes,
} from "./studio-bg-scenes";

import type { Studio2dScene } from "./studio-2d-asset-quality";

import { STUDIO_ILLUSTRATION_BG_SCENES } from "./catalog/studio-illustration-pack";

const groups = groupBgScenes(BG_SCENES);
const scene = (id: string) => BG_SCENES.find((item) => item.id === id)!;
const anyScene = (id: string) => ALL_BG_SCENES.find((item) => item.id === id)!;

describe("2D scene quality and discovery", () => {
  it("exposes only reviewed large raster originals in the default picker", () => {
    const result = filterStudio2dScenes(groups, { quality: "recommended" });
    expect(result).toHaveLength(53 + STUDIO_ILLUSTRATION_BG_SCENES.length);
    expect(result.every(isRecommendedStudio2dScene)).toBe(true);
    expect(filterStudio2dScenes(groups, { quality: "raster" })).toEqual(result);
    expect(result).toContain(scene("webtoon-bedroom"));
    expect(result).toContain(scene("polyhaven-background-wide-street-01"));
  });
  it("keeps low-quality legacy IDs for document compatibility without exposing them by default", () => {
    expect(BG_SCENE_COMPATIBILITY_LIBRARY).toHaveLength(4);
    expect(CURATED_CC0_BG_SCENES).toHaveLength(28);
    const activeIds = new Set(BG_SCENES.map((item) => item.id));
    expect(BG_SCENE_COMPATIBILITY_LIBRARY.every((item) => !activeIds.has(item.id))).toBe(true);
    expect(ALL_BG_SCENES).toHaveLength(BG_SCENES.length + BG_SCENE_COMPATIBILITY_LIBRARY.length);
    expect(anyScene("webtoon-bedroom")).toBeTruthy();

    const compatibilityIds = new Set([
      "webtoon-cafe",
      "webtoon-classroom",
      "webtoon-corridor",
      "webtoon-street",
    ]);
    const compatibilityMetadata = STUDIO_2D_ASSET_METADATA
      .filter((asset) => compatibilityIds.has(asset.id));
    expect(compatibilityMetadata).toHaveLength(4);
    expect(compatibilityMetadata.every((asset) => asset.recommended === false)).toBe(true);
    expect(compatibilityMetadata.every((asset) => asset.provenance.licenseStatus === "unverified")).toBe(true);
  });
  it("retains every active ID exactly once after recommendation regrouping", () => {
    const sections = bgSceneSections(BG_SCENES);
    expect(sections[0].genre).toBe("추천");
    expect(sections[0].scenes).toHaveLength(53 + STUDIO_ILLUSTRATION_BG_SCENES.length);
    const ids = sections.flatMap((group) => group.scenes.map((item) => item.id));
    expect(new Set(ids).size).toBe(BG_SCENES.length);
    expect(ids).toHaveLength(BG_SCENES.length);
  });
  it("registers every curated CC0 replacement as a verified 2048 by 1152 photo reference", () => {
    for (const replacement of CURATED_CC0_BG_SCENES) {
      const metadata = getStudio2dAssetMetadata(replacement)!;
      expect(metadata.width).toBe(2048);
      expect(metadata.height).toBe(1152);
      expect(metadata.mediaType).toBe("image/webp");
      expect(metadata.style).toBe("photographic-reference");
      expect(metadata.provenance.licenseStatus).toBe("cc0-verified");
      expect(metadata.provenance.provider).toBe("Poly Haven");
      expect(isRecommendedStudio2dScene(replacement)).toBe(true);
    }
  });
  it("keeps high-quality raster scenes discoverable in their normalized genre", () => {
    expect(filterStudio2dScenes(groups, { genre: "일상·학원", quality: "raster" })).toContain(scene("polyhaven-background-wide-street-01"));
    expect(filterStudio2dScenes(groups, { genre: "로맨스", quality: "recommended" })).toContain(scene("webtoon-rooftop-sunset"));
    expect(filterStudio2dScenes(groups, { genre: "로맨스", quality: "recommended" })).toHaveLength(8 + STUDIO_ILLUSTRATION_BG_SCENES.filter((item) => item.genre === "로맨스").length);
  });
  it("searches multiple terms across tags and time of day", () => {
    expect(filterStudio2dScenes(groups, { query: " 비   밤 " })).toContain(scene("webtoon-neon-alley"));
    expect(filterStudio2dScenes(groups, { query: "실내 태블릿" })).toEqual([scene("webtoon-creator-room")]);
    expect(filterStudio2dScenes(groups, { query: "판타지 숲" })).toContain(scene("webtoon-moonlit-forest"));
  });
  it("handles case and full-width normalization", () => {
    expect(filterStudio2dScenes(groups, { query: "ｓｆ" })).toEqual(filterStudio2dScenes(groups, { query: "SF" }));
  });
  it("filters reviewed source aspect ratios without guessing vector dimensions", () => {
    expect(filterStudio2dScenes(groups, { orientation: "landscape" })).toHaveLength(32 + STUDIO_ILLUSTRATION_BG_SCENES.filter((item) => item.width > item.height).length);
    expect(filterStudio2dScenes(groups, { orientation: "square" })).toEqual([scene("webtoon-palace")]);
    expect(filterStudio2dScenes(groups, { orientation: "portrait" })).toHaveLength(20);
  });
  it("does not advertise people scenes or unknown vectors as person-free images", () => {
    const result = filterStudio2dScenes(groups, { emptySceneOnly: true });
    expect(result).not.toContain(scene("polyhaven-background-rooitou-park"));
    expect(result).not.toContain(scene("polyhaven-background-the-sky-is-on-fire"));
    expect(result).toContain(scene("webtoon-rooftop-sunset"));
    expect(result.every((item) => getStudio2dAssetMetadata(item)?.containsPeople === false)).toBe(true);
  });
  it("preserves metadata for verified compatibility aliases but not unrelated replacements", () => {
    const asset = STUDIO_2D_ASSET_METADATA.find((item) => item.legacySrc)!;
    const original = anyScene(asset.id);
    expect(getStudio2dAssetMetadata({ ...original, imgSrc: asset.legacySrc! })).toBe(asset);
    expect(getStudio2dAssetMetadata({ ...original, imgSrc: "/unreviewed.jpg" })).toBeUndefined();
  });
  it("does not recommend new or unregistered raster IDs", () => {
    const unknown: Studio2dScene = { id: "unreviewed", label: "새 배경", genre: "daily", imgSrc: "/new.png" };
    expect(isRecommendedStudio2dScene(unknown)).toBe(false);
    expect(studio2dResolutionLabel(unknown)).toBe("원본 정보 미확인");
  });
  it("deduplicates overlapping collections and leaves inputs unchanged", () => {
    const before = JSON.stringify(groups);
    const result = filterStudio2dScenes([...groups, ...groups]);
    expect(result).toHaveLength(BG_SCENES.length);
    expect(JSON.stringify(groups)).toBe(before);
  });
  it("sorts by actual original pixel count and provides stable name ordering", () => {
    const result = filterStudio2dScenes(groups, { quality: "raster", sort: "resolution" });
    const sizes = result.map((item) => getStudio2dAssetMetadata(item)!).map((item) => item.width * item.height);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(filterStudio2dScenes(groups, { sort: "name" })).toHaveLength(BG_SCENES.length);
  });
  it("checks original resolution boundaries without NaN or fractional promotion", () => {
    expect(isLargeStudio2dAsset({ width: 1672, height: 941 })).toBe(true);
    expect(isLargeStudio2dAsset({ width: 4096, height: 200 })).toBe(false);
    expect(isLargeStudio2dAsset({ width: NaN, height: 1024 })).toBe(false);
    expect(isLargeStudio2dAsset({ width: 1024.5, height: 1024 })).toBe(false);
    expect(studio2dOrientation(1024, 1024)).toBe("square");
  });
  it("returns zero results for incompatible filters instead of silently relaxing them", () => {
    expect(filterStudio2dScenes(groups, { quality: "vector", orientation: "portrait" })).toEqual([]);
    expect(filterStudio2dScenes(groups, { query: "존재하지않는배경" })).toEqual([]);
  });
});
