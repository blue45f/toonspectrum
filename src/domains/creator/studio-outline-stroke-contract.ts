/**
 * Durable contract and shared render plan for perfect-freehand outline strokes.
 *
 * The document layer must not infer renderer semantics from a brush id or from whether a pressure
 * array happens to be present. A pointer-start caller captures this small JSON-safe contract once,
 * persists it with the stroke, and every live/retained/export renderer resolves the same snapshot.
 *
 * Missing metadata is deliberately classified as `legacy`; malformed or future metadata is
 * `unsupported` and must be surfaced to the caller instead of silently changing pixels.
 */

import { resolveStudioFreehandRenderPath } from "./studio-brush";
import { resolveStudioBrushAliasProfile } from "./studio-brush-alias-profile";
import {
  buildStudioPerfectFreehandOutline,
  resolveStudioPerfectFreehandProfile,
  studioPerfectFreehandOutlineToPathData,
  type StudioPerfectFreehandProfile,
  type StudioPerfectFreehandProfileId,
  type StudioPerfectFreehandStroker,
} from "./studio-perfect-freehand";

export const STUDIO_OUTLINE_STROKE_CONTRACT_KIND =
  "studio-outline-stroke-contract" as const;
export const STUDIO_OUTLINE_STROKE_CONTRACT_VERSION = 1 as const;
export const STUDIO_OUTLINE_STROKE_ENGINE =
  "perfect-freehand-outline" as const;
export const STUDIO_OUTLINE_STROKE_ADAPTER_VERSION =
  "toonspectrum-perfect-freehand-adapter-v1" as const;
export const STUDIO_OUTLINE_STROKE_PACKAGE_ALGORITHM =
  "perfect-freehand@1.2.3:getStroke" as const;

export type StudioOutlineStrokePressureSource =
  | "recorded"
  | "simulated-distance";

/**
 * Numeric profile values are copied into every new outline contract. The profile id remains useful
 * for diagnostics and frozen v1 fallback policy, but replay never consults mutable catalog values.
 */
export interface StudioOutlineStrokeProfileSnapshotV1 {
  readonly id: StudioPerfectFreehandProfileId;
  /** Brush-specific selected-size multiplier captured before the mutable alias catalogue changes. */
  readonly diameterScale: number;
  readonly thinning: number;
  readonly smoothing: number;
  readonly streamline: number;
  readonly taperStartFactor: number;
  readonly taperEndFactor: number;
  readonly capStart: boolean;
  readonly capEnd: boolean;
}

export interface StudioOutlineStrokeContractV1 {
  readonly kind: typeof STUDIO_OUTLINE_STROKE_CONTRACT_KIND;
  readonly version: typeof STUDIO_OUTLINE_STROKE_CONTRACT_VERSION;
  readonly engine: typeof STUDIO_OUTLINE_STROKE_ENGINE;
  readonly adapterVersion: typeof STUDIO_OUTLINE_STROKE_ADAPTER_VERSION;
  readonly packageAlgorithm: typeof STUDIO_OUTLINE_STROKE_PACKAGE_ALGORITHM;
  readonly pressureSource: StudioOutlineStrokePressureSource;
  readonly profile: StudioOutlineStrokeProfileSnapshotV1;
}

export interface StudioOutlineStrokeContractCaptureInput {
  readonly brushId: unknown;
  /**
   * Pointer-start must choose this explicitly. In particular, the capture boundary must not infer
   * simulation merely because the first pressure array is empty.
   */
  readonly pressureSource: unknown;
}

export type StudioOutlineStrokeContractIssueCode =
  | "malformed-contract"
  | "unsupported-kind"
  | "unsupported-version"
  | "unsupported-engine"
  | "unsupported-adapter-version"
  | "unsupported-package-algorithm"
  | "unsupported-pressure-source"
  | "unsupported-profile";

export interface StudioOutlineStrokeContractIssue {
  readonly code: StudioOutlineStrokeContractIssueCode;
  readonly path: string;
  readonly message: string;
}

export type StudioOutlineStrokeContractResolution =
  | {
      readonly status: "legacy";
      readonly contract: null;
      readonly reason: "missing-contract";
    }
  | {
      readonly status: "ready";
      readonly contract: StudioOutlineStrokeContractV1;
    }
  | {
      readonly status: "unsupported";
      readonly contract: null;
      readonly issue: StudioOutlineStrokeContractIssue;
    };

