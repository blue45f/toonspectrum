/**
 * CC0 MyPaint preset import v1 — verbatim parameter harvest from mypaint/mypaint-brushes.
 *
 * Upstream: github.com/mypaint/mypaint-brushes (brush data licensed CC0 1.0 Universal — the
 * package COPYING file is the CC0 legal code and the README states "Only public domain (CC0 1.0)
 * is an acceptable license for the official mypaint-brushes package"). The parameter tables below
 * are transcribed verbatim from the named `.myb` v3 JSON files; CC0 permits verbatim reuse, and
 * we keep the exact upstream file path per preset as provenance.
 *
 * What this module is:
 * - a data table (verbatim `.myb` settings for 12 standout texture presets),
 * - a documented mapping of those settings onto the EXISTING stamp-brush walker
 *   (studio-brush-stamp-engine): spacing from dab densities, flow from effective opacity at the
 *   reference pressure, pressure size span from the radius input curve, scatter/radius jitter
 *   from `offset_by_random` / `radius_by_random`,
 * - the libmypaint dab-accumulation linearization helpers (ISC-licensed reference:
 *   libmypaint `mypaint-brush.c`, `prepare_and_draw_dab`, © 2007-2011 Martin Renold; the
 *   formula `alpha_dab = 1 − (1 − opaque)^(1/dabs_per_pixel)` with
 *   `dabs_per_pixel = 1 + opaque_linearize·((DPAR + DPBR)·2 − 1)` is reimplemented here).
 *
 * Determinism/identity contract: this module is pure data + pure math. The stamp engine consumes
 * it only for `mypaint-cc0--*` brush ids; every other brush id resolves to null here, so existing
 * brush output stays byte-identical (mirrors the wetEdgeBloomProgramId / paperProgramId opt-in
 * discipline). Unknown `mypaint-cc0--*` suffixes also resolve to null — the engine then refuses
 * the stamp lane entirely instead of converging to another renderer (fail-closed contract).
 *
 * Known down-scoped inputs (honesty policy — approximations are named, never silent):
 * - `elliptical_dab_ratio/angle`, `smudge*`, `tracking_noise`, `slow_tracking*`, stroke/speed
 *   input envelopes are NOT executed by the stamp walker; the verbatim table still records them
 *   so a future planner can pick them up. Per-preset `mappingNotes` call out what was dropped.
 * - `dabs_per_second` (time-based dabs) has no distance-walker equivalent and is ignored for
 *   spacing (recorded verbatim).
 */

export const STUDIO_CC0_MYPAINT_PRESET_IMPORT_VERSION_V1 = 1 as const;

/** Exact upstream provenance for every value in this module. */
export const STUDIO_CC0_MYPAINT_PRESET_PROVENANCE = Object.freeze({
  repository: "github.com/mypaint/mypaint-brushes",
  license: "CC0-1.0",
  licenseEvidence:
    "mypaint-brushes COPYING = CC0 1.0 Universal legal code; README: \"Only public domain (CC0 1.0) is an acceptable license for the official mypaint-brushes package\"",
  linearizationReference:
    "libmypaint mypaint-brush.c prepare_and_draw_dab (ISC license, © 2007-2011 Martin Renold) — alpha_dab = 1 − (1 − opaque)^(1/dabs_per_pixel)",
} as const);

/** Brush ids of this import pool: `mypaint-cc0--{preset}`. */
export const STUDIO_CC0_MYPAINT_PRESET_BRUSH_ID_PREFIX = "mypaint-cc0--" as const;

/**
 * Stamp kinds this pool maps onto. Subset of the engine's `StudioStampBrushKind` — declared
 * locally so this data module stays a leaf (the engine imports us, never the reverse).
 */
export type StudioCc0MypaintStampKind =
  | "airbrush"
  | "pencil"
  | "ink"
  | "watercolor"
  | "mypaint"
  | "charcoal"
  | "pastel";

/** One verbatim `.myb` setting: base value + optional input curves, exactly as upstream. */
export interface StudioCc0MypaintVerbatimSetting {
  readonly baseValue: number;
  readonly inputs?: Readonly<Record<string, readonly (readonly [number, number])[]>>;
}

export type StudioCc0MypaintVerbatimSettings = Readonly<
  Record<string, StudioCc0MypaintVerbatimSetting>
>;

