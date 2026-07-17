import { STUDIO_CRDT_STROKE_PAYLOAD_VERSION } from "./studio-crdt-protocol";

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
  fill?: string;
  gradient?: unknown;
  pattern?: unknown;
  brush?: string;
  pressures?: number[];
  sampleSpacing?: number;
  tiltXs?: number[];
  tiltYs?: number[];
  twists?: number[];
  speeds?: number[];
  tangentialPressures?: number[];
  brushDynamics?: unknown;
  brushTip?: unknown;
  stamp?: unknown;
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

function extensionsOf(element: StudioCrdtCompatibleDrawElement): StudioCrdtJsonObject | undefined {
  const extensions: StudioCrdtJsonObject = {};
  for (const key of EXTENSION_KEYS) {
    const normalized = jsonValue(element[key]);
    if (normalized !== undefined) extensions[key] = normalized;
  }
  return Object.keys(extensions).length > 0 ? extensions : undefined;
}

export function studioDrawElementToCrdtStroke(
  pageId: string,
  element: StudioCrdtCompatibleDrawElement
): StudioCrdtStrokeInput {
  const sampleCount = Math.floor(element.points.length / 2);
  const payload: StudioCrdtDrawStrokePayload = {
    version: STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
    type: "draw",
    kind: element.kind ?? "freehand",
    mode: element.mode ?? "pen",
    points: element.points.slice(0, sampleCount * 2),
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
  };
  Object.assign(payload, {
    pressures: aligned(element.pressures, sampleCount, 0.5),
    tiltXs: aligned(element.tiltXs, sampleCount, 0),
    tiltYs: aligned(element.tiltYs, sampleCount, 0),
    twists: aligned(element.twists, sampleCount, 0),
    speeds: aligned(element.speeds, sampleCount, 0),
    tangentialPressures: aligned(element.tangentialPressures, sampleCount, 0),
  });
  if (element.opacity !== undefined) payload.opacity = element.opacity;
  if (element.fill !== undefined) payload.fill = element.fill;
  if (element.brush !== undefined) payload.brush = element.brush;
  if (element.sampleSpacing !== undefined) payload.sampleSpacing = element.sampleSpacing;
  if (element.blendMode !== undefined) payload.blendMode = element.blendMode;
  payload.gradient = jsonObject(element.gradient);
  payload.pattern = jsonObject(element.pattern);
  payload.brushDynamics = jsonObject(element.brushDynamics);
  payload.brushTip = jsonObject(element.brushTip);
  payload.strokeStyle = jsonObject(element.strokeStyle);
  payload.shapeParams = jsonObject(element.shapeParams);
  payload.symmetry = jsonObject(element.symmetry);
  payload.extensions = extensionsOf(element);
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
  const start = Math.max(0, Math.min(sampleCount, Math.trunc(startSample)));
  if (start >= sampleCount) return null;
  return {
    points: element.points.slice(start * 2, sampleCount * 2),
    pressures: aligned(element.pressures, sampleCount, 0.5)?.slice(start),
    tiltXs: aligned(element.tiltXs, sampleCount, 0)?.slice(start),
    tiltYs: aligned(element.tiltYs, sampleCount, 0)?.slice(start),
    twists: aligned(element.twists, sampleCount, 0)?.slice(start),
    speeds: aligned(element.speeds, sampleCount, 0)?.slice(start),
    tangentialPressures: aligned(element.tangentialPressures, sampleCount, 0)?.slice(start),
  };
}