export class StudioOutlineStrokeContractError extends Error {
  readonly issue: StudioOutlineStrokeContractIssue;

  constructor(issue: StudioOutlineStrokeContractIssue) {
    super(issue.message);
    this.name = "StudioOutlineStrokeContractError";
    this.issue = issue;
  }
}

const CONTRACT_KEYS = [
  "kind",
  "version",
  "engine",
  "adapterVersion",
  "packageAlgorithm",
  "pressureSource",
  "profile",
] as const;
const PROFILE_KEYS = [
  "id",
  "diameterScale",
  "thinning",
  "smoothing",
  "streamline",
  "taperStartFactor",
  "taperEndFactor",
  "capStart",
  "capEnd",
] as const;
const PROFILE_IDS = new Set<StudioPerfectFreehandProfileId>([
  "perfect-ink",
  "perfect-marker",
  "gpen",
]);

function issue(
  code: StudioOutlineStrokeContractIssueCode,
  path: string,
  message: string,
): StudioOutlineStrokeContractIssue {
  return Object.freeze({ code, path, message });
}

/**
 * Reads only enumerable own data properties. Accessors, symbols and exotic prototypes are not
 * accepted at a renderer-significant persistence boundary.
 */
function plainDataRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || descriptor.enumerable !== true
        || !("value" in descriptor)
      ) {
        return null;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(record);
  return actualKeys.length === keys.length
    && actualKeys.every((key) => keys.includes(key));
}

function boundedFiniteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function normalizeProfileSnapshot(
  value: unknown,
): StudioOutlineStrokeProfileSnapshotV1 | StudioOutlineStrokeContractIssue {
  const profile = plainDataRecord(value);
  if (!profile || !hasExactKeys(profile, PROFILE_KEYS)) {
    return issue(
      "unsupported-profile",
      "profile",
      "외곽선 브러시 프로필 스냅샷의 필드가 올바르지 않습니다.",
    );
  }
  if (typeof profile.id !== "string" || !PROFILE_IDS.has(
    profile.id as StudioPerfectFreehandProfileId,
  )) {
    return issue(
      "unsupported-profile",
      "profile.id",
      "이 클라이언트가 지원하지 않는 외곽선 브러시 프로필입니다.",
    );
  }
  if (
    !boundedFiniteNumber(profile.diameterScale, 0.01, 16)
    || !boundedFiniteNumber(profile.thinning, -1, 1)
    || !boundedFiniteNumber(profile.smoothing, 0, 1)
    || !boundedFiniteNumber(profile.streamline, 0, 1)
    || !boundedFiniteNumber(profile.taperStartFactor, 0, 64)
    || !boundedFiniteNumber(profile.taperEndFactor, 0, 64)
    || typeof profile.capStart !== "boolean"
    || typeof profile.capEnd !== "boolean"
  ) {
    return issue(
      "unsupported-profile",
      "profile",
      "외곽선 브러시 프로필 스냅샷의 값이 안전 범위를 벗어났습니다.",
    );
  }

  return Object.freeze({
    id: profile.id as StudioPerfectFreehandProfileId,
    diameterScale: profile.diameterScale,
    thinning: profile.thinning,
    smoothing: profile.smoothing,
    streamline: profile.streamline,
    taperStartFactor: profile.taperStartFactor,
    taperEndFactor: profile.taperEndFactor,
    capStart: profile.capStart,
    capEnd: profile.capEnd,
  });
}

function snapshotProfile(
  profile: StudioPerfectFreehandProfile,
  brushId: unknown,
): StudioOutlineStrokeProfileSnapshotV1 {
  return Object.freeze({
    id: profile.id,
    diameterScale: resolveStudioBrushAliasProfile(brushId)?.diameterScale ?? 1,
    thinning: profile.thinning,
    smoothing: profile.smoothing,
    streamline: profile.streamline,
    taperStartFactor: profile.taperStartFactor,
    taperEndFactor: profile.taperEndFactor,
    capStart: profile.capStart,
    capEnd: profile.capEnd,
  });
}

function isPressureSource(value: unknown): value is StudioOutlineStrokePressureSource {
  return value === "recorded" || value === "simulated-distance";
}

