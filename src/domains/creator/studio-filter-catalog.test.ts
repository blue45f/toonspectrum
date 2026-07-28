import { describe, expect, it } from "vitest";

import { STUDIO_ADJUSTMENT_ENGINE_IDS } from "./studio-adjustment-stack";
import {
  STUDIO_FILTER_CATALOG,
  STUDIO_FILTER_DIALOG_CATALOG,
  STUDIO_FILTER_GROUP_ORDER,
  searchStudioFilterCatalog,
  searchStudioFilterDialogCatalog,
  studioFilterDialogPreviewStyle,
} from "./studio-filter-catalog";
import { STUDIO_FILTER_MENU_KINDS } from "./studio-filter-menu";
import { STUDIO_FILTER_UNION_WAVE_KINDS } from "./studio-filter-union-wave";

describe("studio filter catalog", () => {
  it("covers every smart-filter engine and the deterministic union wave exactly once", () => {
    const catalogIds = STUDIO_FILTER_CATALOG.map((entry) => entry.engine);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(catalogIds.length).toBeGreaterThanOrEqual(64);
    expect([...catalogIds].sort()).toEqual(
      [...STUDIO_ADJUSTMENT_ENGINE_IDS, ...STUDIO_FILTER_UNION_WAVE_KINDS].sort(),
    );
    for (const entry of STUDIO_FILTER_CATALOG) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(10);
      expect(entry.keywords.length).toBeGreaterThan(0);
      expect(STUDIO_FILTER_GROUP_ORDER).toContain(entry.group);
    }
  });

  it("searches Korean, English aliases, descriptions, and multiple terms locally", () => {
    expect(searchStudioFilterCatalog("감마").map((entry) => entry.engine))
      .toEqual(expect.arrayContaining(["levels", "exposure"]));
    expect(searchStudioFilterCatalog("dilate").map((entry) => entry.engine)).toEqual(["morphology"]);
    expect(searchStudioFilterCatalog("사용자 커널").map((entry) => entry.engine))
      .toEqual(["custom-convolution"]);
    expect(searchStudioFilterCatalog("구름 시드").map((entry) => entry.engine)).toEqual(["clouds"]);
    expect(searchStudioFilterCatalog("방사형 회전").map((entry) => entry.engine)).toEqual(["spin-blur"]);
    expect(searchStudioFilterCatalog("모자이크").map((entry) => entry.engine))
      .toEqual(["pixelate", "crystal-mosaic", "stained-glass"]);
    expect(searchStudioFilterCatalog("sobel").map((entry) => entry.engine))
      .toEqual(["line-extraction", "edge-detect", "poster-edges"]);
    expect(searchStudioFilterCatalog("cmyk 망점").map((entry) => entry.engine))
      .toEqual(["color-halftone"]);
    expect(searchStudioFilterCatalog("어안").map((entry) => entry.engine)).toEqual(["fisheye"]);
    expect(searchStudioFilterCatalog("복사기 먹선").map((entry) => entry.engine)).toEqual(["photocopy"]);
    expect(searchStudioFilterCatalog("노멀 맵").map((entry) => entry.engine)).toEqual(["normal-map"]);
  });

  it("honors an allowed-engine boundary without changing catalog order", () => {
    expect(searchStudioFilterCatalog("", ["clouds", "blur"]).map((entry) => entry.engine))
      .toEqual(["blur", "clouds"]);
  });

  it("covers every directly applicable dialog filter exactly once", () => {
    const kinds = STUDIO_FILTER_DIALOG_CATALOG.map((entry) => entry.kind);

    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...STUDIO_FILTER_MENU_KINDS].sort());
    expect(kinds.length).toBeGreaterThanOrEqual(36);
  });

  it("searches dialog aliases and synthetic filter metadata without a network dependency", () => {
    expect(searchStudioFilterDialogCatalog("픽셀").map((entry) => entry.kind))
      .toContain("mosaic");
    expect(searchStudioFilterDialogCatalog("RGB 분리").map((entry) => entry.kind))
      .toEqual(expect.arrayContaining(["chromatic-aberration", "glitch"]));
    expect(searchStudioFilterDialogCatalog("CRT").map((entry) => entry.kind))
      .toEqual(["scanline"]);
    expect(searchStudioFilterDialogCatalog("투톤").map((entry) => entry.kind))
      .toEqual(["duotone"]);
  });

  it("builds deterministic copyright-free CSS previews for every dialog filter", () => {
    for (const entry of STUDIO_FILTER_DIALOG_CATALOG) {
      const first = studioFilterDialogPreviewStyle(entry);
      const second = studioFilterDialogPreviewStyle(entry);
      expect(first).toEqual(second);
      expect(first.background.length).toBeGreaterThan(20);
      expect(first.background).not.toMatch(/url\s*\(/iu);
      expect(first.background).not.toMatch(/https?:/iu);
    }
  });
});
