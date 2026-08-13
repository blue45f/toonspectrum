/**
 * Verified-kernel dab tips for the five core dry-media brushes (T1 de-polygon path).
 *
 * New crayon/chalk/charcoal/pastel/oil-pastel strokes no longer flow through the self-made
 * polygon-union carrier. They stay on the shared dynamic-dabs coverage planner (ellipse/alpha-map
 * primitives, Canvas and SVG consume the same marks) and receive their material texture from the
 * verified OSS tip kernels instead:
 * - crayon  → Klecks directional wax scrape (MIT DNA, `studioStampOssTipCoverage("crayon")`)
 * - chalk   → Klecks genBrushAlpha01 multi-octave powder (MIT)
 * - charcoal→ libmypaint charcoal.myb grit × Klecks powder (ISC/MIT)
 * - pastel  → soft velvet shoulder × Klecks powder (MIT)
 * - oil-pastel → occlusive wax film composed from the same verified wax kernel primitives
 *   (wider pressed plateau, weaker scrape reveal than crayon — mirrors the smoother union-era
 *   oil-pastel grain policy without any polygon transport).
 *
 * Routing discipline (provider pinning, no non-equivalent fallback):
 * - `dryMediaUnionProgram` pin present ⇒ the legacy union carrier keeps the stroke byte-identical.
 * - No pin + causal deposit pipeline ⇒ this kernel dab path owns the material.
 * - No pin + legacy (non-causal) snapshot ⇒ the union carrier keeps ownership so historical
 *   documents replay their exact bytes instead of degrading to sampled circle grids.
 * The two owners are mutually exclusive and cover the eligible material set exactly.
 */

import {
  isStudioDryMediaUnionComposableProgramPin,
  isStudioDynamicBrushCausalDepositPipeline,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import { studioStampOssTipCoverage } from "./studio-brush-stamp-engine";
import { STUDIO_DRY_MEDIA_ANISOTROPIC_PRESETS_V1 } from "./studio-dry-media-anisotropic-grain-v1";
import {
  studioOssDirectionalWaxSample,
  studioOssValueNoise2d,
} from "./studio-oss-brush-kernels";

import type {
  NormalizedStudioBrushTipSettings,
  StudioBrushTipAlphaMap,
} from "./studio-brush-tip-stamp";
import type { StudioDynamicBrushMaterialIdentity } from "./studio-dry-media-dynamic-bridge";

export const STUDIO_DRY_MEDIA_KERNEL_TIP_VERSION =
  "dry-media-kernel-tip-v1" as const;

export const STUDIO_DRY_MEDIA_CORE_IDS = [
  "crayon",
  "chalk",
  "charcoal",
  "pastel",
  "oil-pastel",
] as const;

export type StudioDryMediaCoreId = (typeof STUDIO_DRY_MEDIA_CORE_IDS)[number];

const CORE_DRY_MEDIA_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_DRY_MEDIA_CORE_IDS,
);

/**
 * Authored primary tip shape per core dry medium. A user who re-shapes the tip has left the
 * catalogue material, so both the union carrier and this kernel path release ownership and the
 * generic dynamics pipeline keeps its existing byte-identical output.
 */
export const STUDIO_DRY_MEDIA_CORE_TIP_SHAPES = Object.freeze({
  crayon: "hard",
  chalk: "sponge",
  charcoal: "bristle",
  pastel: "sponge",
  "oil-pastel": "bristle",
} as const);

/**
 * Deterministic per-material texture variants. Successive dabs rotate through this fixed set via
 * their stable causal index, so live suffixes, pointer-up replay and SVG export select identical
 * maps while adjacent stations never tile one identical grain orientation.
 */
export const STUDIO_DRY_MEDIA_KERNEL_TIP_VARIANT_COUNT = 4;
export const STUDIO_DRY_MEDIA_KERNEL_TIP_MAP_SIZE = 128;
const KERNEL_TIP_CACHE_LIMIT = 64;

/**
 * Exact material-eligibility contract shared by the union carrier and the kernel dab path.
 * This is the historical `studioDryMediaUnionRibbonCarrierOwnsMaterial` body minus routing:
 * routing (pin/pipeline) is layered on top by the two owners below.
 */