/**
 * Captures the immutable v1 renderer contract at pointer-start.
 *
 * `null` means that the selected brush is not owned by the outline engine. An eligible brush with
 * an invalid pressure source is a programmer error and fails immediately.
 */
export function captureStudioOutlineStrokeContractV1(
  input: StudioOutlineStrokeContractCaptureInput,
): StudioOutlineStrokeContractV1 | null {
  const profile = resolveStudioPerfectFreehandProfile(input.brushId);
  if (!profile) return null;
  if (!isPressureSource(input.pressureSource)) {
    throw new StudioOutlineStrokeContractError(issue(
      "unsupported-pressure-source",
      "pressureSource",
      "외곽선 획의 필압 출처를 pointer-start에서 명시해야 합니다.",
    ));
  }
  return Object.freeze({
    kind: STUDIO_OUTLINE_STROKE_CONTRACT_KIND,
    version: STUDIO_OUTLINE_STROKE_CONTRACT_VERSION,
    engine: STUDIO_OUTLINE_STROKE_ENGINE,
    adapterVersion: STUDIO_OUTLINE_STROKE_ADAPTER_VERSION,
    packageAlgorithm: STUDIO_OUTLINE_STROKE_PACKAGE_ALGORITHM,
    pressureSource: input.pressureSource,
    profile: snapshotProfile(profile, input.brushId),
  });
}

/**
 * Explicit legacy migration. It intentionally requires the caller to supply pressure semantics;
 * presence/absence of a legacy pressure array is not enough to reconstruct authoring intent.
 */
export function migrateLegacyStudioOutlineStrokeContractV1(
  input: StudioOutlineStrokeContractCaptureInput,
):
  | {
      readonly status: "migrated";
      readonly contract: StudioOutlineStrokeContractV1;
    }
  | {
      readonly status: "legacy-ineligible";
      readonly contract: null;
    } {
  const contract = captureStudioOutlineStrokeContractV1(input);
  return contract
    ? Object.freeze({ status: "migrated", contract })
    : Object.freeze({ status: "legacy-ineligible", contract: null });
}

/**
 * Safe resolver for persistence/network inputs. Unknown contracts remain visible to the caller.
 */
export function resolveStudioOutlineStrokeContract(
  value: unknown,
): StudioOutlineStrokeContractResolution {
  if (value === undefined || value === null) {
    return Object.freeze({
      status: "legacy",
      contract: null,
      reason: "missing-contract",
    });
  }

  const contract = plainDataRecord(value);
  if (!contract) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "malformed-contract",
        "$",
        "외곽선 획 계약은 JSON 객체여야 합니다.",
      ),
    });
  }
  if (contract.kind !== STUDIO_OUTLINE_STROKE_CONTRACT_KIND) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "unsupported-kind",
        "kind",
        "지원하지 않는 외곽선 획 계약 종류입니다.",
      ),
    });
  }
  if (contract.version !== STUDIO_OUTLINE_STROKE_CONTRACT_VERSION) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "unsupported-version",
        "version",
        "이 클라이언트가 지원하지 않는 외곽선 획 계약 버전입니다.",
      ),
    });
  }
  if (contract.engine !== STUDIO_OUTLINE_STROKE_ENGINE) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "unsupported-engine",
        "engine",
        "이 클라이언트가 지원하지 않는 외곽선 렌더 엔진입니다.",
      ),
    });
  }
  if (contract.adapterVersion !== STUDIO_OUTLINE_STROKE_ADAPTER_VERSION) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "unsupported-adapter-version",
        "adapterVersion",
        "이 클라이언트가 지원하지 않는 외곽선 어댑터 버전입니다.",
      ),
    });
  }
  if (contract.packageAlgorithm !== STUDIO_OUTLINE_STROKE_PACKAGE_ALGORITHM) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "unsupported-package-algorithm",
        "packageAlgorithm",
        "이 클라이언트가 지원하지 않는 perfect-freehand 알고리즘입니다.",
      ),
    });
  }
  if (!isPressureSource(contract.pressureSource)) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "unsupported-pressure-source",
        "pressureSource",
        "이 클라이언트가 지원하지 않는 외곽선 필압 출처입니다.",
      ),
    });
  }
  if (!hasExactKeys(contract, CONTRACT_KEYS)) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: issue(
        "malformed-contract",
        "$",
        "외곽선 획 계약의 필드가 올바르지 않습니다.",
      ),
    });
  }

  const normalizedProfile = normalizeProfileSnapshot(contract.profile);
  if ("code" in normalizedProfile) {
    return Object.freeze({
      status: "unsupported",
      contract: null,
      issue: normalizedProfile,
    });
  }
  return Object.freeze({
    status: "ready",
    contract: Object.freeze({
      kind: STUDIO_OUTLINE_STROKE_CONTRACT_KIND,
      version: STUDIO_OUTLINE_STROKE_CONTRACT_VERSION,
      engine: STUDIO_OUTLINE_STROKE_ENGINE,
      adapterVersion: STUDIO_OUTLINE_STROKE_ADAPTER_VERSION,
      packageAlgorithm: STUDIO_OUTLINE_STROKE_PACKAGE_ALGORITHM,
      pressureSource: contract.pressureSource,
      profile: normalizedProfile,
    }),
  });
}