/**
 * Mapped stamp tuning — the walker-executable projection of the verbatim table.
 * Field derivations (uniform rules, per-preset numbers in the table):
 * - `spacingRatio` = 1 / (2·(dabs_per_actual_radius + dabs_per_basic_radius)), clamped to
 *   [0.03, 4] (sparse splatter presets legitimately exceed one diameter of spacing).
 * - `flow` = clamp01(effective opaque at reference pressure 0.5):
 *   (opaque.base + opaqueCurve(0.5)) · clamp01(opaque_multiply.base + multiplyCurve(0.5)).
 * - `minSizeRatio` = exp(radiusCurve(0) − max(radiusCurve)) — the pressure span of
 *   radius_logarithmic; 1 when the preset has no pressure→radius mapping.
 * - `scatter`/`scatterPressureResponse` = offset_by_random base / its pressure-curve endpoint
 *   delta (units: dab radii, matching libmypaint's base-radius offsets).
 * - `radiusJitter` = radius_by_random base (log-space jitter, symmetric adaptation).
 * - `dabsPerPixel` = max(1, 2·(DPAR + DPBR)) and `opaqueLinearize` = the preset's explicit
 *   opaque_linearize base value (several presets pin it to 0 — linearization stays off there,
 *   mirroring libmypaint's `if (opaque_linearize)` guard).
 */
export interface StudioCc0MypaintStampTuning {
  readonly spacingRatio: number;
  readonly flow: number;
  readonly hardness: number;
  readonly minSizeRatio: number;
  readonly sizeScale: number;
  readonly scatter: number;
  readonly scatterPressureResponse: number;
  readonly radiusJitter: number;
  readonly opaqueLinearize: number;
  readonly dabsPerPixel: number;
}

/** Style-resident dynamics the stamp planner executes for a cc0 preset (absent = legacy path). */
export interface StudioCc0MypaintDabDynamicsStyle {
  /** Deterministic per-dab positional jitter in dab radii (libmypaint offset_by_random). */
  readonly scatter: number;
  /** Pressure endpoint delta added to scatter (scatter_eff = max(0, scatter + response·p)). */
  readonly scatterPressureResponse: number;
  /** Symmetric log-space radius jitter amplitude (libmypaint radius_by_random adaptation). */
  readonly radiusJitter: number;
  /**
   * Pre-linearized per-dab alpha (libmypaint opaque_linearize) — null when the preset pins
   * opaque_linearize to 0, in which case the plain flow value is used unchanged.
   */
  readonly linearizedFlow: number | null;
}

export interface StudioCc0MypaintPresetImport {
  /** Short preset id (brushId = `mypaint-cc0--` + presetId). */
  readonly presetId: string;
  readonly brushId: string;
  readonly nameKo: string;
  /** Exact file inside github.com/mypaint/mypaint-brushes. */
  readonly upstreamFile: string;
  readonly pack: "classic" | "deevad" | "tanda" | "ramon";
  readonly kind: StudioCc0MypaintStampKind;
  readonly verbatim: StudioCc0MypaintVerbatimSettings;
  readonly mapped: StudioCc0MypaintStampTuning;
  /** Honesty notes: which verbatim behaviors the stamp walker does not execute. */
  readonly mappingNotes: string;
}

// ---------------------------------------------------------------------------
// libmypaint dab-accumulation linearization (ISC reference, reimplemented)
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * `dabs_per_pixel` estimate for the walker: raw density `2·(DPAR + DPBR)` floored at 1
 * ("the correction is probably not wanted if the dabs don't overlap"), then interpreted
 * smoothly through the user linearize setting: `1 + opaque_linearize·(dabs_per_pixel − 1)`.
 */
export function studioLibmypaintDabsPerPixel(
  dabsPerActualRadius: number,
  dabsPerBasicRadius: number,
  opaqueLinearize: number,
): number {
  const safeActual = Number.isFinite(dabsPerActualRadius) ? Math.max(0, dabsPerActualRadius) : 0;
  const safeBasic = Number.isFinite(dabsPerBasicRadius) ? Math.max(0, dabsPerBasicRadius) : 0;
  let dabsPerPixel = (safeActual + safeBasic) * 2;
  if (dabsPerPixel < 1) dabsPerPixel = 1;
  const linearize = clamp01(Number.isFinite(opaqueLinearize) ? opaqueLinearize : 0);
  return 1 + linearize * (dabsPerPixel - 1);
}

