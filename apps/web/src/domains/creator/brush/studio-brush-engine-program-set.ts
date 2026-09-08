/**
 * Versioned engine-program overrides that travel with a saved brush or stroke.
 *
 * Omitted keys always mean "use the id-derived baseline". This preserves every legacy preset while
 * allowing the Brush Studio composer to persist a renderer-neutral graph selection beside the
 * already connected oil and watercolor program switches.
 */

import type { StudioOilRibbonCarrierOptions } from "./studio-oil-ribbon-carrier";

export const STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION = 1 as const;

export interface StudioBrushOilProgramSet {
  readonly bristlePhysics: boolean;
  readonly bristleLoadDynamics: boolean;
  readonly impastoRelief: boolean;
}

export interface StudioBrushWatercolorProgramSet {
  readonly wetEdgeBloomProgramId?: string;
  readonly livingInkBakeProgramId?: string;
}

export const STUDIO_BRUSH_COMPOSITION_SLOT_IDS = Object.freeze([
  "motion",
  "carrier",
  "tip",
  "surface",
  "deposition",
  "pigment",
  "pickup",
  "physics",
  "pattern",
  "feedback",
  "output",
] as const);

export type StudioBrushCompositionSlotId =
  (typeof STUDIO_BRUSH_COMPOSITION_SLOT_IDS)[number];

/**
 * One selected node per authority slot. IDs are intentionally provider-neutral strings. Unknown
 * but well-formed IDs survive import so a newer provider payload is not silently rewritten by an
 * older client; the composition catalog is the consumer-side authority that reports availability.
 */
export type StudioBrushCompositionProgramSet = Readonly<
  Partial<Record<StudioBrushCompositionSlotId, string>>
>;

export interface StudioBrushEngineProgramSet {
  readonly version: typeof STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION;
  readonly oil?: StudioBrushOilProgramSet;
  readonly watercolor?: StudioBrushWatercolorProgramSet;
  readonly composition?: StudioBrushCompositionProgramSet;
}

export const STUDIO_BRUSH_OIL_PROGRAM_KEYS = Object.freeze([
  "bristlePhysics",
  "bristleLoadDynamics",
  "impastoRelief",
] as const);

export type StudioBrushOilProgramKey =
  (typeof STUDIO_BRUSH_OIL_PROGRAM_KEYS)[number];

export const STUDIO_OIL_PROGRAM_MATRIX_BRUSH_IDS = Object.freeze([
  "brush--bristle-physics",
  "brush--bristle-depletion",
  "brush--impasto-relief",
  "oil--filbert-ribbon",
  "oil--impasto-ribbon",
  "oil",
  "acrylic",
] as const);

const EMPTY_OIL_PROGRAMS: StudioBrushOilProgramSet = Object.freeze({
  bristlePhysics: false,
  bristleLoadDynamics: false,
  impastoRelief: false,
});

export function studioOilProgramSetForBrush(brush: string): StudioBrushOilProgramSet {
  switch (brush) {
    case "brush--bristle-physics":
      return Object.freeze({
        bristlePhysics: true,
        bristleLoadDynamics: true,
        impastoRelief: false,
      });
    case "brush--bristle-depletion":
      return Object.freeze({
        bristlePhysics: false,
        bristleLoadDynamics: true,
        impastoRelief: false,
      });
    case "brush--impasto-relief":
      return Object.freeze({
        bristlePhysics: false,
        bristleLoadDynamics: false,
        impastoRelief: true,
      });
    case "oil--filbert-ribbon":
      return Object.freeze({
        bristlePhysics: true,
        bristleLoadDynamics: false,
        impastoRelief: false,
      });
    case "oil--impasto-ribbon":
      return Object.freeze({
        bristlePhysics: true,
        bristleLoadDynamics: false,
        impastoRelief: true,
      });
    case "oil":
    case "acrylic":
      return Object.freeze({
        bristlePhysics: true,
        bristleLoadDynamics: true,
        impastoRelief: true,
      });
    default:
      return EMPTY_OIL_PROGRAMS;
  }
}

export function studioOilRibbonProgramsFromSet(
  programs: StudioBrushOilProgramSet,
  seed: number,
): StudioOilRibbonCarrierOptions | undefined {
  const options: {
    bristlePhysics?: { enabled: true; seed: number };
    bristleLoadDynamics?: { enabled: true; seed: number };
    impastoRelief?: { enabled: true };
  } = {};
  if (programs.bristlePhysics) options.bristlePhysics = { enabled: true, seed };
  if (programs.bristleLoadDynamics) options.bristleLoadDynamics = { enabled: true, seed };
  if (programs.impastoRelief) options.impastoRelief = { enabled: true };
  return Object.keys(options).length === 0 ? undefined : options;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

/** Program IDs are bounded lowercase kebab-case registry keys. */
function readProgramId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(trimmed) ? trimmed : undefined;
}

function frozenComposition(
  source: StudioBrushCompositionProgramSet,
): StudioBrushCompositionProgramSet | undefined {
  const normalized: Partial<Record<StudioBrushCompositionSlotId, string>> = {};
  for (const slot of STUDIO_BRUSH_COMPOSITION_SLOT_IDS) {
    const id = readProgramId(source[slot]);
    if (id) normalized[slot] = id;
  }
  return Object.keys(normalized).length > 0
    ? Object.freeze(normalized)
    : undefined;
}