export function resolveStudioDryMediaKernelTipMaterial(
  materialIdentity: StudioDynamicBrushMaterialIdentity | undefined,
  dynamics: NormalizedStudioBrushDynamicsSettings,
): StudioDryMediaCoreId | null {
  if (
    materialIdentity?.brushCatalogId === "paint-roller"
    || materialIdentity?.brushCatalogId?.includes("pencil")
    || materialIdentity?.brushId?.includes("pencil")
    || materialIdentity?.dryMediaPresetId?.includes("pencil")
  ) return null;
  const brushId = materialIdentity?.brushId;
  const catalogId = materialIdentity?.brushCatalogId;
  const targetId = typeof brushId === "string" && CORE_DRY_MEDIA_ID_SET.has(brushId)
    ? brushId as StudioDryMediaCoreId
    : typeof catalogId === "string" && CORE_DRY_MEDIA_ID_SET.has(catalogId)
      ? catalogId as StudioDryMediaCoreId
      : null;
  if (!targetId) return null;
  const expectedShape = STUDIO_DRY_MEDIA_CORE_TIP_SHAPES[targetId];
  if (dynamics.tip.shape !== expectedShape) return null;
  const color = dynamics.colorDynamics;
  return dynamics.tipLayers.length === 0
    && dynamics.dualBrush?.enabled !== true
    && color.backgroundColor === null
    && color.foregroundBackgroundMix === 0
    && color.foregroundBackgroundJitter === 0
    && color.hueJitter === 0
    && color.saturationJitter === 0
    && color.valueJitter === 0
    ? targetId
    : null;
}

/**
 * Kernel dab path ownership: eligible material, no legacy union program pin, causal pipeline.
 * Returns the owned material id so planners can resolve tips without re-deriving identity.
 */