/**
 * libmypaint opacity linearization: the user's `opaque` is the STROKE-level saturation target;
 * the per-dab alpha is derived so overlapping dabs converge exactly there:
 * `beta = beta_dab^dabs_per_pixel  ⇔  alpha_dab = 1 − (1 − opaque)^(1/dabs_per_pixel)`.
 */
export function studioLibmypaintLinearizedDabAlpha(
  opaque: number,
  dabsPerPixel: number,
): number {
  const target = clamp01(Number.isFinite(opaque) ? opaque : 0);
  if (!Number.isFinite(dabsPerPixel) || dabsPerPixel <= 1) return target;
  return 1 - Math.pow(1 - target, 1 / dabsPerPixel);
}

/** Resolve the style-resident dynamics for a cc0 tuning at the final (post-override) flow. */
export function resolveStudioCc0MypaintDabDynamicsStyle(
  tuning: StudioCc0MypaintStampTuning,
  resolvedFlow: number,
): StudioCc0MypaintDabDynamicsStyle {
  const linearizedFlow = tuning.opaqueLinearize > 0
    ? studioLibmypaintLinearizedDabAlpha(
        resolvedFlow,
        1 + clamp01(tuning.opaqueLinearize) * (Math.max(1, tuning.dabsPerPixel) - 1),
      )
    : null;
  return Object.freeze({
    scatter: tuning.scatter,
    scatterPressureResponse: tuning.scatterPressureResponse,
    radiusJitter: tuning.radiusJitter,
    linearizedFlow,
  });
}

// ---------------------------------------------------------------------------
// Verbatim preset tables (transcribed from the named upstream .myb v3 files)
// ---------------------------------------------------------------------------

function preset(
  presetId: string,
  nameKo: string,
  upstreamFile: string,
  pack: StudioCc0MypaintPresetImport["pack"],
  kind: StudioCc0MypaintStampKind,
  verbatim: StudioCc0MypaintVerbatimSettings,
  mapped: StudioCc0MypaintStampTuning,
  mappingNotes: string,
): StudioCc0MypaintPresetImport {
  return Object.freeze({
    presetId,
    brushId: `${STUDIO_CC0_MYPAINT_PRESET_BRUSH_ID_PREFIX}${presetId}`,
    nameKo,
    upstreamFile,
    pack,
    kind,
    verbatim: Object.freeze(verbatim),
    mapped: Object.freeze(mapped),
    mappingNotes,
  });
}