/**
 * Normalizes a supported value, returns `null` only for a truly missing legacy contract, and throws
 * for every unsupported value. This is the fail-visible convenience API for persistence bridges.
 */
export function normalizeStudioOutlineStrokeContract(
  value: unknown,
): StudioOutlineStrokeContractV1 | null {
  const resolution = resolveStudioOutlineStrokeContract(value);
  if (resolution.status === "legacy") return null;
  if (resolution.status === "unsupported") {
    throw new StudioOutlineStrokeContractError(resolution.issue);
  }
  return resolution.contract;
}

export interface StudioPerfectFreehandRenderPlanMetrics {
  readonly pointCount: number;
  /** Bounding-box diagonal, matching the frozen v1 retained-render fallback policy. */
  readonly strokeDistance: number;
  readonly sparseSpacing: number;
  readonly outlinePointCount?: number;
  readonly outlineDistance?: number;
}

export type StudioPerfectFreehandFallbackReason =
  | "insufficient-points"
  | "very-short-perfect"
  | "sparse-long-perfect-ink"
  | "stroker-unavailable"
  | "invalid-outline"
  | "degenerate-outline";

export interface StudioPerfectFreehandFallbackLinePlan {
  readonly points: readonly number[];
  readonly tension: number;
  readonly strokeWidth: number;
  /**
   * `null` is a plain round Line fallback. A number asks the renderer to add matching start/end
   * circles, preserving the historical compact/sparse perfect-* fallback.
   */
  readonly endpointCapRadius: number | null;
}

export type StudioPerfectFreehandRenderPlan =
  | {
      readonly kind: "legacy-contract";
      readonly reason: "missing-contract";
    }
  | {
      readonly kind: "unsupported-contract";
      readonly issue: StudioOutlineStrokeContractIssue;
    }
  | {
      readonly kind: "invalid-input";
      readonly reason:
        | "invalid-points"
        | "invalid-stroke-width"
        | "missing-recorded-pressure"
        | "invalid-recorded-pressure";
    }
  | {
      readonly kind: "fallback-line";
      readonly contract: StudioOutlineStrokeContractV1;
      readonly reason: StudioPerfectFreehandFallbackReason;
      readonly line: StudioPerfectFreehandFallbackLinePlan;
      readonly metrics: StudioPerfectFreehandRenderPlanMetrics;
    }
  | {
      readonly kind: "outline";
      readonly contract: StudioOutlineStrokeContractV1;
      readonly outline: readonly (readonly number[])[];
      readonly pathData: string;
      readonly metrics: StudioPerfectFreehandRenderPlanMetrics;
    };

export interface StudioPerfectFreehandRenderPlanInput {
  readonly contract: unknown;
  readonly stroker: StudioPerfectFreehandStroker | null;
  readonly points: readonly number[];
  readonly pressures?: readonly number[] | null;
  readonly strokeWidth: number;
  readonly sampleSpacing?: unknown;
  readonly legacyMinDistance?: number;
}

function normalizeFinitePoints(points: readonly number[]): number[] | null {
  if (!Array.isArray(points) || points.length % 2 !== 0) return null;
  const normalized = new Array<number>(points.length);
  for (let index = 0; index < points.length; index += 1) {
    const coordinate = points[index];
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) return null;
    normalized[index] = coordinate;
  }
  return normalized;
}

