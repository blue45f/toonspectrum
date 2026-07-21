import { describe, expect, it } from "vitest";

import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "./studio-brush-pack-index";
import {
  STUDIO_BRUSH_PACK_CUSTOM_TIP_MOTIFS,
  materializeAllStudioBrushPackSelections,
  materializeStudioBrushPackDynamics,
  materializeStudioBrushPackSelection,
  materializeStudioBrushPackTipSettings,
  studioBrushPackRuntimeSignature,
} from "./studio-brush-pack-runtime";
import {
  buildStudioBrushTipAlphaMap,
  decodeStudioBrushTipAlphaMapBase64,
} from "./studio-brush-tip-stamp";

function expectFiniteNumbers(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), path).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => expectFiniteNumbers(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      expectFiniteNumbers(entry, `${path}.${key}`);
    }
  }
}

function alphaSignature(values: Float32Array): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= Math.round(value * 255);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("procedural brush pack runtime", () => {
  it("materializes all 67 descriptors into the shared selection contract", () => {
    const selections = materializeAllStudioBrushPackSelections();
    expect(selections).toHaveLength(67);
    expect(selections.map((selection) => selection.catalogId)).toEqual(
      STUDIO_BRUSH_PACK_CATALOG_IDS
    );

    for (const [index, selection] of selections.entries()) {
      const descriptor = STUDIO_BRUSH_PACK_DESCRIPTORS[index]!;
      expect(selection).toMatchObject({
        catalogId: descriptor.catalogId,
        catalogName: descriptor.catalogName,
        defaultWidth: descriptor.defaultWidth,
        defaultOpacity: descriptor.defaultOpacity,
        runtimeBrushId: descriptor.runtimeBrushId,
        mediaGroup: descriptor.mediaGroup,
        previewStyle: descriptor.previewStyle,
        shortName: descriptor.shortName,
        hint: descriptor.hint,
      });
      expect(["ink-particle", "airbrush", "dry-media"]).toContain(selection.runtimeBrushId);
      expectFiniteNumbers(selection.brushDynamics, selection.catalogId);
      expect(selection.brushDynamics.width.base).toBe(selection.defaultWidth);
      // Element opacity is the sole catalogue-default multiplier; dynamics stays neutral to avoid
      // squaring low-opacity presets before flow and pressure are evaluated.
      expect(selection.brushDynamics.opacity.base).toBe(1);
      expect(materializeStudioBrushPackSelection(selection.catalogId)).toEqual(selection);
      expect(materializeStudioBrushPackDynamics(selection.catalogId)).toEqual(selection.brushDynamics);
    }
  });

  it("generates deterministic original alpha tips for every custom motif", () => {
    const signatures = new Set<string>();
    for (const [index, motif] of STUDIO_BRUSH_PACK_CUSTOM_TIP_MOTIFS.entries()) {
      const first = materializeStudioBrushPackTipSettings(motif, index + 17, 0.12);
      const second = materializeStudioBrushPackTipSettings(motif, index + 17, 0.12);
      expect(first).toEqual(second);
      expect(first.alphaMapBase64).not.toBeNull();
      const bytes = decodeStudioBrushTipAlphaMapBase64(first.alphaMapBase64);
      expect(bytes).not.toBeNull();
      expect(bytes).toHaveLength(first.alphaMapSize * first.alphaMapSize);

      const firstMap = buildStudioBrushTipAlphaMap(first);
      const secondMap = buildStudioBrushTipAlphaMap(second);
      expect(firstMap.custom).toBe(true);
      expect(Array.from(firstMap.alphas)).toEqual(Array.from(secondMap.alphas));
      expect(firstMap.alphas.some((alpha) => alpha > 0.5), `${motif}: invisible tip`).toBe(true);
      signatures.add(alphaSignature(firstMap.alphas));
    }
    expect(signatures.size).toBe(STUDIO_BRUSH_PACK_CUSTOM_TIP_MOTIFS.length);
  });

  it("gives all 67 catalogue brushes a distinct deterministic runtime signature", () => {
    const first = STUDIO_BRUSH_PACK_CATALOG_IDS.map(studioBrushPackRuntimeSignature);
    const second = STUDIO_BRUSH_PACK_CATALOG_IDS.map(studioBrushPackRuntimeSignature);
    const physical = materializeAllStudioBrushPackSelections().map((selection) => JSON.stringify({
      runtimeBrushId: selection.runtimeBrushId,
      brushDynamics: { ...selection.brushDynamics, seed: 0 },
    }));
    expect(first).toEqual(second);
    expect(first.every((signature) => typeof signature === "string" && signature.length > 100)).toBe(true);
    expect(new Set(first).size).toBe(67);
    // A unique seed alone must not be the differentiator: every brush has distinct tip physics.
    expect(new Set(physical).size).toBe(67);
  });

  it("rejects unknown ids rather than silently selecting a fallback brush", () => {
    expect(materializeStudioBrushPackDynamics("pen")).toBeNull();
    expect(materializeStudioBrushPackSelection("not-a-brush")).toBeNull();
    expect(studioBrushPackRuntimeSignature(null)).toBeNull();
  });
});
