import {
  STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
} from "./studio-crdt-protocol";
import { normalizeStudioBrushCatalogIdentityMetadata } from "./studio-element-model";
import {
  isStudioInkPressureModel,
  studioInkFallbackPressure,
  type StudioInkPressureModel,
} from "./studio-ink-pressure-model";
import {
  isStudioStrokePaintModel,
  isStudioStrokePaintModelCompatible,
  type StudioStrokePaintModel,
} from "./studio-stroke-paint-model";

import type {
  StudioCrdtDrawStrokePayload,
  StudioCrdtJsonObject,
  StudioCrdtJsonValue,
  StudioCrdtStrokeInput,
  StudioCrdtStrokeSamples,
} from "./studio-crdt-document";

export interface StudioCrdtCompatibleDrawElement {
  id: string;
  type: "draw";
  kind?: string;
  mode?: "pen" | "eraser";
  points: number[];
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  paintModel?: StudioStrokePaintModel;
  fill?: string;
  gradient?: unknown;
  pattern?: unknown;
  brush?: string;
  brushCatalogId?: string;
  brushCatalogName?: string;
  pressures?: number[];
  pressureModel?: StudioInkPressureModel;
  sampleSpacing?: number;
  tiltXs?: number[];
  tiltYs?: number[];
  twists?: number[];
  speeds?: number[];
  tangentialPressures?: number[];
  brushDynamics?: unknown;
  brushTip?: unknown;
  stamp?: unknown;
  stampPipeline?: "causal-walker-v2";
  watercolorPipeline?: "causal-walker-v2";
  strokeStyle?: unknown;
  shapeParams?: unknown;
  symmetry?: unknown;
  blendMode?: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  noClip?: boolean;
  lockAspect?: boolean;
  groupId?: string;
  clipBelow?: boolean;
  alphaLocked?: boolean;
  maskSrc?: string;
  maskEnabled?: boolean;
  layerRole?: string;
  layerColor?: string;
  emeresSourceId?: string;
}

const EXTENSION_KEYS = [
  // 스탬프 브러시 튜닝(flow/hardness/minSize) — 확장 봉투로 무손실 왕복한다.
  "stamp",
  "stampPipeline",
  "watercolorPipeline",
  "name",
  "hidden",
  "locked",
  "noClip",
  "lockAspect",
  "groupId",
  "clipBelow",
  "alphaLocked",
  "maskSrc",
  "maskEnabled",
  "layerRole",
  "layerColor",
  "emeresSourceId",
] as const;

function jsonValue(value: unknown): StudioCrdtJsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const result: StudioCrdtJsonValue[] = [];
    for (const item of value) {
      const normalized = jsonValue(item);
      if (normalized === undefined) return undefined;
      result.push(normalized);
    }
    return result;
  }
  if (!value || typeof value !== "object") return undefined;
  const result: StudioCrdtJsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = jsonValue(item);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

function jsonObject(value: unknown): StudioCrdtJsonObject | undefined {
  const normalized = jsonValue(value);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized
    : undefined;
}

function aligned(values: number[] | undefined, count: number, fallback: number): number[] | undefined {
  if (!values) return undefined;
  return Array.from({ length: count }, (_, index) => {
    const value = values[index];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  });
}

/**
 * Aligns only the append suffix that is about to enter the CRDT. Long in-progress strokes call
 * this for every pointer batch, so aligning the complete history here would turn streaming into
 * quadratic work even though the CRDT consumes only samples after `start`.
 */
function alignedSlice(
  values: number[] | undefined,
  count: number,
  start: number,
  fallback: number
): number[] | undefined {
  if (!values) return undefined;
  const result = new Array<number>(count - start);
  for (let sourceIndex = start, resultIndex = 0; sourceIndex < count; sourceIndex += 1) {
    const value = values[sourceIndex];
    result[resultIndex] = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    resultIndex += 1;
  }
  return result;
}

function extensionsOf(element: StudioCrdtCompatibleDrawElement): StudioCrdtJsonObject | undefined {
  const extensions: StudioCrdtJsonObject = {};
  for (const key of EXTENSION_KEYS) {
    const normalized = jsonValue(element[key]);
    if (normalized !== undefined) extensions[key] = normalized;
  }
  // Keep this versioned opt-in out of the generic JSON whitelist: an unknown future string must
  // never be persisted as if this client knew how to render its pressure semantics.
  if (isStudioInkPressureModel(element.pressureModel)) {
    extensions.pressureModel = element.pressureModel;
  }
  // Stroke alpha semantics are versioned just like pressure geometry. Unknown future values must
  // never enter the shared document through the generic JSON extension whitelist.
  if (isStudioStrokePaintModelCompatible(element)) {
    extensions.paintModel = element.paintModel;
  }
  return Object.keys(extensions).length > 0 ? extensions : undefined;
}

