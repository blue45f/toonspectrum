import { describe, expect, it } from "vitest";

import { planNormalizedStudioDynamicBrushDabs } from "./studio-brush-dynamics";
import {
  STUDIO_BRUSH_PACK_EXPANSION_WAVE_IDS,
  studioBrushPackExpansionTuningById,
} from "./studio-brush-pack-expansion";
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
import { STUDIO_BRUSH_TIP_LAYER_MAX_COUNT } from "./studio-brush-tip-composition";
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

function withoutSeedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSeedFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    key === "seed" ? 0 : withoutSeedFields(entry),
  ]));
}

describe("procedural brush pack runtime", () => {
  it("materializes all 120 descriptors into the shared selection contract", () => {
    const selections = materializeAllStudioBrushPackSelections();
    expect(selections).toHaveLength(120);
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

  it("gives all 120 catalogue brushes a distinct deterministic runtime fingerprint", () => {
    const first = STUDIO_BRUSH_PACK_CATALOG_IDS.map(studioBrushPackRuntimeSignature);
    const second = STUDIO_BRUSH_PACK_CATALOG_IDS.map(studioBrushPackRuntimeSignature);
    const physical = materializeAllStudioBrushPackSelections().map((selection) => JSON.stringify(withoutSeedFields({
      runtimeBrushId: selection.runtimeBrushId,
      brushDynamics: selection.brushDynamics,
    })));
    expect(first).toEqual(second);
    expect(first.every((signature) => typeof signature === "string" && signature.length > 100)).toBe(true);
    expect(new Set(first).size).toBe(120);
    // Neither the stroke seed nor nested grain seeds may be the sole differentiator.
    expect(new Set(physical).size).toBe(120);
  });

  it("plans a finite, visible, deterministic engine stroke for every catalogue preset", () => {
    for (const selection of materializeAllStudioBrushPackSelections()) {
      const input = {
        baseOpacity: selection.defaultOpacity,
        baseWidth: selection.defaultWidth,
        directions: [0, 18, -12, 24],
        maxDabs: 512,
        points: [4, 28, 24, 10, 48, 34, 76, 16],
        pressures: [0.28, 0.64, 0.86, 0.48],
        seed: 0x13ad_beef,
        speeds: [0.2, 0.8, 1.4, 0.5],
        tiltXs: [0, 24, 48, 12],
        tiltYs: [0, -18, 36, 10],
      };
      const first = planNormalizedStudioDynamicBrushDabs(input, selection.brushDynamics);
      const replay = planNormalizedStudioDynamicBrushDabs(input, selection.brushDynamics);
      expect(first, `${selection.catalogId}: no planned dabs`).not.toHaveLength(0);
      expect(replay, `${selection.catalogId}: non-deterministic dabs`).toEqual(first);
      for (const dab of first) {
        expect(Object.values(dab).every(Number.isFinite), `${selection.catalogId}: invalid dab`).toBe(true);
        expect(dab.size, `${selection.catalogId}: invisible size`).toBeGreaterThan(0);
        expect(dab.opacity * dab.flow, `${selection.catalogId}: invisible flow`).toBeGreaterThan(0);
      }
      const alphaMap = buildStudioBrushTipAlphaMap(selection.brushDynamics.tip);
      expect(
        alphaMap.alphas.some((alpha) => alpha > 0),
        `${selection.catalogId}: empty tip alpha`
      ).toBe(true);
    }
  });

  it("materializes bounded phase-two colour, grain-space and multi-tip contracts", () => {
    const selections = materializeAllStudioBrushPackSelections();
    const coloured = selections.filter((selection) => (
      selection.brushDynamics.colorDynamics.hueJitter > 0
      || selection.brushDynamics.colorDynamics.saturationJitter > 0
      || selection.brushDynamics.colorDynamics.valueJitter > 0
    ));
    const grained = selections.filter((selection) => selection.brushDynamics.grain.amount > 0);
    const layered = selections.filter((selection) => selection.brushDynamics.tipLayers.length > 0);

    expect(coloured.length).toBeGreaterThanOrEqual(20);
    expect(grained.length).toBeGreaterThanOrEqual(20);
    expect(new Set(grained.map((selection) => selection.brushDynamics.grain.space))).toEqual(
      new Set(["canvas-fixed", "stroke-fixed"])
    );
    expect(layered.length).toBeGreaterThanOrEqual(10);
    expect(layered.some((selection) => selection.brushDynamics.tipLayers.length === 2)).toBe(true);

    for (const selection of selections) {
      expect(selection.brushDynamics.tipLayers.length).toBeLessThanOrEqual(
        STUDIO_BRUSH_TIP_LAYER_MAX_COUNT
      );
      // brushDynamics shares the CRDT's 16 KiB metadata envelope with a few small scalar fields.
      expect(new TextEncoder().encode(JSON.stringify(selection.brushDynamics)).byteLength)
        .toBeLessThan(14 * 1024);
    }
  });

  it("rejects unknown ids rather than silently selecting a fallback brush", () => {
    expect(materializeStudioBrushPackDynamics("pen")).toBeNull();
    expect(materializeStudioBrushPackSelection("not-a-brush")).toBeNull();
    expect(studioBrushPackRuntimeSignature(null)).toBeNull();
  });

  it("hand-tunes the 2026-07 expansion wave without touching pre-expansion physics", () => {
    // Tuning strictly targets appended ids; every original catalogue id must resolve to null so
    // saved strokes recorded before the expansion replay byte-identically.
    const waveIds = new Set<string>(STUDIO_BRUSH_PACK_EXPANSION_WAVE_IDS);
    for (const id of STUDIO_BRUSH_PACK_CATALOG_IDS) {
      expect(
        studioBrushPackExpansionTuningById(id) !== null,
        `${id}: tuning table membership drift`
      ).toBe(waveIds.has(id));
    }

    const dynamicsById = (id: (typeof STUDIO_BRUSH_PACK_CATALOG_IDS)[number]) =>
      materializeStudioBrushPackDynamics(id)!;

    // Technical liner ignores pressure entirely; the G-pen swells dramatically instead.
    const milli = dynamicsById("milli-pen-uniform");
    expect(milli.width.mappings).toHaveLength(0);
    expect(milli.taper.enabled).toBe(false);
    const gPen = dynamicsById("g-pen-flex");
    expect(gPen.width.mappings[0]).toMatchObject({ source: "pressure", from: 0.12, to: 1.9 });
    expect(gPen.taper.enabled).toBe(true);
    expect(gPen.taper.minSizeRatio).toBeLessThanOrEqual(0.05);

    // The calligraphy nib rotates with the stylus azimuth, never with the stroke direction.
    const calligraphy = dynamicsById("calligraphy-tilt-nib");
    expect(calligraphy.angle.mappings.map((mapping) => mapping.source)).toEqual([
      "tilt-azimuth",
      "twist",
    ]);
    const tiltPencil = dynamicsById("pencil-tilt-shading");
    expect(tiltPencil.width.mappings.some((mapping) => mapping.source === "tilt-magnitude")).toBe(true);

    // Grain pin-mode contrast: pastel tooth stays canvas-pinned, crayon wax drags with the stroke.
    expect(dynamicsById("pastel-paper-soft").grain).toMatchObject({
      space: "canvas-fixed",
      amount: 0.55,
    });
    expect(dynamicsById("crayon-wax-bold").grain.space).toBe("stroke-fixed");
    expect(dynamicsById("oil-impasto-heavy").spacingRatio).toBeLessThan(0.06);

    // Colour dynamics land on the colored pencil and the autumn leaf scatter.
    expect(dynamicsById("pencil-colored-soft").colorDynamics.hueJitter).toBeGreaterThan(0);
    expect(dynamicsById("leaf-fall-flurry").colorDynamics.hueJitter).toBeGreaterThanOrEqual(10);

    // Stamps and scatters: rope dabs sit one tip-width apart, splatter bursts under pressure,
    // rain keeps a fixed diagonal with velocity-driven spacing.
    expect(dynamicsById("rope-twist-stamp").spacingRatio).toBeGreaterThanOrEqual(0.9);
    expect(dynamicsById("sponge-stipple-dab").spacingRatio).toBeGreaterThanOrEqual(0.7);
    expect(
      dynamicsById("ink-splatter-burst").scatter.mappings.some(
        (mapping) => mapping.source === "pressure"
      )
    ).toBe(true);
    const rain = dynamicsById("rain-streak-diagonal");
    expect(rain.angle.base).toBeLessThan(-60);
    expect(rain.angle.mappings.some((mapping) => mapping.source === "direction")).toBe(false);
    expect(rain.width.mappings.some((mapping) => mapping.source === "speed")).toBe(true);
    expect(dynamicsById("snow-flurry-flake").angle.jitter).toMatchObject({ amount: 180 });

    // Multi-tip composition still applies to the expansion's foliage and rake members.
    expect(dynamicsById("leaf-fall-flurry").tipLayers.length).toBeGreaterThan(0);
    expect(dynamicsById("fur-soft-clumps").tipLayers.length).toBeGreaterThan(0);
  });
});