function normalizeRecordedPressures(
  pressures: readonly number[] | null | undefined,
): number[] | null {
  if (!Array.isArray(pressures) || pressures.length === 0) return null;
  const normalized = new Array<number>(pressures.length);
  for (let index = 0; index < pressures.length; index += 1) {
    const pressure = pressures[index];
    if (
      typeof pressure !== "number"
      || !Number.isFinite(pressure)
      || pressure < 0
      || pressure > 1
    ) {
      return null;
    }
    normalized[index] = pressure;
  }
  return normalized;
}

function sourceMetrics(points: readonly number[]): StudioPerfectFreehandRenderPlanMetrics {
  const pointCount = Math.floor(points.length / 2);
  if (pointCount === 0) {
    return Object.freeze({ pointCount: 0, strokeDistance: 0, sparseSpacing: 0 });
  }
  let minX = points[0]!;
  let maxX = points[0]!;
  let minY = points[1]!;
  let maxY = points[1]!;
  for (let index = 2; index < points.length; index += 2) {
    minX = Math.min(minX, points[index]!);
    maxX = Math.max(maxX, points[index]!);
    minY = Math.min(minY, points[index + 1]!);
    maxY = Math.max(maxY, points[index + 1]!);
  }
  const strokeDistance = Math.hypot(maxX - minX, maxY - minY);
  return Object.freeze({
    pointCount,
    strokeDistance,
    sparseSpacing: strokeDistance / Math.max(1, pointCount - 1),
  });
}

function outlineMetrics(
  source: StudioPerfectFreehandRenderPlanMetrics,
  outline: readonly (readonly number[])[],
): StudioPerfectFreehandRenderPlanMetrics {
  let minX = outline[0]?.[0] ?? 0;
  let maxX = minX;
  let minY = outline[0]?.[1] ?? 0;
  let maxY = minY;
  for (let index = 1; index < outline.length; index += 1) {
    const point = outline[index]!;
    minX = Math.min(minX, point[0]!);
    maxX = Math.max(maxX, point[0]!);
    minY = Math.min(minY, point[1]!);
    maxY = Math.max(maxY, point[1]!);
  }
  return Object.freeze({
    ...source,
    outlinePointCount: outline.length,
    outlineDistance: Math.hypot(maxX - minX, maxY - minY),
  });
}

function fallbackLinePlan(
  contract: StudioOutlineStrokeContractV1,
  input: StudioPerfectFreehandRenderPlanInput,
  points: number[],
  metrics: StudioPerfectFreehandRenderPlanMetrics,
  reason: StudioPerfectFreehandFallbackReason,
  endpointCaps: boolean,
  renderStrokeWidth: number,
): StudioPerfectFreehandRenderPlan {
  const renderPath = resolveStudioFreehandRenderPath(points, {
    sampleSpacing: input.sampleSpacing,
    acceptedTension: 0.32,
    legacyMinDistance: input.legacyMinDistance,
    legacyTension: 0.4,
  });
  const lineWidth = endpointCaps ? Math.max(renderStrokeWidth, 1) : renderStrokeWidth;
  return Object.freeze({
    kind: "fallback-line",
    contract,
    reason,
    line: Object.freeze({
      points: Object.freeze([...renderPath.points]),
      tension: renderPath.tension,
      strokeWidth: lineWidth,
      endpointCapRadius: endpointCaps ? Math.max(0.5, lineWidth * 0.5) : null,
    }),
    metrics,
  });
}

function freezeOutline(
  outline: readonly (readonly number[])[],
): readonly (readonly number[])[] {
  return Object.freeze(outline.map((point) => Object.freeze([...point])));
}

/**
 * Shared v1 plan for retained live preview, committed canvas and SVG export.
 *
 * It owns all perfect-freehand fallback decisions. A caller renders either the returned filled
 * outline path or the returned round Line plan; unsupported contracts and missing recorded
 * pressure never degrade to visually different geometry.
 */