export function studioDryMediaKernelDabPathOwnsMaterial(
  materialIdentity: StudioDynamicBrushMaterialIdentity | undefined,
  dynamics: NormalizedStudioBrushDynamicsSettings,
): StudioDryMediaCoreId | null {
  const material = resolveStudioDryMediaKernelTipMaterial(
    materialIdentity,
    dynamics,
  );
  if (
    !material
    || isStudioDryMediaUnionComposableProgramPin(dynamics.dryMediaUnionProgram)
    || !isStudioDynamicBrushCausalDepositPipeline(dynamics.depositPipeline)
  ) return null;
  return material;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** FNV-1a over the cache identity — the only seed source, so baking is fully deterministic. */
function kernelTipSeed(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Fixed tip-local stroke axis — same convention as the stamp engine's cached OSS tips. */
const KERNEL_TIP_DIRECTION_RADIANS = -Math.PI / 5;

/**
 * Pure per-texel coverage for one core dry medium. The four stamp materials delegate verbatim to
 * the W1-verified `studioStampOssTipCoverage` kernels; oil-pastel composes the same verified wax
 * primitives into a smoother, more occlusive film (wide pressed plateau, subtle scrape grooves).
 */
export function studioDryMediaKernelTipCoverage(
  materialId: StudioDryMediaCoreId,
  normalizedX: number,
  normalizedY: number,
  seed: number,
  hardness: number,
): number {
  if (materialId !== "oil-pastel") {
    return studioStampOssTipCoverage(
      materialId,
      normalizedX,
      normalizedY,
      seed,
      hardness,
    );
  }
  const hard = clamp01(hardness);
  const radial = Math.hypot(normalizedX, normalizedY);
  const wax = studioOssDirectionalWaxSample(
    normalizedX,
    normalizedY,
    KERNEL_TIP_DIRECTION_RADIANS,
    seed ^ 0x6f,
  );
  // Oil pastel: wax film presses flat and covers densely. Wider plateau and weaker scrape than
  // crayon keep the bed smooth while the rim still breaks with wax noise instead of a clean disc.
  const rimWobble = (wax.wax - 0.5) * 0.16;
  const plateau = 0.55 + hard * 0.26;
  const shoulderWidth = Math.max(0.12, 1 - plateau);
  const disk = clamp01(1 - (radial + rimWobble - plateau) / shoulderWidth);
  return clamp01(disk * (0.62 + 0.38 * wax.wax) * (1 - wax.scrape * 0.28));
}

/**
 * Dynamic-lane deposition shaping over the verified kernels.
 *
 * The OSS kernels were tuned for the stamp walker's full-size circular dabs. The dynamic dry-media
 * lane deposits the same kernels through the anisotropic bridge's narrow fibre ellipses, which
 * reads several times lighter and softer than the retired union bed at identical brush settings.
 * Shaping restores the bed's optical density without inventing texture:
 * - `cut` turns the deepest kernel valleys into true zero pores (paper tooth stays full-contrast),
 * - `gamma < 1` lifts midtone pigment (structure-preserving, zeros stay zero),
 * - `gain` saturates the pressed body so aggregate stroke edges stay as tight as the union edge.
 * Constants are per material and fixed — they are part of the deterministic bake identity.
 */
interface KernelTipShaping {
  readonly cut: number;
  readonly gamma: number;
  readonly gain: number;
  /** Radial width of the hard rim shoulder; long soft skirts read blurrier than the union edge. */
  readonly rimShoulder: number;
  /**
   * Optional minor-axis fibre band (wax sticks only). The union carrier drew each fibre at
   * ~52–100% of its ellipse half-width, keeping visible striation grooves between lanes; a full
   * plateau disk merges the lanes into one flat slab. `zeroAt` is the |ny| where coverage ends,
   * `shoulder` its transition width.
   */
  readonly band?: Readonly<{ zeroAt: number; shoulder: number }>;
  /**
   * Deposition linearization exponent (libmypaint `opaque_linearize` DNA, ISC): the stroke-level
   * pigment target is reached through overlapping fibre dabs, so the per-dab source-over alpha is
   * lifted as `1 − (1 − a)^k`. The retired union bed painted every lane at full alpha; without
   * this lift the sparse outer lanes read as a wide half-tone fringe instead of a dry stick edge.
   */
  readonly depositionLinearize: number;
}

// Annotated (not `satisfies`-narrowed) so the optional `band` member is readable on the indexed
// union — the per-material literal values are internal and never re-exported (typecheck fix,
// runtime-identical).
const KERNEL_TIP_SHAPING: Readonly<Record<StudioDryMediaCoreId, KernelTipShaping>> = Object.freeze({
  crayon: Object.freeze({
    cut: 0.3,
    gamma: 1,
    gain: 1.5,
    rimShoulder: 0.1,
    band: Object.freeze({ zeroAt: 0.72, shoulder: 0.14 }),
    depositionLinearize: 2,
  }),
  chalk: Object.freeze({
    cut: 0.24,
    gamma: 0.4,
    gain: 6,
    rimShoulder: 0.08,
    depositionLinearize: 6,
  }),
  charcoal: Object.freeze({
    cut: 0.14,
    gamma: 0.45,
    gain: 5,
    rimShoulder: 0.08,
    depositionLinearize: 5,
  }),
  pastel: Object.freeze({
    cut: 0.14,
    gamma: 0.45,
    gain: 5,
    rimShoulder: 0.08,
    depositionLinearize: 6.5,
  }),
  "oil-pastel": Object.freeze({
    cut: 0.12,
    gamma: 0.8,
    gain: 2.2,
    rimShoulder: 0.08,
    band: Object.freeze({ zeroAt: 0.72, shoulder: 0.14 }),
    depositionLinearize: 4,
  }),
});

/**
 * Pressure-resolved dab alpha → kernel-lane deposition alpha. Pure and monotonic: harder presses
 * still deposit more, zero stays zero, and the same dab produces the same alpha in live suffixes,
 * pointer-up replay and SVG export.
 */
export function linearizeStudioDryMediaKernelDepositionAlpha(
  materialId: StudioDryMediaCoreId,
  alpha: number,
): number {
  const bounded = clamp01(alpha);
  if (bounded <= 0) return 0;
  return clamp01(
    1 - (1 - bounded) ** KERNEL_TIP_SHAPING[materialId].depositionLinearize,
  );
}

interface KernelStrokeTooth {
  /** Pore depth: 1 leaves paper fully visible inside a pore, 0 disables the field. */
  readonly depth: number;
  /** Noise threshold below which a pore opens (≈ pore area fraction). */
  readonly threshold: number;
  /** Threshold transition width; keeps pore rims from aliasing into single-texel dust. */
  readonly width: number;
  /** Pore cell size (document px in world space; arc px along the spine in arc-lane space). */
  readonly scale: number;
  /**
   * Pore anchoring space. Powder media use stroke-fixed world space. Wax sticks use the stroke's
   * own (arc length × fibre lane) parameterization — the union carrier seeded its slit pores per
   * causal lane segment, which is exactly this space — so pores stay elongated along travel and
   * fully survive dab overlap inside one lane.
   */
  readonly space: "stroke-world" | "arc-lane";
  /** Pore-threshold ratio on the lateral edge lanes (1 = full pore density, 0 = solid rails). */
  readonly railThresholdRatio?: number;
}

const KERNEL_STROKE_TOOTH = Object.freeze({
  crayon: Object.freeze({
    depth: 1,
    threshold: 0.6,
    width: 0.21,
    scale: 4.2,
    space: "arc-lane",
    railThresholdRatio: 0.73,
  }),
  chalk: Object.freeze({
    depth: 0.95,
    threshold: 0.38,
    width: 0.08,
    scale: 2.8,
    space: "stroke-world",
  }),
  charcoal: Object.freeze({
    depth: 0.95,
    threshold: 0.35,
    width: 0.08,
    scale: 2,
    space: "stroke-world",
  }),
  pastel: Object.freeze({
    depth: 0.95,
    threshold: 0.38,
    width: 0.08,
    scale: 2.6,
    space: "stroke-world",
  }),
  "oil-pastel": Object.freeze({
    depth: 0.95,
    threshold: 0.5,
    width: 0.12,
    scale: 3.6,
    space: "arc-lane",
    railThresholdRatio: 0.6,
  }),
} as const satisfies Readonly<Record<StudioDryMediaCoreId, KernelStrokeTooth>>);

/** Native kernel lane count per material (the bridge's expanded-index modulus). */
const KERNEL_NATIVE_LANE_COUNT = Object.freeze({
  crayon: STUDIO_DRY_MEDIA_ANISOTROPIC_PRESETS_V1.crayon.laneCount,
  chalk: STUDIO_DRY_MEDIA_ANISOTROPIC_PRESETS_V1.chalk.laneCount,
  charcoal: STUDIO_DRY_MEDIA_ANISOTROPIC_PRESETS_V1.charcoal.laneCount,
  pastel: STUDIO_DRY_MEDIA_ANISOTROPIC_PRESETS_V1.pastel.laneCount,
  "oil-pastel": STUDIO_DRY_MEDIA_ANISOTROPIC_PRESETS_V1.pastel.laneCount,
} as const satisfies Readonly<Record<StudioDryMediaCoreId, number>>);

/**
 * Stroke-anchored paper-tooth multiplier for kernel-lane dabs.
 *
 * Tip-local pores cannot survive dab overlap: five to seven fibres cover every pixel and their
 * grain never lines up, so aggregated coverage flattens. This field lives in the stroke's own
 * coordinates (stroke-fixed world space, or arc-length × lane space for wax sticks — matching the
 * union carrier's per-lane slit seeding), so every overlapping dab dips at the same paper valley
 * and the bed keeps full-contrast tooth. Built on the verified Klecks-substitute value noise;
 * fully deterministic in (material, stroke seed, dab identity).
 */
export function studioDryMediaKernelStrokeToothMultiplier(
  materialId: StudioDryMediaCoreId,
  dab: Readonly<{
    readonly index: number;
    readonly x: number;
    readonly y: number;
    readonly distanceFromStrokeStart?: number;
  }>,
  strokeOriginX: number,
  strokeOriginY: number,
  strokeSeed: number,
): number {
  const tooth = KERNEL_STROKE_TOOTH[materialId];
  const seed = (strokeSeed ^ kernelTipSeed(`stroke-tooth:${materialId}`)) >>> 0;
  if (
    tooth.space === "arc-lane"
    && typeof dab.distanceFromStrokeStart === "number"
    && Number.isFinite(dab.distanceFromStrokeStart)
    && Number.isSafeInteger(dab.index)
  ) {
    const laneCount = KERNEL_NATIVE_LANE_COUNT[materialId];
    const laneOrdinal = ((dab.index % laneCount) + laneCount) % laneCount;
    const noise = studioOssValueNoise2d(
      dab.distanceFromStrokeStart / tooth.scale,
      // One lattice row per fibre lane: pores form elongated per-lane runs along travel.
      laneOrdinal + 0.5,
      seed,
    );
    // Lateral edge lanes open fewer pore mouths (lower threshold), but every pore keeps full
    // depth: a full pore drops below the coverage floor and reads as paper, while a half-depth
    // pore would hover at mid alpha on the silhouette and read as fringe.
    const edgeLane = laneOrdinal === 0 || laneOrdinal === laneCount - 1;
    const laneThreshold = edgeLane
      ? tooth.threshold * (tooth.railThresholdRatio ?? 1)
      : tooth.threshold;
    const pore = clamp01((laneThreshold - noise) / tooth.width + 0.5);
    return 1 - tooth.depth * pore;
  }
  const noise = studioOssValueNoise2d(
    (dab.x - strokeOriginX) / tooth.scale,
    (dab.y - strokeOriginY) / tooth.scale,
    seed,
  );
  const pore = clamp01((tooth.threshold - noise) / tooth.width + 0.5);
  return 1 - tooth.depth * pore;
}

export const STUDIO_DRY_MEDIA_KERNEL_TIP_WIDTH_STEPS = 8;

/**
 * The union carrier encoded pressure as fibre WIDTH (`coverageHalfWidth`:
 * `radiusY × (0.52 + √alpha × 0.48)`), not as translucency. Banded wax materials reproduce that
 * response by selecting a band width from the quantized deposition alpha, so a light graze leaves
 * a narrow striated line and full pressure a broad one — with hard edges at every pressure.
 */
export function studioDryMediaKernelTipWidthStep(
  materialId: StudioDryMediaCoreId,
  depositionAlpha: number,
): number {
  if (!KERNEL_TIP_SHAPING[materialId].band) return STUDIO_DRY_MEDIA_KERNEL_TIP_WIDTH_STEPS;
  return Math.round(
    Math.sqrt(clamp01(depositionAlpha)) * STUDIO_DRY_MEDIA_KERNEL_TIP_WIDTH_STEPS,
  );
}

export function shapeStudioDryMediaKernelTipCoverage(
  materialId: StudioDryMediaCoreId,
  rawCoverage: number,
  normalizedX: number,
  normalizedY: number,
  widthStep: number = STUDIO_DRY_MEDIA_KERNEL_TIP_WIDTH_STEPS,
): number {
  const shaping = KERNEL_TIP_SHAPING[materialId];
  if (!(rawCoverage > shaping.cut)) return 0;
  const radial = Math.hypot(normalizedX, normalizedY);
  const rim = clamp01((1 - radial) / shaping.rimShoulder);
  const rimEnvelope = rim * rim * (3 - 2 * rim);
  let bandEnvelope = 1;
  if (shaping.band) {
    const widthRatio = 0.52 + 0.48 * clamp01(
      widthStep / STUDIO_DRY_MEDIA_KERNEL_TIP_WIDTH_STEPS,
    );
    const band = clamp01(
      (shaping.band.zeroAt * widthRatio - Math.abs(normalizedY))
        / shaping.band.shoulder,
    );
    bandEnvelope = band * band * (3 - 2 * band);
  }
  return clamp01(rawCoverage ** shaping.gamma * shaping.gain)
    * rimEnvelope
    * bandEnvelope;
}

const kernelTipMapCache = new Map<string, StudioBrushTipAlphaMap>();

function bakeKernelTipAlphaMap(
  materialId: StudioDryMediaCoreId,
  variant: number,
  hardnessStep: number,
  widthStep: number,
  cacheKey: string,
): StudioBrushTipAlphaMap {
  const size = STUDIO_DRY_MEDIA_KERNEL_TIP_MAP_SIZE;
  const alphas = new Float32Array(size * size);
  const centre = (size - 1) / 2;
  const seed = kernelTipSeed(
    `${STUDIO_DRY_MEDIA_KERNEL_TIP_VERSION}:${materialId}:${variant}:${hardnessStep}`,
  );
  const hardness = hardnessStep / 20;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - centre) / centre;
      const ny = (y - centre) / centre;
      alphas[y * size + x] = shapeStudioDryMediaKernelTipCoverage(
        materialId,
        studioDryMediaKernelTipCoverage(
          materialId,
          nx,
          ny,
          seed,
          hardness,
        ),
        nx,
        ny,
        widthStep,
      );
    }
  }
  return Object.freeze({
    size,
    alphas,
    shape: STUDIO_DRY_MEDIA_CORE_TIP_SHAPES[materialId],
    softness: clamp01(1 - hardness),
    custom: false,
    // Content-stable revision: SVG export and the texture stamp caches key immutable maps by it.
    revision: cacheKey,
  });
}