export const STUDIO_CC0_MYPAINT_PRESET_IMPORTS: readonly StudioCc0MypaintPresetImport[] =
  Object.freeze([
    preset(
      "charcoal",
      "MyPaint CC0 · 목탄",
      "brushes/classic/charcoal.myb",
      "classic",
      "charcoal",
      {
        opaque: { baseValue: 0.4, inputs: { pressure: [[0, 0], [1, 0.4]] } },
        opaque_multiply: { baseValue: 0, inputs: { pressure: [[0, 0], [1, 1]] } },
        opaque_linearize: { baseValue: 0 },
        radius_logarithmic: { baseValue: 0.7 },
        hardness: { baseValue: 0.2 },
        dabs_per_actual_radius: { baseValue: 5 },
        offset_by_random: { baseValue: 1.6, inputs: { pressure: [[0, 0], [1, -1.4]] } },
        smudge_length: { baseValue: 0.5 },
        slow_tracking: { baseValue: 2 },
      },
      {
        // 2·(5+0) = 10 dabs per diameter → spacing 0.1; flow (0.4+0.2)·0.5 = 0.3.
        spacingRatio: 0.1, flow: 0.3, hardness: 0.2, minSizeRatio: 1, sizeScale: 1,
        // Signature charcoal feel: jitter 1.6 radii that SHRINKS as you press (−1.4·p).
        scatter: 1.6, scatterPressureResponse: -1.4, radiusJitter: 0,
        opaqueLinearize: 0, dabsPerPixel: 10,
      },
      "smudge_length / slow_tracking are recorded but not executed by the stamp walker.",
    ),
    preset(
      "charcoal-tanda",
      "MyPaint CC0 · 목탄 슬리버",
      "brushes/tanda/charcoal-01.myb",
      "tanda",
      "charcoal",
      {
        opaque: {
          baseValue: 0.2,
          inputs: { pressure: [[0, 0], [1, 0.5]], random: [[0, -0.6], [1, 0.6]] },
        },
        opaque_multiply: { baseValue: 0, inputs: { pressure: [[0, 0], [0.083333, 1], [1, 1]] } },
        opaque_linearize: { baseValue: 1 },
        radius_logarithmic: { baseValue: -0.4, inputs: { pressure: [[0, 0], [1, 0.6]] } },
        hardness: { baseValue: 0.9 },
        dabs_per_actual_radius: { baseValue: 5 },
        offset_by_random: { baseValue: 1 },
        elliptical_dab_ratio: { baseValue: 3, inputs: { random: [[0, -1], [1, 1]] } },
        elliptical_dab_angle: { baseValue: 0, inputs: { random: [[0, -180], [1, 180]] } },
        smudge: { baseValue: 0, inputs: { speed1: [[0, 0], [4, 0.2]] } },
      },
      {
        // flow (0.2+0.25)·1 = 0.45; radius pressure span exp(0 − 0.6) = 0.5488.
        spacingRatio: 0.1, flow: 0.45, hardness: 0.9, minSizeRatio: 0.5488, sizeScale: 1,
        scatter: 1, scatterPressureResponse: 0, radiusJitter: 0,
        opaqueLinearize: 1, dabsPerPixel: 10,
      },
      "Random-oriented elliptical slivers (ratio 3, angle ±180°) and per-dab opacity flicker (random ±0.6) are recorded, not executed — scatter 1.0 carries the tooth.",
    ),
    preset(
      "2b-pencil",
      "MyPaint CC0 · 2B 연필",
      "brushes/deevad/2B_pencil.myb",
      "deevad",
      "pencil",
      {
        opaque: { baseValue: 0.15000000000027122 },
        opaque_multiply: { baseValue: 0, inputs: { pressure: [[0, 0], [1, 1]] } },
        opaque_linearize: { baseValue: 0 },
        radius_logarithmic: {
          baseValue: 0.75,
          inputs: { pressure: [[0, -0.687917], [0.752976, 0.236471], [1, 0.286632]] },
        },
        hardness: { baseValue: 0.2, inputs: { pressure: [[0, 0], [1, 0.3]] } },
        dabs_per_actual_radius: { baseValue: 4 },
        offset_by_random: { baseValue: 0.5, inputs: { pressure: [[0, 0], [1, -0.3]] } },
        slow_tracking: { baseValue: 1.03 },
        slow_tracking_per_dab: { baseValue: 1.5 },
      },
      {
        // flow 0.15·0.5 = 0.075 — a real 2B is faint at half pressure and builds by hatching.
        // minSizeRatio exp(−0.687917 − 0.286632) = 0.3773.
        spacingRatio: 0.125, flow: 0.075, hardness: 0.2, minSizeRatio: 0.3773, sizeScale: 1,
        scatter: 0.5, scatterPressureResponse: -0.3, radiusJitter: 0,
        opaqueLinearize: 0, dabsPerPixel: 8,
      },
      "Pressure→hardness (+0.3) and slow_tracking smoothing are recorded, not executed.",
    ),
    preset(
      "dry-brush",
      "MyPaint CC0 · 드라이 브러시",
      "brushes/classic/dry_brush.myb",
      "classic",
      "ink",
      {
        opaque: { baseValue: 0.8, inputs: { pressure: [[0, 0], [1, 0.2]] } },
        opaque_multiply: { baseValue: 0, inputs: { pressure: [[0, 0], [1, 1]] } },
        opaque_linearize: { baseValue: 0 },
        radius_logarithmic: { baseValue: 0.6, inputs: { speed2: [[0, 0.042857], [4, -0.3]] } },
        hardness: { baseValue: 0.2 },
        dabs_per_basic_radius: { baseValue: 6 },
        dabs_per_actual_radius: { baseValue: 6 },
        offset_by_random: { baseValue: 0, inputs: { pressure: [[0, 0], [1, 1.4]] } },
        radius_by_random: { baseValue: 0.1 },
      },
      {
        // 2·(6+6) = 24 → spacing 1/24; flow (0.8+0.1)·0.5 = 0.45. The "ink" stamp kind supplies
        // the preset's fast=thin response (radius ← speed2 −0.3) via its velocity factor.
        spacingRatio: 0.0417, flow: 0.45, hardness: 0.2, minSizeRatio: 1, sizeScale: 1,
        // Inverse of charcoal: pressing harder splays the dry bristles (+1.4·p radii).
        scatter: 0, scatterPressureResponse: 1.4, radiusJitter: 0.1,
        opaqueLinearize: 0, dabsPerPixel: 24,
      },
      "speed2→radius thinning approximated by the ink kind's velocity factor (different curve, same fast=thin direction).",
    ),
    preset(
      "splatter",
      "MyPaint CC0 · 스플래터",
      "brushes/tanda/splatter-02.myb",
      "tanda",
      "airbrush",
      {
        opaque: { baseValue: 0.5, inputs: { pressure: [[0, -0.3], [1, 0.45]] } },
        opaque_multiply: { baseValue: 1 },
        opaque_linearize: { baseValue: 0.9 },
        radius_logarithmic: { baseValue: 1.3 },
        hardness: { baseValue: 0.88, inputs: { pressure: [[0, 0], [1, 0.3]] } },
        dabs_per_basic_radius: { baseValue: 0.05 },
        offset_by_random: { baseValue: 2 },
        radius_by_random: { baseValue: 1.5 },
        tracking_noise: { baseValue: 12 },
        slow_tracking: { baseValue: 1 },
      },
      {
        // 2·(0+0.05) = 0.1 dabs per diameter → spacing 10, clamped to the sparse cap 4.
        // dabsPerPixel floors at 1 (libmypaint: no correction when dabs don't overlap).
        spacingRatio: 4, flow: 0.575, hardness: 0.88, minSizeRatio: 1, sizeScale: 1,
        scatter: 2, scatterPressureResponse: 0, radiusJitter: 1.5,
        opaqueLinearize: 0.9, dabsPerPixel: 1,
      },
      "tracking_noise 12 (input-path wobble) is recorded, not executed — scatter 2 + radius jitter 1.5 carry the burst.",
    ),
    preset(
      "ink-blot",
      "MyPaint CC0 · 잉크 블롯",
      "brushes/classic/ink_blot.myb",
      "classic",
      "mypaint",
      {
        opaque: { baseValue: 1 },
        opaque_multiply: { baseValue: 0, inputs: { pressure: [[0, 0], [1, 1]] } },
        opaque_linearize: { baseValue: 0.9 },
        radius_logarithmic: { baseValue: 2.5 },
        hardness: { baseValue: 0.28 },
        dabs_per_actual_radius: { baseValue: 3.32 },
        dabs_per_second: { baseValue: 15 },
        offset_by_random: { baseValue: 0.17 },
        radius_by_random: { baseValue: 0.63 },
      },
      {
        // 2·3.32 = 6.64 → spacing 0.1506; flow 1·0.5 = 0.5, linearized over dpp 6.076.
        spacingRatio: 0.1506, flow: 0.5, hardness: 0.28, minSizeRatio: 1, sizeScale: 1,
        scatter: 0.17, scatterPressureResponse: 0, radiusJitter: 0.63,
        opaqueLinearize: 0.9, dabsPerPixel: 6.64,
      },
      "dabs_per_second 15 (time dabs while hovering) has no distance-walker equivalent; recorded only.",
    ),
    preset(
      "kabura",
      "MyPaint CC0 · 카부라 펜",
      "brushes/classic/kabura.myb",
      "classic",
      "ink",
      {
        opaque: {
          baseValue: 1.29,
          inputs: {
            pressure: [[0, -0.989583], [0.38253, -0.59375], [0.656627, 0.041667], [1, 1]],
          },
        },
        opaque_multiply: {
          baseValue: 0,
          inputs: { pressure: [[0, 0], [0.015, 0], [0.069277, 0.9375], [0.25, 1], [1, 1]] },
        },
        opaque_linearize: { baseValue: 0.29 },
        radius_logarithmic: {
          baseValue: 0.92,
          inputs: {
            pressure: [[0, -0.7875], [0.237952, -0.6], [0.5, -0.15], [0.76506, 0.6], [1, 0.9]],
          },
        },
        hardness: { baseValue: 0.43 },
        dabs_per_basic_radius: { baseValue: 3.24 },
        dabs_per_actual_radius: { baseValue: 2 },
        dabs_per_second: { baseValue: 48.87 },
        slow_tracking_per_dab: {
          baseValue: 10,
          inputs: { speed1: [[0, -1.428571], [4, 10]], speed2: [[0, -1.428571], [4, 10]] },
        },
      },
      {
        // 2·(2+3.24) = 10.48 → spacing 0.0954; flow at ref 0.5 = (1.29 − 0.3214)·1 = 0.9686;
        // radius S-curve span exp(−0.7875 − 0.9) = 0.185 — the kabura pressure taper.
        spacingRatio: 0.0954, flow: 0.9686, hardness: 0.43, minSizeRatio: 0.185, sizeScale: 1,
        scatter: 0, scatterPressureResponse: 0, radiusJitter: 0,
        opaqueLinearize: 0.29, dabsPerPixel: 10.48,
      },
      "Speed-adaptive smoothing (slow_tracking_per_dab ← speed) is recorded, not executed; the ink kind's velocity thinning stands in for the pen's speed response.",
    ),
    preset(
      "watercolor-fringe",
      "MyPaint CC0 · 수채 프린지",
      "brushes/deevad/large_watercolor_fringe.myb",
      "deevad",
      "watercolor",
      {
        opaque: { baseValue: 0.17146776406, inputs: { pressure: [[0, 0.81], [1, 0.81]] } },
        opaque_multiply: {
          baseValue: 0,
          inputs: { pressure: [[0, 0], [0.058642, 0.604167], [1, 1]] },
        },
        opaque_linearize: { baseValue: 0.9 },
        radius_logarithmic: { baseValue: 3.8000000000000007 },
        hardness: { baseValue: 0.9 },
        dabs_per_basic_radius: { baseValue: 4.39 },
        dabs_per_actual_radius: { baseValue: 6 },
        dabs_per_second: { baseValue: 6.99 },
        elliptical_dab_ratio: { baseValue: 10, inputs: { random: [[0, -1.9], [1, 1.9]] } },
        elliptical_dab_angle: { baseValue: 90, inputs: { random: [[0, -180], [1, 180]] } },
        smudge: { baseValue: 0.75 },
        smudge_length: { baseValue: 0.7 },
        smudge_radius_log: { baseValue: -0.8 },
        direction_filter: { baseValue: 1.68 },
      },
      {
        // 2·(6+4.39) = 20.78 → spacing 0.0481; flow (0.17146776406+0.81)·0.7898 = 0.7752,
        // linearized over dpp 18.8 → ≈0.076 per dab: the fringe wash saturation behavior.
        spacingRatio: 0.0481, flow: 0.7752, hardness: 0.9, minSizeRatio: 1, sizeScale: 1,
        scatter: 0.35, scatterPressureResponse: 0, radiusJitter: 0.5,
        opaqueLinearize: 0.9, dabsPerPixel: 20.78,
      },
      "The elliptical sliver fringe (ratio 10, random angle) and small-radius smudge are approximated by scatter 0.35 + radius jitter 0.5 on the watercolor wet-edge tip; verbatim values retained for a future elliptical-dab planner.",
    ),
    preset(
      "watercolor-expressive",
      "MyPaint CC0 · 수채 익스프레시브",
      "brushes/deevad/watercolor_expressive.myb",
      "deevad",
      "watercolor",
      {
        opaque: { baseValue: 2, inputs: { random: [[0, 1], [1, 1]] } },
        opaque_multiply: {
          baseValue: 0,
          inputs: { pressure: [[0, 0], [0.040123, 0.885417], [0.138889, 1], [1, 1]] },
        },
        opaque_linearize: { baseValue: 0.9 },
        radius_logarithmic: {
          baseValue: 3.5,
          inputs: { pressure: [[0, -2.9], [1, 0.845833]] },
        },
        hardness: {
          baseValue: 0.23,
          inputs: { pressure: [[0, 0], [0.746914, 0], [0.884375, 0], [1, -0.032083]] },
        },
        dabs_per_basic_radius: { baseValue: 6 },
        dabs_per_actual_radius: { baseValue: 2 },
        offset_by_random: { baseValue: 0, inputs: { pressure: [[0, 0], [0.75, 0], [1, 0.8]] } },
        elliptical_dab_ratio: {
          baseValue: 4,
          inputs: { pressure: [[0, 0], [0.75, 0], [1, -2.7]], speed1: [[0, -0.37], [4, 0.37]] },
        },
        elliptical_dab_angle: { baseValue: 90, inputs: { random: [[0, -180], [1, 180]] } },
        smudge: {
          baseValue: 0.71,
          inputs: {
            pressure: [[0, -0.65], [0.5, -0.358854], [0.796875, -0.094792], [1, 0.24375]],
            speed1: [[0, -0.01], [4, 0.01]],
          },
        },
        smudge_length: { baseValue: 0.1 },
      },
      {
        // Signature: radius pressure span exp(−2.9 − 0.845833) = 0.0236 — hairline drips to fat
        // washes in one stroke. flow saturates at 1 (opaque 2 + constant random +1, clamped).
        spacingRatio: 0.0625, flow: 1, hardness: 0.23, minSizeRatio: 0.0236, sizeScale: 1,
        scatter: 0, scatterPressureResponse: 0.8, radiusJitter: 0,
        opaqueLinearize: 0.9, dabsPerPixel: 16,
      },
      "Canvas-color smudge 0.71 (the MyPaint wash pull) is not executed — translucency comes from the default lane opacity; offset curve gates at p>0.75 upstream, linear ramp here (approximation).",
    ),
    preset(
      "oil-paint",
      "MyPaint CC0 · 오일 페인트",
      "brushes/tanda/oil-01-paint.myb",
      "tanda",
      "mypaint",
      {
        opaque: { baseValue: 1, inputs: { pressure: [[0, 0], [0.166667, 0.75], [1, 1]] } },
        opaque_multiply: {
          baseValue: 0,
          inputs: { pressure: [[0, 0], [0.067901, 0.78125], [0.185185, 1], [1, 1]] },
        },
        opaque_linearize: { baseValue: 0.9 },
        radius_logarithmic: {
          baseValue: 2,
          inputs: { pressure: [[0, -2.3], [0.398148, 0], [1, 0]] },
        },
        hardness: { baseValue: 0.8 },
        dabs_per_basic_radius: { baseValue: 6 },
        dabs_per_actual_radius: { baseValue: 6 },
        dabs_per_second: { baseValue: 80 },
        offset_by_random: { baseValue: 0.6 },
        elliptical_dab_ratio: { baseValue: 7.1, inputs: { stroke: [[0, -0.4], [1, 0.4]] } },
        elliptical_dab_angle: { baseValue: 0, inputs: { direction: [[0, 0], [180, 180]] } },
        smudge: {
          baseValue: 0.4,
          inputs: { pressure: [[0, 0], [1, -0.6]], stroke: [[0, 0], [0.5, 0], [1, 1]] },
        },
        smudge_length: { baseValue: 0, inputs: { stroke: [[0, 1], [1, -1]] } },
        tracking_noise: { baseValue: 0.2 },
      },
      {
        // 2·(6+6) = 24 → spacing 0.0417; radius span exp(−2.3) = 0.1003 (light graze = thin).
        spacingRatio: 0.0417, flow: 1, hardness: 0.8, minSizeRatio: 0.1003, sizeScale: 1,
        scatter: 0.6, scatterPressureResponse: 0, radiusJitter: 0,
        opaqueLinearize: 0.9, dabsPerPixel: 24,
      },
      "Direction-following elliptical bristle (angle ← stroke direction) and stroke-length smudge envelope are recorded, not executed.",
    ),
    preset(
      "pastel",
      "MyPaint CC0 · 파스텔",
      "brushes/ramon/Pastel_1.myb",
      "ramon",
      "pastel",
      {
        opaque: { baseValue: 1 },
        opaque_multiply: {
          baseValue: 0.48,
          inputs: {
            pressure: [
              [0, -0.3125],
              [0.0701219512195122, -0.10416666666666674],
              [1, 1],
            ],
          },
        },
        opaque_linearize: { baseValue: 0.45 },
        radius_logarithmic: { baseValue: 0.71 },
        hardness: {
          baseValue: 0.8,
          inputs: {
            pressure: [
              [0, -0.666667],
              [0.426471, 0.052083],
              [0.755882, 0.072917],
              [0.844118, 0.947917],
              [1, 1],
            ],
          },
        },
        dabs_per_basic_radius: { baseValue: 3.54 },
        dabs_per_actual_radius: { baseValue: 3.57 },
        offset_by_random: {
          baseValue: 0,
          inputs: {
            pressure: [[0, 0], [0.435294, -0.041667], [0.753425, -0.6875], [1, 0]],
            speed1: [[0, -0.24285690000000001], [4, 1.7]],
            speed2: [[0, -0.24285690000000001], [4, 1.7]],
          },
        },
        radius_by_random: { baseValue: 1.08 },
        elliptical_dab_ratio: { baseValue: 1.48 },
        smudge: { baseValue: 0.1 },
      },
      {
        // 2·(3.57+3.54) = 14.22 → spacing 0.0703; flow 1·(0.48+0.407) = 0.887 at ref pressure.
        spacingRatio: 0.0703, flow: 0.887, hardness: 0.8, minSizeRatio: 1, sizeScale: 1,
        // offset_by_random is speed-driven upstream (up to 1.7 radii at high speed); the walker
        // has no speed state for scatter, so a mid-speed constant 0.35 stands in (approximation).
        scatter: 0.35, scatterPressureResponse: 0, radiusJitter: 1.08,
        opaqueLinearize: 0.45, dabsPerPixel: 14.22,
      },
      "Speed-driven scatter approximated by a mid-speed constant; hardness←pressure S-curve (soft graze → hard press) recorded, not executed.",
    ),
    preset(
      "spray",
      "MyPaint CC0 · 스프레이",
      "brushes/deevad/spray.myb",
      "deevad",
      "airbrush",
      {
        opaque: { baseValue: 1, inputs: { stroke: [[0, 0], [0.62963, 0], [1, -1]] } },
        opaque_multiply: { baseValue: 0, inputs: { pressure: [[0, 0], [1, 1]] } },
        opaque_linearize: { baseValue: 0 },
        radius_logarithmic: {
          baseValue: 2.19,
          inputs: { stroke: [[0, 0], [0.54321, -1.82], [1, 0]] },
        },
        hardness: { baseValue: 0.43 },
        dabs_per_basic_radius: { baseValue: 3.92 },
        dabs_per_actual_radius: { baseValue: 0.95 },
        dabs_per_second: { baseValue: 74.55 },
        offset_by_random: { baseValue: 2 },
        radius_by_random: { baseValue: 0.28 },
        tracking_noise: { baseValue: 1.36 },
        slow_tracking: { baseValue: 0.83 },
      },
      {
        // 2·(0.95+3.92) = 9.74 → spacing 0.1027; flow 1·0.5 = 0.5.
        spacingRatio: 0.1027, flow: 0.5, hardness: 0.43, minSizeRatio: 1, sizeScale: 1,
        scatter: 2, scatterPressureResponse: 0, radiusJitter: 0.28,
        opaqueLinearize: 0, dabsPerPixel: 9.74,
      },
      "Stroke-length fade-out envelope (opaque/radius ← stroke) is recorded, not executed.",
    ),
  ]);

