import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BRUSH_PRESETS,
  STUDIO_BRUSH_RENDER_FAMILY,
  resolveStudioBrushRenderFamily,
} from "./studio-brush";
import { resolveStudioBrushDynamicsPresetId } from "./studio-brush-dynamics";
import { resolveStudioStampBrushKind } from "./studio-brush-stamp-engine";
import { listStudioBrushTrayItems } from "./studio-creative-ux";
import { filterStudioBrushLibraryItems } from "./studio-draw-ux";
import { LargeBrushPreview } from "./StudioBrushLibrarySheet";

const SUPPORTED_PREVIEW_KINDS = new Set([
  "ribbon",
  "calligraphy",
  "marker",
  "square-marker",
  "pencil",
  "texture",
  "soft-air",
  "soft-wash",
  "soft-pigment",
  "oil",
  "neon",
  "glow",
  "particle",
  "tone",
]);

describe("35-preset brush catalog contract", () => {
  it("maps every preset exactly once into selectable catalog metadata", () => {
    const catalog = listStudioBrushTrayItems("all");
    const filteredCatalog = filterStudioBrushLibraryItems({ category: "all" });
    const presetIds = BRUSH_PRESETS.map((preset) => preset.id);

    expect(BRUSH_PRESETS).toHaveLength(35);
    expect(new Set(presetIds).size).toBe(35);
    expect(catalog.map((item) => item.id)).toEqual(filteredCatalog.map((item) => item.id));
    expect(new Set(catalog.map((item) => item.id))).toEqual(new Set(presetIds));
  });

  it("gives every preset an explicit renderer, engine route, preview, and exact-id search result", () => {
    const catalog = new Map(listStudioBrushTrayItems("all").map((item) => [item.id, item]));

    for (const preset of BRUSH_PRESETS) {
      const item = catalog.get(preset.id);
      expect(item, `${preset.id}: missing catalog item`).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(STUDIO_BRUSH_RENDER_FAMILY, preset.id),
        `${preset.id}: relies on unknown-brush fallback`
      ).toBe(true);

      const family = resolveStudioBrushRenderFamily(preset.id);
      const stampKind = resolveStudioStampBrushKind(preset.id);
      const dynamicsId = resolveStudioBrushDynamicsPresetId(preset.id);
      const dynamicsFamily = family === "airbrush" || family === "dry-media" || family === "ink-particle";
      const previewHtml = renderToStaticMarkup(
        createElement(LargeBrushPreview, { item: item!, active: false })
      );
      const previewKind = /data-studio-brush-preview-kind="([^"]+)"/.exec(previewHtml)?.[1];

      expect(stampKind !== null, `${preset.id}: stamp route mismatch`).toBe(family === "stamp");
      expect(dynamicsId !== null, `${preset.id}: dynamics route mismatch`).toBe(dynamicsFamily);
      expect(
        previewKind !== undefined && SUPPORTED_PREVIEW_KINDS.has(previewKind),
        `${preset.id}: unsupported catalog preview`
      ).toBe(true);
      expect(
        filterStudioBrushLibraryItems({ category: "all", query: preset.id }).some(
          (result) => result.id === preset.id
        ),
        `${preset.id}: not selectable through exact-id catalog search`
      ).toBe(true);
    }
  });
});
