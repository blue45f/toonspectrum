import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  resolveStudioBrushDynamics,
  serializeStudioBrushDynamicsSettingsCanonical,
} from "./studio-brush-dynamics";
import { studioBrushCatalogItemById, STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import { materializeStudioBrushPackSelection } from "./studio-brush-pack-runtime";
import {
  STUDIO_MATERIAL_BRUSH_DEFINITIONS,
  STUDIO_MATERIAL_BRUSH_IDS,
  studioMaterialBrushDefinition,
} from "./studio-material-brush-catalog";
import { studioProceduralTipCache } from "./studio-procedural-tip-rasterizer";

const input = {
  points: [0, 0, 20, 5, 50, -5, 100, 10, 200, 0],
  pressures: [0.15, 0.3, 0.7, 0.95, 0.2],
  speeds: [0.2, 0.2, 1, 2, 0.5],
  tiltXs: [0, 10, 20, 50, 10],
  tiltYs: [0, 0, 10, 30, 0],
  baseWidth: 40,
  baseOpacity: 1,
  maxDabs: 4096,
  seed: 20260913,
};

describe("material brushes in the actual product selection contract", () => {
  it("exposes 40 new tools in the public picker, not only an internal registry", () => {
    expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(88);
    for (const id of STUDIO_MATERIAL_BRUSH_IDS) {
      expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.some((row) => row.id === id), id).toBe(true);
      expect(studioBrushCatalogItemById(id)?.source, id).toBe("pro");
      expect(materializeStudioBrushPackSelection(id)?.catalogId, id).toBe(id);
    }
    expect(studioMaterialBrushDefinition("material-invented")).toBeNull();
    expect(materializeStudioBrushPackSelection("material-invented")).toBeNull();
  });

  it("does no field compilation on selection and keeps immutable snapshots detached", () => {
    studioProceduralTipCache.clear();
    for (const id of STUDIO_MATERIAL_BRUSH_IDS) {
      const first = materializeStudioBrushPackSelection(id)!;
      const second = materializeStudioBrushPackSelection(id)!;
      expect(first.brushDynamics).not.toBe(second.brushDynamics);
      first.brushDynamics.width.base = 999;
      expect(second.brushDynamics.width.base).toBe(second.defaultWidth);
      expect(second.brushDynamics.tip.alphaMapSize).toBe(64);
      expect(second.brushDynamics.tipLayers).toHaveLength(0);
      expect(second.brushDynamics.opacity.base).toBe(1);
      expect(second.brushDynamics.colorDynamics.hueJitter).toBe(0);
      expect(new TextEncoder().encode(JSON.stringify(second.brushDynamics)).byteLength).toBeLessThan(14 * 1024);
    }
    expect(studioProceduralTipCache.stats().misses).toBe(0);
  });

  it.each(STUDIO_MATERIAL_BRUSH_IDS)("preserves %s material bytes and dabs after JSON persistence", (id) => {
    const selection = materializeStudioBrushPackSelection(id)!;
    const settings = selection.brushDynamics;
    const replay = normalizeStudioBrushDynamicsSettings(JSON.parse(JSON.stringify(settings)));
    expect(serializeStudioBrushDynamicsSettingsCanonical(replay))
      .toBe(serializeStudioBrushDynamicsSettingsCanonical(settings));
    const first = planNormalizedStudioDynamicBrushDabs(input, settings);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(input.maxDabs);
    expect(planNormalizedStudioDynamicBrushDabs(input, replay)).toEqual(first);
    expect(settings.tip.alphaMapBase64).toBe(replay.tip.alphaMapBase64);
  });

  it.each(STUDIO_MATERIAL_BRUSH_IDS)("maps real pressure monotonically for %s without changing spacing by speed", (id) => {
    const settings = materializeStudioBrushPackSelection(id)!.brushDynamics;
    const widths: number[] = [], flows: number[] = [];
    for (const pressure of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const resolved = resolveStudioBrushDynamics({ pressure, speed: 0.5, tiltX: 0, tiltY: 0 }, settings);
      widths.push(resolved.width); flows.push(resolved.flow);
    }
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(flows).toEqual([...flows].sort((a, b) => a - b));
    expect(widths.at(-1)!).toBeGreaterThan(widths[0]! * 1.5);
    expect(settings.spacing.mappings).toHaveLength(0);
    expect(settings.width.jitter).toBeNull();
  });

  it("keeps tilt shading responsive and small opaque decoration geometry unsquashed", () => {
    for (const definition of STUDIO_MATERIAL_BRUSH_DEFINITIONS) {
      const settings = materializeStudioBrushPackSelection(`material-${definition.program}`)!.brushDynamics;
      const flat = resolveStudioBrushDynamics({ pressure: 0.5, tiltX: 0, tiltY: 0 }, settings);
      const tilted = resolveStudioBrushDynamics({ pressure: 0.5, tiltX: 60, tiltY: 20 }, settings);
      if (definition.tiltRatio < 0.8) {
        expect(tilted.width, definition.program).toBeGreaterThan(flat.width);
        expect(tilted.roundness, definition.program).toBeLessThan(flat.roundness);
      } else if (definition.tiltRatio === 1) {
        expect(tilted.roundness, definition.program).toBe(flat.roundness);
      }
    }
  });
});