const PRESET_BY_BRUSH_ID: ReadonlyMap<string, StudioCc0MypaintPresetImport> = new Map(
  STUDIO_CC0_MYPAINT_PRESET_IMPORTS.map((entry) => [entry.brushId, entry]),
);

export function listStudioCc0MypaintPresetImports(): readonly StudioCc0MypaintPresetImport[] {
  return STUDIO_CC0_MYPAINT_PRESET_IMPORTS;
}

/**
 * True only for brush ids of REGISTERED cc0 presets. An unknown `mypaint-cc0--*` suffix returns
 * false, so the stamp engine refuses the lane instead of guessing a renderer (fail-closed).
 */
export function isStudioCc0MypaintPresetBrushId(brushId: string | null | undefined): boolean {
  return typeof brushId === "string" && PRESET_BY_BRUSH_ID.has(brushId);
}

export function resolveStudioCc0MypaintPresetImport(
  brushId: string | null | undefined,
): StudioCc0MypaintPresetImport | null {
  if (!brushId) return null;
  return PRESET_BY_BRUSH_ID.get(brushId) ?? null;
}

/** Stamp kind for a registered cc0 preset id; null for everything else (incl. unknown suffixes). */
export function resolveStudioCc0MypaintStampBrushKind(
  brushId: string | null | undefined,
): StudioCc0MypaintStampKind | null {
  return resolveStudioCc0MypaintPresetImport(brushId)?.kind ?? null;
}

export function resolveStudioCc0MypaintStampTuning(
  brushId: string | null | undefined,
): StudioCc0MypaintStampTuning | null {
  return resolveStudioCc0MypaintPresetImport(brushId)?.mapped ?? null;
}
