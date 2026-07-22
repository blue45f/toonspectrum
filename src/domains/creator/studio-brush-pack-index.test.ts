import { describe, expect, it } from "vitest";

import { STUDIO_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
import {
  STUDIO_BRUSH_PACK_DESCRIPTORS,
  studioBrushPackDescriptorById,
} from "./studio-brush-pack-index";
import { filterStudioBrushLibraryItems } from "./studio-draw-ux";

const EXTENDED_MEDIA_IDS = [
  "technical-needle-ink",
  "broken-nib-ink",
  "side-graphite-shade",
  "compressed-charcoal-edge",
  "watercolor-detail-round",
  "watercolor-flat-wash",
  "opaque-gouache",
  "oil-filbert",
  "alcohol-chisel-marker",
  "taper-brush-marker",
  "pixel-square",
  "pixel-dither",
  "cross-hatch",
  "speed-hatch",
  "dense-halftone",
  "bokeh-scatter",
  "canvas-weave",
  "fine-hair-strands",
  "cloth-fold-rake",
  "pine-needle-cluster",
] as const;

describe("procedural brush pack catalogue", () => {
  it("describes all 87 ids with unique Korean labels and searchable preview metadata", () => {
    expect(STUDIO_BRUSH_PACK_DESCRIPTORS).toHaveLength(87);
    expect(STUDIO_BRUSH_PACK_DESCRIPTORS.map((item) => item.catalogId)).toEqual(
      STUDIO_BRUSH_PACK_CATALOG_IDS
    );
    expect(new Set(STUDIO_BRUSH_PACK_DESCRIPTORS.map((item) => item.catalogName)).size).toBe(87);

    for (const descriptor of STUDIO_BRUSH_PACK_DESCRIPTORS) {
      expect(descriptor.catalogName).toMatch(/[가-힣]/);
      expect(descriptor.shortName).toMatch(/[가-힣]/);
      expect(descriptor.hint.length).toBeGreaterThan(12);
      expect(["ink-particle", "airbrush", "dry-media"]).toContain(descriptor.runtimeBrushId);
      expect(["line", "marker", "paint", "fx", "texture"]).toContain(descriptor.mediaGroup);
      expect(descriptor.defaultWidth).toBeGreaterThanOrEqual(1);
      expect(descriptor.defaultWidth).toBeLessThanOrEqual(80);
      expect(descriptor.defaultOpacity).toBeGreaterThanOrEqual(0.05);
      expect(descriptor.defaultOpacity).toBeLessThanOrEqual(1);
      expect(descriptor.previewWeight).toBeGreaterThan(0);
      expect(descriptor.previewWeight).toBeLessThanOrEqual(1);
      expect(studioBrushPackDescriptorById(descriptor.catalogId)).toBe(descriptor);
      expect(Object.isFrozen(descriptor)).toBe(true);
    }
  });

  it("adds 20 non-branded production media across every requested general-purpose family", () => {
    expect(STUDIO_BRUSH_PACK_CATALOG_IDS.slice(-EXTENDED_MEDIA_IDS.length)).toEqual(
      EXTENDED_MEDIA_IDS
    );
    const extension = STUDIO_BRUSH_PACK_DESCRIPTORS.slice(-EXTENDED_MEDIA_IDS.length);
    expect(new Set(extension.map((item) => item.catalogName)).size).toBe(20);
    expect(new Set(extension.map((item) => item.shortName)).size).toBe(20);
    expect(new Set(extension.map((item) => item.category))).toEqual(new Set([
      "ink",
      "sketch",
      "chalk",
      "paint",
      "marker",
      "pixel",
      "tone",
      "effect",
      "texture",
      "rake",
      "foliage",
    ]));
    expect(new Set(extension.map((item) => item.mediaGroup))).toEqual(new Set([
      "line",
      "marker",
      "paint",
      "fx",
      "texture",
    ]));
  });

  it("finds every extended brush through a human-facing Korean behavior term", () => {
    const searchTerms = [
      ["technical-needle-ink", "제도선"],
      ["broken-nib-ink", "닳은 펜촉"],
      ["side-graphite-shade", "종이결"],
      ["compressed-charcoal-edge", "압축 목탄"],
      ["watercolor-detail-round", "세부 묘사"],
      ["watercolor-flat-wash", "물고임"],
      ["opaque-gouache", "매트한"],
      ["oil-filbert", "강모 결"],
      ["alcohol-chisel-marker", "알코올"],
      ["taper-brush-marker", "섬유형"],
      ["pixel-square", "픽셀 계단선"],
      ["pixel-dither", "디더링"],
      ["cross-hatch", "교차"],
      ["speed-hatch", "속도감"],
      ["dense-halftone", "스크린톤"],
      ["bokeh-scatter", "빛망울"],
      ["canvas-weave", "직조"],
      ["fine-hair-strands", "머리카락"],
      ["cloth-fold-rake", "옷주름"],
      ["pine-needle-cluster", "침엽수"],
    ] as const;

    for (const [id, query] of searchTerms) {
      const results = filterStudioBrushLibraryItems({
        catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
        category: "pro",
        query,
      });
      expect(
        results.some((item) => item.id === id),
        `${id}: missing semantic search term ${query}`
      ).toBe(true);
    }
  });

  it("does not silently resolve unknown catalogue identities", () => {
    expect(studioBrushPackDescriptorById("pen")).toBeNull();
    expect(studioBrushPackDescriptorById(0)).toBeNull();
    expect(studioBrushPackDescriptorById(undefined)).toBeNull();
  });
});
