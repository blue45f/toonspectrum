import {
  STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
  STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
  isStudioCrdtSceneElementType,
  validateStudioCrdtPagePayload,
  validateStudioCrdtSceneElementPayload,
  type StudioCrdtJsonObject,
  type StudioCrdtJsonValue,
  type StudioCrdtSceneElementType,
} from "./studio-crdt-scene-schema";

import type {
  StudioCrdtPageRecord,
  StudioCrdtSceneElementInput,
  StudioCrdtSceneElementRecord,
  StudioCrdtStrokeRecord,
} from "./studio-crdt-document";
import type { StudioCrdtCompatibleDrawElement } from "./studio-crdt-draw-bridge";

export { isStudioCrdtSceneElementType } from "./studio-crdt-scene-schema";
export {
  studioDrawElementSampleSlice,
  studioDrawElementToCrdtStroke,
} from "./studio-crdt-draw-bridge";
export type { StudioCrdtCompatibleDrawElement } from "./studio-crdt-draw-bridge";

export interface StudioCrdtCompatibleElement {
  id: string;
  type: string;
}

export interface StudioCrdtCompatiblePage<TElement extends StudioCrdtCompatibleElement> {
  id: string;
  elements: TElement[];
}

export interface StudioCrdtCompatibleSceneElement extends StudioCrdtCompatibleElement {
  type: StudioCrdtSceneElementType;
  groupId?: string;
  [key: string]: unknown;
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

export function studioSceneElementToCrdtElement(
  pageId: string,
  element: StudioCrdtCompatibleSceneElement
): StudioCrdtSceneElementInput {
  if (!isStudioCrdtSceneElementType(element.type)) {
    throw new Error(`${element.type} 요소는 장면 CRDT에서 지원하지 않습니다.`);
  }
  const propsSource: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(element)) {
    if (key === "id" || key === "type" || value === undefined) continue;
    propsSource[key] = value;
  }
  const props = jsonObject(propsSource) ?? {};
  const payload = validateStudioCrdtSceneElementPayload({
    version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
    type: element.type,
    props,
  });
  return {
    id: element.id,
    pageId,
    layerId: typeof element.groupId === "string" && element.groupId.length > 0
      ? element.groupId
      : "page-root",
    payload,
  };
}

export function studioCrdtElementToSceneElement(
  record: StudioCrdtSceneElementRecord
): StudioCrdtCompatibleSceneElement {
  const element = {
    id: record.id,
    type: record.payload.type,
    ...record.payload.props,
  } as StudioCrdtCompatibleSceneElement;
  if (!element.groupId && record.layerId !== "page-root") element.groupId = record.layerId;
  return element;
}

const PAGE_PAYLOAD_KEYS = [
  "bg",
  "bgGrad",
  "canvasH",
  "name",
  "note",
  "hideMaster",
  "shotType",
  "cameraAngle",
] as const;

export interface StudioCrdtCompatibleOrderedPage<
  TElement extends StudioCrdtCompatibleElement,
> extends StudioCrdtCompatiblePage<TElement> {
  bg: string;
  bgGrad: string[] | null;
  canvasH: number;
  name?: string;
  note?: string;
  hideMaster?: boolean;
  shotType?: string;
  cameraAngle?: string;
}

export function studioPageToCrdtPage<
  TElement extends StudioCrdtCompatibleElement,
>(page: StudioCrdtCompatibleOrderedPage<TElement>) {
  const props: StudioCrdtJsonObject = {
    bg: page.bg,
    bgGrad: page.bgGrad,
    canvasH: page.canvasH,
  };
  for (const key of PAGE_PAYLOAD_KEYS.slice(3)) {
    const normalized = jsonValue(page[key]);
    if (normalized !== undefined) props[key] = normalized;
  }
  return {
    id: page.id,
    payload: validateStudioCrdtPagePayload({
      version: STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
      props,
    }),
  };
}

export interface StudioCrdtPageReconcileResult<TPage> {
  pages: TPage[];
  changed: boolean;
}

