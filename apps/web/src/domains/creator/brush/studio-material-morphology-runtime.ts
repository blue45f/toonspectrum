/** Material morphology -> the existing deterministic authoring, live, export and replay contract. */
import {
  normalizeStudioBrushDynamicsSettings,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
  studioBrushDynamicsPresetSettings,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsMappingSettings,
} from "./studio-brush-dynamics";
import {
  STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE,
} from "./studio-brush-tip-stamp";
import materialAtlas from "./studio-material-tip-atlas.generated.json";
import { studioMaterialIdentitySeed } from "./studio-procedural-tip-rasterizer";

import type { StudioMaterialBrushDefinition } from "./studio-material-brush-catalog";

export function materializeStudioMaterialBrushDynamics(
  definition: StudioMaterialBrushDefinition,
): NormalizedStudioBrushDynamicsSettings {
  const base = studioBrushDynamicsPresetSettings(definition.runtime);
  const dry = definition.runtime === "dry-media";
  const ribbon = definition.mode === "ribbon";
  const discrete = definition.mode === "stamp" || definition.mode === "scatter";
  const directional = ribbon || (!discrete && dry);
  const seed = studioMaterialIdentitySeed(`material-${definition.program}`);
  const widthMappings: StudioBrushDynamicsMappingSettings[] = [{
    source: "pressure",
    from: discrete ? 0.58 : ribbon ? 0.14 : 0.32,
    to: discrete ? 1.16 : 1.4,
    curve: ribbon ? 1.2 : 1,
  }];
  if (definition.tiltRatio < 0.8) {
    widthMappings.push({ source: "tilt-magnitude", from: 1, to: 1.42 });
  }
  return normalizeStudioBrushDynamicsSettings({
    ...base,
    depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
    seed,
    fallbackPressure: 0.5,
    maxSpeed: 2.2,
    tip: {
      shape: "hard",
      // Coverage is already area-integrated. A second softening lattice would blur the pores.
      softness: 0,
      alphaMapSize: STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE,
      // Generated from the checked-in kernels and parity-tested byte for byte. First selection
      // does not compile a field, block pointer-down, perform readback or fetch any image.
      alphaMapBase64: materialAtlas[definition.program],
    },
    // One authoritative material footprint: no formula-derived secondary stamps or ordinal seeds.
    tipLayers: [],
    dualBrush: { enabled: false },
    taper: {
      ...base.taper,
      enabled: ribbon,
      startLength: 0.08,
      endLength: 0.12,
      minSizeRatio: 0.16,
      minOpacityRatio: 0.65,
      curve: 1.1,
    },
    width: { base: definition.width, mappings: widthMappings, jitter: null },
    // The draw element owns toolbar opacity. Do not multiply the catalogue opacity twice.
    opacity: { base: 1, mappings: [{ source: "pressure", from: 0.62, to: 1 }], jitter: null },
    flow: {
      base: definition.flow,
      mappings: [{ source: "pressure", from: dry ? 0.34 : 0.55, to: 1, curve: dry ? 1.25 : 1 }],
      jitter: null,
    },
    spacingRatio: definition.spacing,
    spacing: { mappings: [], jitter: null },
    scatterRatio: definition.scatter,
    scatter: { mappings: [], jitter: null },
    angle: {
      base: ribbon ? 90 : 0,
      mappings: directional ? [{ source: "direction", mode: "add", from: 0, to: 360 }] : [],
      jitter: definition.mode === "scatter" ? { mode: "add", amount: 180 } : null,
    },
    roundness: {
      base: definition.roundness,
      mappings: [{ source: "tilt-magnitude", from: 1, to: definition.tiltRatio }],
      jitter: null,
    },
    grain: {
      space: "canvas-fixed",
      // Dry pigment receives substrate modulation; decorations retain their authored holes.
      amount: dry && !discrete ? 0.18 : 0,
      scale: 3.5,
      contrast: 0.5,
      seed,
    },
    colorDynamics: {
      ...base.colorDynamics,
      foregroundBackgroundMix: 0,
      foregroundBackgroundJitter: 0,
      // Preserve tint-atlas reuse. Geometry/coverage, not per-dab palette churn, owns variety.
      hueJitter: 0,
      saturationJitter: 0,
      valueJitter: 0,
    },
  });
}
