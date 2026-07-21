import { describe, expect, it } from "vitest";

import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
import {
  STUDIO_BRUSH_PACK_DESCRIPTORS,
  studioBrushPackDescriptorById,
} from "./studio-brush-pack-index";

describe("procedural brush pack catalogue", () => {
  it("describes all 67 ids with unique Korean labels and searchable preview metadata", () => {
    expect(STUDIO_BRUSH_PACK_DESCRIPTORS).toHaveLength(67);
    expect(STUDIO_BRUSH_PACK_DESCRIPTORS.map((item) => item.catalogId)).toEqual(
      STUDIO_BRUSH_PACK_CATALOG_IDS
    );
    expect(new Set(STUDIO_BRUSH_PACK_DESCRIPTORS.map((item) => item.catalogName)).size).toBe(67);

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

  it("does not silently resolve unknown catalogue identities", () => {
    expect(studioBrushPackDescriptorById("pen")).toBeNull();
    expect(studioBrushPackDescriptorById(0)).toBeNull();
    expect(studioBrushPackDescriptorById(undefined)).toBeNull();
  });
});
