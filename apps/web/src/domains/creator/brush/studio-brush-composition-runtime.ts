/**
 * Product-runtime authority for Brush Studio composition choices.
 *
 * The catalogue intentionally contains research and adapter-ready nodes. This module is the much
 * smaller allow-list of choices that the current live, settled and export renderers actually
 * consume. Unsupported selections remain round-trippable metadata, but they never impersonate a
 * connected pixel backend or collapse into an unrelated legacy effect.
 */

import { resolveStudioBrushRenderFamily } from "../studio-brush";
import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  STUDIO_BRUSH_OIL_PROGRAM_KEYS,
  studioBrushEngineProgramSetWithComposition,
  studioBrushEngineProgramSetWithOil,
  studioBrushEngineProgramSetWithWatercolor,
  studioBrushEngineProgramSetWithoutOil,
  studioBrushEngineProgramSetWithoutWatercolor,
  studioOilProgramSetForBrush,
  type StudioBrushCompositionProgramSet,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
  type StudioBrushOilProgramSet,
} from "./studio-brush-engine-program-set";

interface StudioBrushRuntimeSlotMap {
  readonly [slot: string]: readonly string[] | undefined;
}

const OIL_RUNTIME_NODES: StudioBrushRuntimeSlotMap = Object.freeze({
  deposition: Object.freeze(["loaded-paint", "height-paint"]),
  pickup: Object.freeze(["no-pickup", "simple-reservoir"]),
  physics: Object.freeze(["no-physics", "bristle-webgpu"]),
});

const WATERCOLOR_RUNTIME_NODES: StudioBrushRuntimeSlotMap = Object.freeze({
  surface: Object.freeze(["smooth-paper", "watercolor-paper", "paper-fiber-field"]),
  physics: Object.freeze(["no-physics", "wet-diffusion-webgpu", "inkwash-fluid"]),
});

function runtimeNodesForFamily(family: string): StudioBrushRuntimeSlotMap {
  if (family === "oil" || family === "brush") return OIL_RUNTIME_NODES;
  if (family === "watercolor") return WATERCOLOR_RUNTIME_NODES;
  return Object.freeze({});
}

export function isStudioBrushCompositionRuntimeSelectable(
  family: string,
  slot: StudioBrushCompositionSlotId,
  nodeId: string,
): boolean {
  return runtimeNodesForFamily(family)[slot]?.includes(nodeId) === true;
}

export interface StudioBrushCompositionRuntimeSelection {
  readonly slot: StudioBrushCompositionSlotId;
  readonly nodeId: string;
}

export interface StudioBrushCompositionRuntimePlan {
  readonly connectedSelections: readonly StudioBrushCompositionRuntimeSelection[];
  readonly unavailableSelections: readonly StudioBrushCompositionRuntimeSelection[];
}

export function planStudioBrushCompositionRuntime(
  family: string,
  composition: StudioBrushCompositionProgramSet,
): StudioBrushCompositionRuntimePlan {
  const connectedSelections: StudioBrushCompositionRuntimeSelection[] = [];
  const unavailableSelections: StudioBrushCompositionRuntimeSelection[] = [];
  for (const slot of STUDIO_BRUSH_COMPOSITION_SLOT_IDS) {
    const nodeId = composition[slot];
    if (!nodeId) continue;
    const selection = Object.freeze({ slot, nodeId });
    if (isStudioBrushCompositionRuntimeSelectable(family, slot, nodeId)) {
      connectedSelections.push(selection);
    } else {
      unavailableSelections.push(selection);
    }
  }
  return Object.freeze({
    connectedSelections: Object.freeze(connectedSelections),
    unavailableSelections: Object.freeze(unavailableSelections),
  });
}

export function constrainStudioBrushCompositionToRuntime(input: {
  readonly family: string;
  readonly current: StudioBrushCompositionProgramSet;
  readonly requested: StudioBrushCompositionProgramSet;
}): StudioBrushCompositionProgramSet {
  const next: Partial<Record<StudioBrushCompositionSlotId, string>> = {
    ...input.current,
  };
  for (const slot of STUDIO_BRUSH_COMPOSITION_SLOT_IDS) {
    const nodeId = input.requested[slot];
    if (nodeId && isStudioBrushCompositionRuntimeSelectable(input.family, slot, nodeId)) {
      next[slot] = nodeId;
    }
  }
  return Object.freeze(next);
}

function oilProgramsEqual(
  left: StudioBrushOilProgramSet,
  right: StudioBrushOilProgramSet,
): boolean {
  return STUDIO_BRUSH_OIL_PROGRAM_KEYS.every((key) => left[key] === right[key]);
}

export function compileStudioBrushCompositionRuntimeProgramSet(input: {
  readonly brushId: string;
  readonly family: string;
  readonly current?: StudioBrushEngineProgramSet | null;
  readonly composition: StudioBrushCompositionProgramSet;
}): StudioBrushEngineProgramSet {
  let next = studioBrushEngineProgramSetWithComposition(input.current, input.composition);

  if (input.family === "oil" || input.family === "brush") {
    const baseline = studioOilProgramSetForBrush(input.brushId);
    const derived: StudioBrushOilProgramSet = {
      bristlePhysics: input.composition.physics === "bristle-webgpu"
        ? true
        : input.composition.physics === "no-physics"
          ? false
          : baseline.bristlePhysics,
      bristleLoadDynamics: input.composition.pickup === "simple-reservoir"
        ? true
        : input.composition.pickup === "no-pickup"
          ? false
          : baseline.bristleLoadDynamics,
      impastoRelief: input.composition.deposition === "height-paint"
        ? true
        : input.composition.deposition === "loaded-paint"
          ? false
          : baseline.impastoRelief,
    };
    next = oilProgramsEqual(derived, baseline)
      ? studioBrushEngineProgramSetWithoutOil(next)
        ?? studioBrushEngineProgramSetWithComposition(null, input.composition)
      : studioBrushEngineProgramSetWithOil(next, derived);
  }

  if (input.family === "watercolor") {
    if (input.composition.physics === "inkwash-fluid") {
      next = studioBrushEngineProgramSetWithWatercolor(next, {
        livingInkBakeProgramId: "sumi-flow-bake",
      });
    } else if (input.composition.surface === "paper-fiber-field") {
      next = studioBrushEngineProgramSetWithWatercolor(next, {
        wetEdgeBloomProgramId: "fiber-feather",
      });
    } else {
      next = studioBrushEngineProgramSetWithoutWatercolor(next)
        ?? studioBrushEngineProgramSetWithComposition(null, input.composition);
    }
  }

  return next;
}

export function resolveStudioBrushRuntimeProgramSet(
  brushId: string | null | undefined,
  current: StudioBrushEngineProgramSet | null | undefined,
): StudioBrushEngineProgramSet | null {
  if (!current?.composition) return current ?? null;
  const resolvedBrushId = brushId?.trim() || "pen";
  return compileStudioBrushCompositionRuntimeProgramSet({
    brushId: resolvedBrushId,
    family: resolveStudioBrushRenderFamily(resolvedBrushId),
    current,
    composition: current.composition,
  });
}
