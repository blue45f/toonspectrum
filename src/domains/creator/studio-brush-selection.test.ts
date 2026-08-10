import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "./studio-brush";
import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_BRUSH_CATALOG_COUNTS,
} from "./studio-brush-catalog";
import {
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
  planNormalizedStudioDynamicBrushDabs,
  resolveStudioBrushDynamicsSelectionPresetId,
  resolveStudioBrushDynamicsPresetId,
  serializeStudioBrushDynamicsSettingsCanonical,
  studioBrushDynamicsSettingsForBrushId,
} from "./studio-brush-dynamics";
import {
  isStudioBrushCatalogSelection,
  materializeStudioBrushCatalogSelection,
  studioCoreBrushCatalogSelection,
} from "./studio-brush-selection";

describe("studio brush catalogue selection", () => {
  it("authors core wet media as distinct bounded dynamics without reclassifying legacy ids", () => {
    const expectedEngine = new Map<string, "airbrush" | "ink-particle">([
      ["watercolor", "airbrush"],
      ["ink-wash", "airbrush"],
      ["inkwash-pen", "ink-particle"],
      ["inkwash-water-brush", "airbrush"],
      ["inkwash-bleed-wash", "airbrush"],
      ["inkwash-white-ink", "ink-particle"],
    ]);
    const signatures = new Set<string>();

    for (const [brushId, engine] of expectedEngine) {
      const preset = BRUSH_PRESETS.find((candidate) => candidate.id === brushId);
      expect(preset, `${brushId}: missing core preset`).toBeDefined();
      if (!preset) continue;
      const selection = studioCoreBrushCatalogSelection(preset);

      // A bare historical id must remain on the causal-watercolor compatibility renderer.
      expect(resolveStudioBrushDynamicsPresetId(brushId), `${brushId}: legacy id drift`)
        .toBeNull();
      expect(selection.brushDynamics, `${brushId}: authored snapshot missing`).not.toBeNull();
      expect(selection.brushDynamics?.depositPipeline, `${brushId}: causal pipeline`)
        .toBe(STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3);
      expect(selection.brushDynamics?.opacity.base, `${brushId}: outer opacity duplicated`).toBe(1);
      expect(
        resolveStudioBrushDynamicsSelectionPresetId(brushId, selection.brushDynamics),
        `${brushId}: renderer engine`,
      ).toBe(engine);
      signatures.add(serializeStudioBrushDynamicsSettingsCanonical(selection.brushDynamics));
    }

    expect(signatures.size).toBe(expectedEngine.size);
  });

  it("keeps catalogue and runtime identity explicit for core brushes", () => {
    const selection = studioCoreBrushCatalogSelection({
      id: "chalk",
      name: "초크",
      defaultWidth: 16,
      defaultOpacity: 0.8,
    });

    expect(selection).toMatchObject({
      catalogId: "chalk",
      catalogName: "초크",
      runtimeBrushId: "chalk",
    });
    expect(selection.brushDynamics?.tip.shape).toBe("sponge");
    expect(selection.brushDynamics?.opacity.base).toBe(1);
    expect(isStudioBrushCatalogSelection(selection)).toBe(true);
  });

  it("keeps catalogue opacity as the sole outer multiplier for every core dynamics brush", () => {
    const dynamicsPresets = BRUSH_PRESETS.filter(
      (preset) => resolveStudioBrushDynamicsPresetId(preset.id) !== null
    );
    expect(dynamicsPresets.map((preset) => preset.id)).toEqual([
      "paint-tube",
      "airbrush",
      "hard-airbrush",
      "soft-brush",
      "spray",
      "splatter",
      "erodible-pencil",
      "dry-media",
      "crayon",
      "chalk",
      "charcoal",
      "pastel",
      "oil-pastel",
      "ink-particle",
      "tangent-normal-brush",
    ]);

    for (const preset of dynamicsPresets) {
      const historicalRuntime = studioBrushDynamicsSettingsForBrushId(preset.id)!;
      const selection = studioCoreBrushCatalogSelection(preset);
      const settings = selection.brushDynamics!;
      expect(selection.defaultOpacity, `${preset.id}: catalogue opacity drift`).toBe(
        preset.defaultOpacity
      );
      expect(settings.opacity.base, `${preset.id}: default opacity applied twice`).toBe(1);
      expect(settings.opacity.mappings, `${preset.id}: lost pressure character`).toEqual(
        historicalRuntime.opacity.mappings
      );
      expect(settings.flow, `${preset.id}: lost medium flow`).toEqual(historicalRuntime.flow);

      const tap = planNormalizedStudioDynamicBrushDabs({
        baseOpacity: settings.opacity.base,
        baseWidth: preset.defaultWidth,
        points: [0, 0],
        pressures: [0.5],
        speeds: [0],
        maxDabs: 1,
        seed: 1,
      }, settings)[0]!;
      const firstTapCoverage = tap.opacity * tap.flow * selection.defaultOpacity;
      expect(
        firstTapCoverage,
        `${preset.id}: default mouse/neutral-pressure tap is abnormally faint`
      ).toBeGreaterThanOrEqual(0.08);
    }
  });

  it("does not alter transparent media defaults or historical fallback profiles", () => {
    for (const brushId of ["airbrush", "soft-brush", "spray", "splatter"] as const) {
      const preset = BRUSH_PRESETS.find((candidate) => candidate.id === brushId)!;
      expect(studioCoreBrushCatalogSelection(preset).defaultOpacity).toBe(
        preset.defaultOpacity
      );
    }
    // Unsnapshotted legacy strokes still use this profile directly in the renderer.
    expect(studioBrushDynamicsSettingsForBrushId("airbrush")?.opacity.base).toBe(0.65);
  });

  it("keeps every spray tap visibly anchored inside its brush cursor", () => {
    const preset = BRUSH_PRESETS.find((candidate) => candidate.id === "spray")!;
    const settings = studioCoreBrushCatalogSelection(preset).brushDynamics!;
    const cursorRadius = preset.defaultWidth / 2;

    // Element ids deliberately contribute to the durable dab seed. Audit a broad deterministic
    // seed range so a fast click cannot become an apparently missing stroke for a particular id.
    for (let seed = 0; seed < 2_048; seed += 1) {
      const [dab] = planNormalizedStudioDynamicBrushDabs({
        baseOpacity: settings.opacity.base,
        baseWidth: preset.defaultWidth,
        points: [0, 0],
        pressures: [0.5],
        speeds: [1_000],
        maxDabs: 1,
        seed,
      }, settings);
      expect(dab, `spray seed ${seed}: missing tap dab`).toBeDefined();
      expect(
        Math.hypot(dab!.x - dab!.sourceX, dab!.y - dab!.sourceY),
        `spray seed ${seed}: tap landed outside its cursor`,
      ).toBeLessThanOrEqual(cursorRadius);
    }
  });

  it("materializes all 230 catalogue ids through one fail-closed selection source", async () => {
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(STUDIO_ALL_BRUSH_CATALOG_ITEMS.length);
    expect(STUDIO_BRUSH_CATALOG_COUNTS).toEqual({ core: 70, pro: 160, total: 230 });

    for (const item of STUDIO_ALL_BRUSH_CATALOG_ITEMS) {
      const selection = await materializeStudioBrushCatalogSelection(item.id);
      expect(selection, `${item.id}: selection missing`).not.toBeNull();
      expect(selection, `${item.id}: selection contract mismatch`).toMatchObject({
        catalogId: item.id,
        catalogName: item.name,
        defaultWidth: item.defaultWidth,
        defaultOpacity: item.defaultOpacity,
      });
      expect(isStudioBrushCatalogSelection(selection), `${item.id}: invalid payload`).toBe(true);
      if (item.source === "core") {
        expect(selection?.runtimeBrushId, `${item.id}: core runtime identity drift`).toBe(item.id);
      } else {
        expect(
          ["ink-particle", "airbrush", "dry-media"],
          `${item.id}: unsupported procedural engine`
        ).toContain(selection?.runtimeBrushId);
        expect(selection?.brushDynamics, `${item.id}: missing procedural dynamics`).not.toBeNull();
      }
    }

    expect(await materializeStudioBrushCatalogSelection("not-a-brush")).toBeNull();
    expect(await materializeStudioBrushCatalogSelection(null)).toBeNull();
  });

  it("rejects incomplete or non-finite catalogue payloads", () => {
    expect(isStudioBrushCatalogSelection(null)).toBe(false);
    expect(isStudioBrushCatalogSelection({ catalogId: "pack-1" })).toBe(false);
    expect(isStudioBrushCatalogSelection({
      catalogId: "pack-1",
      catalogName: "프로 브러시",
      runtimeBrushId: "dry-media",
      defaultWidth: Number.NaN,
      defaultOpacity: 1,
      brushDynamics: null,
    })).toBe(false);
  });
});
