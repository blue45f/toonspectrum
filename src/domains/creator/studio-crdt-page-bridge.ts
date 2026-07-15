import { STUDIO_CRDT_STROKE_PAYLOAD_VERSION } from "./studio-crdt-protocol";

import type {
  StudioCrdtDrawStrokePayload,
  StudioCrdtJsonObject,
  StudioCrdtJsonValue,
  StudioCrdtStrokeInput,
  StudioCrdtStrokeRecord,
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

export interface StudioCrdtCompatibleElement {
  id: string;
  type: string;
}

export interface StudioCrdtCompatiblePage<TElement extends StudioCrdtCompatibleElement> {
  id: string;
  elements: TElement[];
}

const EXTENSION_KEYS = [
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
  const optionalNumbers = {
    pressures: aligned(element.pressures, sampleCount, 0.5),
    tiltXs: aligned(element.tiltXs, sampleCount, 0),
    tiltYs: aligned(element.tiltYs, sampleCount, 0),
    twists: aligned(element.twists, sampleCount, 0),
    speeds: aligned(element.speeds, sampleCount, 0),
    tangentialPressures: aligned(element.tangentialPressures, sampleCount, 0),
  };
  Object.assign(payload, optionalNumbers);
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

export function studioCrdtStrokeToDrawElement(
  record: StudioCrdtStrokeRecord
): StudioCrdtCompatibleDrawElement {
  const payload = record.payload;
  const extensions = payload.extensions ?? {};
  const result: StudioCrdtCompatibleDrawElement = {
    id: record.id,
    type: "draw",
    kind: payload.kind,
    mode: payload.mode,
    points: [...payload.points],
    stroke: payload.stroke,
    strokeWidth: payload.strokeWidth,
    pressures: payload.pressures ? [...payload.pressures] : undefined,
    tiltXs: payload.tiltXs ? [...payload.tiltXs] : undefined,
    tiltYs: payload.tiltYs ? [...payload.tiltYs] : undefined,
    twists: payload.twists ? [...payload.twists] : undefined,
    speeds: payload.speeds ? [...payload.speeds] : undefined,
    tangentialPressures: payload.tangentialPressures
      ? [...payload.tangentialPressures]
      : undefined,
    opacity: payload.opacity,
    fill: payload.fill,
    gradient: payload.gradient,
    pattern: payload.pattern,
    brush: payload.brush,
    sampleSpacing: payload.sampleSpacing,
    brushDynamics: payload.brushDynamics,
    brushTip: payload.brushTip,
    strokeStyle: payload.strokeStyle,
    shapeParams: payload.shapeParams,
    symmetry: payload.symmetry,
    blendMode: payload.blendMode,
  };
  for (const key of EXTENSION_KEYS) {
    const value = extensions[key];
    if (value !== undefined) Object.assign(result, { [key]: value });
  }
  if (!result.groupId && record.layerId !== "page-root") result.groupId = record.layerId;
  return result;
}

export interface StudioCrdtPageReconcileResult<TPage> {
  pages: TPage[];
  changed: boolean;
}

/**
 * Replaces only IDs owned by the CRDT document. Legacy/non-drawing elements remain untouched.
 * Existing CRDT slots are filled in deterministic Yjs order so eraser/pen compositing converges,
 * while non-CRDT layer positions are preserved as far as the existing slot count permits.
 */
export function reconcileStudioCrdtPages<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatiblePage<TElement>,
>(pages: readonly TPage[], records: readonly StudioCrdtStrokeRecord[]): StudioCrdtPageReconcileResult<TPage> {
  const managedIds = new Set(records.map((record) => record.id));
  const activeByPage = new Map<string, StudioCrdtStrokeRecord[]>();
  for (const record of records) {
    if (record.deleted) continue;
    const bucket = activeByPage.get(record.pageId) ?? [];
    bucket.push(record);
    activeByPage.set(record.pageId, bucket);
  }
  let changed = false;
  const nextPages = pages.map((page) => {
    const active = activeByPage.get(page.id) ?? [];
    let cursor = 0;
    const nextElements: TElement[] = [];
    for (const element of page.elements) {
      if (!managedIds.has(element.id)) {
        nextElements.push(element);
        continue;
      }
      const replacement = active[cursor++];
      if (replacement) {
        nextElements.push(studioCrdtStrokeToDrawElement(replacement) as unknown as TElement);
      }
      changed = true;
    }
    while (cursor < active.length) {
      nextElements.push(
        studioCrdtStrokeToDrawElement(active[cursor++]!) as unknown as TElement
      );
      changed = true;
    }
    return changed ? { ...page, elements: nextElements } : page;
  });
  return { pages: changed ? nextPages : [...pages], changed };
}