/**
 * Resolves the immutable kernel tip map for one dab. `dabIndex` is the stable causal dab index
 * (the bridge's expanded station-lane index), so an arbitrary live suffix and a full pointer-up
 * replay pick the same variant for the same physical fibre.
 */
export function resolveStudioDryMediaKernelTipAlphaMap(
  materialId: StudioDryMediaCoreId,
  tip: NormalizedStudioBrushTipSettings,
  dabIndex: number,
  depositionAlpha = 1,
): StudioBrushTipAlphaMap {
  const boundedIndex = Number.isSafeInteger(dabIndex) ? dabIndex : 0;
  // Wax sticks drag a persistent crystal surface: three consecutive stations share one variant so
  // their overlap keeps the map's own grain (powder media decorrelate every dab instead).
  const variantBasis = KERNEL_TIP_SHAPING[materialId].band
    ? Math.floor(
        Math.floor(boundedIndex / KERNEL_NATIVE_LANE_COUNT[materialId]) / 3,
      )
    : boundedIndex;
  const variant = (
    (variantBasis % STUDIO_DRY_MEDIA_KERNEL_TIP_VARIANT_COUNT)
    + STUDIO_DRY_MEDIA_KERNEL_TIP_VARIANT_COUNT
  ) % STUDIO_DRY_MEDIA_KERNEL_TIP_VARIANT_COUNT;
  // Quantize like the stamp engine's tip cache: 1/20 hardness steps bound the bake count while
  // keeping the softness slider connected to the material response.
  const hardnessStep = Math.round(clamp01(1 - tip.softness) * 20);
  const widthStep = studioDryMediaKernelTipWidthStep(materialId, depositionAlpha);
  const cacheKey =
    `${STUDIO_DRY_MEDIA_KERNEL_TIP_VERSION}:${materialId}:${variant}:${hardnessStep}:${widthStep}`;
  const cached = kernelTipMapCache.get(cacheKey);
  if (cached) {
    // Map insertion order is the LRU queue (same idiom as the shared tip alpha-map cache).
    kernelTipMapCache.delete(cacheKey);
    kernelTipMapCache.set(cacheKey, cached);
    return cached;
  }
  const baked = bakeKernelTipAlphaMap(
    materialId,
    variant,
    hardnessStep,
    widthStep,
    cacheKey,
  );
  if (kernelTipMapCache.size >= KERNEL_TIP_CACHE_LIMIT) {
    const oldestKey = kernelTipMapCache.keys().next().value;
    if (oldestKey !== undefined) kernelTipMapCache.delete(oldestKey);
  }
  kernelTipMapCache.set(cacheKey, baked);
  return baked;
}