function frozenWatercolor(
  source: StudioBrushWatercolorProgramSet,
): StudioBrushWatercolorProgramSet | undefined {
  const wetEdgeBloomProgramId = readProgramId(source.wetEdgeBloomProgramId);
  const livingInkBakeProgramId = readProgramId(source.livingInkBakeProgramId);
  if (!wetEdgeBloomProgramId && !livingInkBakeProgramId) return undefined;
  return Object.freeze({
    ...(wetEdgeBloomProgramId ? { wetEdgeBloomProgramId } : {}),
    ...(livingInkBakeProgramId ? { livingInkBakeProgramId } : {}),
  });
}

/** Validate persisted, imported or collaborative engine-program data without enabling unknown work. */
export function normalizeStudioBrushEngineProgramSet(
  raw: unknown,
): StudioBrushEngineProgramSet | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  if (source.version !== STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION) return null;

  let oil: StudioBrushOilProgramSet | undefined;
  if (typeof source.oil === "object" && source.oil !== null && !Array.isArray(source.oil)) {
    const record = source.oil as Record<string, unknown>;
    oil = Object.freeze({
      bristlePhysics: readBoolean(record, "bristlePhysics"),
      bristleLoadDynamics: readBoolean(record, "bristleLoadDynamics"),
      impastoRelief: readBoolean(record, "impastoRelief"),
    });
  }

  const watercolor = (
    typeof source.watercolor === "object"
    && source.watercolor !== null
    && !Array.isArray(source.watercolor)
  )
    ? frozenWatercolor(source.watercolor as StudioBrushWatercolorProgramSet)
    : undefined;

  const composition = (
    typeof source.composition === "object"
    && source.composition !== null
    && !Array.isArray(source.composition)
  )
    ? frozenComposition(source.composition as StudioBrushCompositionProgramSet)
    : undefined;

  return Object.freeze({
    version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION,
    ...(oil ? { oil } : {}),
    ...(watercolor ? { watercolor } : {}),
    ...(composition ? { composition } : {}),
  });
}

export function studioBrushEngineProgramSetMatchesBrush(
  brush: string,
  set: StudioBrushEngineProgramSet | null | undefined,
): boolean {
  if (set?.watercolor || set?.composition) return false;
  if (!set?.oil) return true;
  const baseline = studioOilProgramSetForBrush(brush);
  return STUDIO_BRUSH_OIL_PROGRAM_KEYS.every((key) => set.oil![key] === baseline[key]);
}

function buildStudioBrushEngineProgramSet(input: {
  readonly oil?: StudioBrushOilProgramSet;
  readonly watercolor?: StudioBrushWatercolorProgramSet;
  readonly composition?: StudioBrushCompositionProgramSet;
}): StudioBrushEngineProgramSet | null {
  const watercolor = input.watercolor ? frozenWatercolor(input.watercolor) : undefined;
  const composition = input.composition ? frozenComposition(input.composition) : undefined;
  const oil = input.oil ? Object.freeze({ ...input.oil }) : undefined;
  if (!oil && !watercolor && !composition) return null;
  return Object.freeze({
    version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION,
    ...(oil ? { oil } : {}),
    ...(watercolor ? { watercolor } : {}),
    ...(composition ? { composition } : {}),
  });
}

export function studioBrushEngineProgramSetFromOil(
  oil: StudioBrushOilProgramSet,
): StudioBrushEngineProgramSet {
  return buildStudioBrushEngineProgramSet({ oil })!;
}

export function studioBrushWatercolorProgramSetFrom(
  watercolor: StudioBrushWatercolorProgramSet,
): StudioBrushEngineProgramSet {
  return buildStudioBrushEngineProgramSet({ watercolor })!;
}

export function studioBrushEngineProgramSetFromComposition(
  composition: StudioBrushCompositionProgramSet,
): StudioBrushEngineProgramSet {
  return buildStudioBrushEngineProgramSet({ composition })!;
}

export function studioBrushEngineProgramSetWithOil(
  current: StudioBrushEngineProgramSet | null | undefined,
  oil: StudioBrushOilProgramSet,
): StudioBrushEngineProgramSet {
  return buildStudioBrushEngineProgramSet({
    oil,
    watercolor: current?.watercolor,
    composition: current?.composition,
  })!;
}

export function studioBrushEngineProgramSetWithoutOil(
  current: StudioBrushEngineProgramSet | null | undefined,
): StudioBrushEngineProgramSet | null {
  return buildStudioBrushEngineProgramSet({
    watercolor: current?.watercolor,
    composition: current?.composition,
  });
}

export function studioBrushEngineProgramSetWithWatercolor(
  current: StudioBrushEngineProgramSet | null | undefined,
  watercolor: StudioBrushWatercolorProgramSet,
): StudioBrushEngineProgramSet {
  return buildStudioBrushEngineProgramSet({
    oil: current?.oil,
    watercolor,
    composition: current?.composition,
  })!;
}

export function studioBrushEngineProgramSetWithoutWatercolor(
  current: StudioBrushEngineProgramSet | null | undefined,
): StudioBrushEngineProgramSet | null {
  return buildStudioBrushEngineProgramSet({
    oil: current?.oil,
    composition: current?.composition,
  });
}

export function studioBrushEngineProgramSetWithComposition(
  current: StudioBrushEngineProgramSet | null | undefined,
  composition: StudioBrushCompositionProgramSet,
): StudioBrushEngineProgramSet {
  return buildStudioBrushEngineProgramSet({
    oil: current?.oil,
    watercolor: current?.watercolor,
    composition,
  })!;
}

export function studioBrushEngineProgramSetWithoutComposition(
  current: StudioBrushEngineProgramSet | null | undefined,
): StudioBrushEngineProgramSet | null {
  return buildStudioBrushEngineProgramSet({
    oil: current?.oil,
    watercolor: current?.watercolor,
  });
}