export function planStudioPerfectFreehandRender(
  input: StudioPerfectFreehandRenderPlanInput,
): StudioPerfectFreehandRenderPlan {
  const contractResolution = resolveStudioOutlineStrokeContract(input.contract);
  if (contractResolution.status === "legacy") {
    return Object.freeze({
      kind: "legacy-contract",
      reason: "missing-contract",
    });
  }
  if (contractResolution.status === "unsupported") {
    return Object.freeze({
      kind: "unsupported-contract",
      issue: contractResolution.issue,
    });
  }
  const contract = contractResolution.contract;
  const points = normalizeFinitePoints(input.points);
  if (!points) {
    return Object.freeze({ kind: "invalid-input", reason: "invalid-points" });
  }
  if (
    typeof input.strokeWidth !== "number"
    || !Number.isFinite(input.strokeWidth)
    || input.strokeWidth <= 0
  ) {
    return Object.freeze({ kind: "invalid-input", reason: "invalid-stroke-width" });
  }
  const selectedDiameter = Math.min(8_192, Math.max(0.01, input.strokeWidth));
  const renderStrokeWidth = Math.min(
    8_192,
    Math.max(0.01, selectedDiameter * contract.profile.diameterScale),
  );

  let pressures: readonly number[] | null = null;
  if (contract.pressureSource === "recorded") {
    if (!Array.isArray(input.pressures) || input.pressures.length === 0) {
      return Object.freeze({
        kind: "invalid-input",
        reason: "missing-recorded-pressure",
      });
    }
    pressures = normalizeRecordedPressures(input.pressures);
    if (!pressures) {
      return Object.freeze({
        kind: "invalid-input",
        reason: "invalid-recorded-pressure",
      });
    }
  }
  const representativePressure = pressures && pressures.length > 0
    ? pressures.reduce((total, pressure) => total + pressure, 0) / pressures.length
    : 0.5;
  // perfect-freehand uses this exact linear diameter response. Compact fallbacks must share it;
  // otherwise a tap or very short flick changes size when the outline route becomes available.
  const fallbackStrokeWidth = Math.max(
    0.01,
    renderStrokeWidth * (
      1 + 2 * contract.profile.thinning * (representativePressure - 0.5)
    ),
  );

  const metrics = sourceMetrics(points);
  if (metrics.pointCount < 2) {
    return fallbackLinePlan(
      contract,
      input,
      points,
      metrics,
      "insufficient-points",
      true,
      fallbackStrokeWidth,
    );
  }

  const compactPerfectProfile =
    contract.profile.id === "perfect-ink"
    || contract.profile.id === "perfect-marker";
  const veryShortPerfect =
    compactPerfectProfile
    && metrics.pointCount <= 3
    && metrics.strokeDistance < 16;
  const sparseLongPerfectInk =
    contract.profile.id === "perfect-ink"
    && metrics.pointCount >= 4
    && metrics.strokeDistance >= 180
    && metrics.sparseSpacing >= Math.max(20, input.strokeWidth * 4);

  if (veryShortPerfect || sparseLongPerfectInk) {
    return fallbackLinePlan(
      contract,
      input,
      points,
      metrics,
      veryShortPerfect ? "very-short-perfect" : "sparse-long-perfect-ink",
      true,
      fallbackStrokeWidth,
    );
  }
  if (!input.stroker) {
    return fallbackLinePlan(
      contract,
      input,
      points,
      metrics,
      "stroker-unavailable",
      false,
      renderStrokeWidth,
    );
  }

  const outline = buildStudioPerfectFreehandOutline(input.stroker, {
    points,
    pressures,
    strokeWidth: renderStrokeWidth,
    profile: contract.profile,
  });
  const pathData = studioPerfectFreehandOutlineToPathData(outline);
  if (!pathData) {
    return fallbackLinePlan(
      contract,
      input,
      points,
      metrics,
      "invalid-outline",
      false,
      renderStrokeWidth,
    );
  }
  const metricsWithOutline = outlineMetrics(metrics, outline);
  const outlineDistance = metricsWithOutline.outlineDistance ?? 0;
  const degenerate =
    (
      outline.length < 12
      && metrics.strokeDistance < 120
    )
    || outlineDistance < Math.max(6, metrics.strokeDistance * 0.35);
  if (degenerate) {
    return fallbackLinePlan(
      contract,
      input,
      points,
      metricsWithOutline,
      "degenerate-outline",
      false,
      renderStrokeWidth,
    );
  }

  return Object.freeze({
    kind: "outline",
    contract,
    outline: freezeOutline(outline),
    pathData,
    metrics: metricsWithOutline,
  });
}