export interface StudioCrdtSceneGraphAuthority {
  strokeIds: ReadonlySet<string>;
  sceneElementIds: ReadonlySet<string>;
  pageIds: ReadonlySet<string>;
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

/**
 * Phase-2 scene graph reconciliation. Draw and non-raster objects share the physical legacy
 * `stroke-order` Y.Array, so their `orderIndex` values form one mixed z-order. Only IDs present in
 * the supplied durable records are authoritative; legacy pages/elements remain in their slots.
 */
export function reconcileStudioCrdtSceneGraphPages<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatibleOrderedPage<TElement>,
>(
  pages: readonly TPage[],
  strokes: readonly StudioCrdtStrokeRecord[],
  sceneElements: readonly StudioCrdtSceneElementRecord[],
  pageRecords: readonly StudioCrdtPageRecord[],
  authority?: StudioCrdtSceneGraphAuthority
): StudioCrdtPageReconcileResult<TPage> {
  const sourcePageById = new Map(pages.map((page) => [page.id, page]));
  const materializePage = (record: StudioCrdtPageRecord): TPage => {
    const source = sourcePageById.get(record.id);
    return {
      ...(source ?? { id: record.id, elements: [] }),
      ...record.payload.props,
      id: record.id,
      elements: source?.elements ?? [],
    } as TPage;
  };

  const managedPageIds = new Set<string>();
  const activePages: Array<{ id: string; orderIndex: number; page: TPage }> = [];
  for (const record of pageRecords) {
    const authoritative = authority === undefined || authority.pageIds.has(record.id);
    if (authoritative) {
      managedPageIds.add(record.id);
      if (!record.deleted) {
        activePages.push({ id: record.id, orderIndex: record.orderIndex, page: materializePage(record) });
      }
      continue;
    }
    const source = sourcePageById.get(record.id);
    if (!source) continue;
    managedPageIds.add(record.id);
    activePages.push({ id: record.id, orderIndex: record.orderIndex, page: source });
  }
  activePages.sort(
    (left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id)
  );

  let topologyChanged = false;
  let pageCursor = 0;
  const orderedPages: TPage[] = [];
  for (const page of pages) {
    if (!managedPageIds.has(page.id)) {
      orderedPages.push(page);
      continue;
    }
    const replacement = activePages[pageCursor++];
    if (replacement) orderedPages.push(replacement.page);
    topologyChanged = true;
  }
  while (pageCursor < activePages.length) {
    orderedPages.push(activePages[pageCursor++]!.page);
    topologyChanged = true;
  }

  const sourceElementById = new Map<string, { pageId: string; element: TElement }>();
  for (const page of orderedPages) {
    for (const element of page.elements) sourceElementById.set(element.id, { pageId: page.id, element });
  }
  const managedElementIds = new Set<string>();
  const activeByPage = new Map<string, Array<{
    id: string;
    orderIndex: number;
    element: TElement;
  }>>();
  for (const record of strokes) {
    const authoritative = authority === undefined || authority.strokeIds.has(record.id);
    if (authoritative) managedElementIds.add(record.id);
    const source = sourceElementById.get(record.id);
    if (!authoritative && !source) continue;
    if (!authoritative) managedElementIds.add(record.id);
    if (authoritative && record.deleted) continue;
    const pageId = authoritative ? record.pageId : source!.pageId;
    const bucket = activeByPage.get(pageId) ?? [];
    bucket.push({
      id: record.id,
      orderIndex: record.orderIndex,
      element: authoritative
        ? studioCrdtStrokeToDrawElement(record) as unknown as TElement
        : source!.element,
    });
    activeByPage.set(pageId, bucket);
  }
  for (const record of sceneElements) {
    const authoritative = authority === undefined || authority.sceneElementIds.has(record.id);
    if (authoritative) managedElementIds.add(record.id);
    const source = sourceElementById.get(record.id);
    if (!authoritative && !source) continue;
    if (!authoritative) managedElementIds.add(record.id);
    if (authoritative && record.deleted) continue;
    const pageId = authoritative ? record.pageId : source!.pageId;
    const bucket = activeByPage.get(pageId) ?? [];
    bucket.push({
      id: record.id,
      orderIndex: record.orderIndex,
      element: authoritative
        ? studioCrdtElementToSceneElement(record) as unknown as TElement
        : source!.element,
    });
    activeByPage.set(pageId, bucket);
  }
  for (const bucket of activeByPage.values()) {
    bucket.sort(
      (left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id)
    );
  }

  let elementChanged = false;
  const nextPages = orderedPages.map((page) => {
    const active = activeByPage.get(page.id) ?? [];
    let cursor = 0;
    let pageChanged = false;
    const nextElements: TElement[] = [];
    for (const element of page.elements) {
      if (!managedElementIds.has(element.id)) {
        nextElements.push(element);
        continue;
      }
      const replacement = active[cursor++];
      if (replacement) nextElements.push(replacement.element);
      pageChanged = true;
    }
    while (cursor < active.length) {
      nextElements.push(active[cursor++]!.element);
      pageChanged = true;
    }
    if (!pageChanged) return page;
    elementChanged = true;
    return { ...page, elements: nextElements };
  });

  const changed = topologyChanged || elementChanged;
  return { pages: changed ? nextPages : [...pages], changed };
}