export function studioDrawElementToCrdtStroke(
  pageId: string,
  element: StudioCrdtCompatibleDrawElement
): StudioCrdtStrokeInput {
  if (
    isStudioStrokePaintModel(element.paintModel)
    && !isStudioStrokePaintModelCompatible(element)
  ) {
    throw new Error("획 페인트 모델과 브러시 합성 모드가 호환되지 않습니다.");
  }
  const sampleCount = Math.floor(element.points.length / 2);
  const pressureFallback = studioInkFallbackPressure(element.pressureModel);
  const pressures = element.pressures === undefined
    && isStudioInkPressureModel(element.pressureModel)
    ? Array<number>(sampleCount).fill(pressureFallback)
    : aligned(element.pressures, sampleCount, pressureFallback);
  const extensions = extensionsOf(element);
  const brushCatalogIdentity = normalizeStudioBrushCatalogIdentityMetadata(element);
  const payload: StudioCrdtDrawStrokePayload = {
    // Keep ordinary strokes on v1 so long-open v1 collaborators continue to render them. Only
    // renderer-significant layered paint semantics require the fail-closed v2 payload.
    version: extensions?.paintModel === undefined
      ? STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION
      : STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
    type: "draw",
    kind: element.kind ?? "freehand",
    mode: element.mode ?? "pen",
    points: element.points.slice(0, sampleCount * 2),
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
  };
  Object.assign(payload, {
    pressures,
    tiltXs: aligned(element.tiltXs, sampleCount, 0),
    tiltYs: aligned(element.tiltYs, sampleCount, 0),
    twists: aligned(element.twists, sampleCount, 0),
    speeds: aligned(element.speeds, sampleCount, 0),
    tangentialPressures: aligned(element.tangentialPressures, sampleCount, 0),
  });
  if (element.opacity !== undefined) payload.opacity = element.opacity;
  if (element.fill !== undefined) payload.fill = element.fill;
  if (element.brush !== undefined) payload.brush = element.brush;
  Object.assign(payload, brushCatalogIdentity);
  if (element.sampleSpacing !== undefined) payload.sampleSpacing = element.sampleSpacing;
  if (element.blendMode !== undefined) payload.blendMode = element.blendMode;
  payload.gradient = jsonObject(element.gradient);
  payload.pattern = jsonObject(element.pattern);
  payload.brushDynamics = jsonObject(element.brushDynamics);
  payload.brushTip = jsonObject(element.brushTip);
  payload.strokeStyle = jsonObject(element.strokeStyle);
  payload.shapeParams = jsonObject(element.shapeParams);
  payload.symmetry = jsonObject(element.symmetry);
  payload.extensions = extensions;
  return {
    id: element.id,
    pageId,
    layerId: element.groupId ?? "page-root",
    payload,
  };
}

export function studioDrawElementSampleSlice(
  element: StudioCrdtCompatibleDrawElement,
  startSample: number
): StudioCrdtStrokeSamples | null {
  const sampleCount = Math.floor(element.points.length / 2);
  const truncatedStart = Math.trunc(startSample);
  const start = Number.isNaN(truncatedStart)
    ? 0
    : Math.max(0, Math.min(sampleCount, truncatedStart));
  if (start >= sampleCount) return null;
  const pressureFallback = studioInkFallbackPressure(element.pressureModel);
  const pressures = element.pressures === undefined
    && isStudioInkPressureModel(element.pressureModel)
    ? Array<number>(sampleCount - start).fill(pressureFallback)
    : alignedSlice(element.pressures, sampleCount, start, pressureFallback);
  return {
    points: element.points.slice(start * 2, sampleCount * 2),
    pressures,
    tiltXs: alignedSlice(element.tiltXs, sampleCount, start, 0),
    tiltYs: alignedSlice(element.tiltYs, sampleCount, start, 0),
    twists: alignedSlice(element.twists, sampleCount, start, 0),
    speeds: alignedSlice(element.speeds, sampleCount, start, 0),
    tangentialPressures: alignedSlice(element.tangentialPressures, sampleCount, start, 0),
  };
}
