import {
  isStudioDynamicBrushMinimumDiameterRatio,
  studioDynamicBrushDepositPipelineUsesContinuation,
} from "./studio-brush-dynamics";
import { serializeStudioBrushR8TextureGrainSourceCanonical } from "./studio-brush-r8-grain-asset-contract";
import {
  STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_PAINT_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
} from "./studio-crdt-protocol";
import {
  STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
  STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
  STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
  isStudioCrdtLegacyReferencePayload,
  isStudioCrdtPayloadSceneElementType,
  studioCrdtLayerGroupKey,
  validateStudioCrdtLayerGroupPayload,
  validateStudioCrdtPagePayload,
  validateStudioCrdtSceneElementPayload,
  type StudioCrdtJsonObject,
  type StudioCrdtJsonValue,
  type StudioCrdtPayloadSceneElementType,
} from "./studio-crdt-scene-schema";
import { isStudioInkPressureModel } from "./studio-ink-pressure-model";
import {
  isStudioMaterialMinimumDiameterRatio,
  isStudioMaterialPressureModel,
} from "./studio-material-pressure-model";
import { isStudioStrokePaintModelCompatible } from "./studio-stroke-paint-model";


import type {
  StudioCrdtLayerGroupInput,
  StudioCrdtLayerGroupRecord,
  StudioCrdtPageRecord,
  StudioCrdtSceneElementInput,
  StudioCrdtSceneElementRecord,
  StudioCrdtStrokeRecord,
} from "./studio-crdt-document";
import type { StudioCrdtCompatibleDrawElement } from "./studio-crdt-draw-bridge";
import type { StudioDrawingAssistDocument } from "./studio-drawing-assist-document";

import {
  STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
  STUDIO_WORK_ASSET_TYPES,
  parseStudioWorkAssetSourceUri,
  studioWorkAssetSourceUri,
} from "@/lib/studio-work-asset-contract";

export {
  isStudioCrdtPayloadSceneElementType,
  isStudioCrdtSceneElementType,
} from "./studio-crdt-scene-schema";
export {
  studioDrawElementSampleSlice,
  studioDrawElementToCrdtStroke,
} from "./studio-crdt-draw-bridge";
export type { StudioCrdtCompatibleDrawElement } from "./studio-crdt-draw-bridge";

const STUDIO_WORK_ASSET_TYPE_SET = new Set<string>(STUDIO_WORK_ASSET_TYPES);

export interface StudioCrdtCompatibleElement {
  id: string;
  type: string;
}

export interface StudioCrdtCompatiblePage<TElement extends StudioCrdtCompatibleElement> {
  id: string;
  elements: TElement[];
}

export interface StudioCrdtCompatibleLayerGroup {
  id: string;
  name: string;
  hidden?: boolean;
  locked?: boolean;
  /** Local navigator state. This value is deliberately never serialized into CRDT. */
  collapsed?: boolean;
}

export interface StudioCrdtCompatibleSceneElement extends StudioCrdtCompatibleElement {
  type: StudioCrdtPayloadSceneElementType;
  groupId?: string;
  [key: string]: unknown;
}

export function isStudioCrdtWorkAssetElement(
  element: StudioCrdtCompatibleElement
): boolean {
  return STUDIO_WORK_ASSET_TYPE_SET.has(element.type);
}

export function isStudioCrdtAdmittedWorkAssetElement(
  element: StudioCrdtCompatibleElement
): boolean {
  if (!isStudioCrdtWorkAssetElement(element)) return false;
  const src = (element as StudioCrdtCompatibleElement & { src?: unknown }).src;
  if (typeof src !== "string") return false;
  const reference = parseStudioWorkAssetSourceUri(src);
  return reference?.assetId === element.id && reference.elementType === element.type;
}

const EXTENSION_KEYS = [
  // 스탬프 브러시 튜닝 — draw-bridge 의 쓰기 목록과 짝을 이루는 읽기 목록.
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

function studioElementLayerId(element: StudioCrdtCompatibleElement): string {
  const groupId = (element as StudioCrdtCompatibleElement & { groupId?: unknown }).groupId;
  return typeof groupId === "string" && groupId.length > 0 ? groupId : "page-root";
}

function hasCanonicalRendererSignificantR8Grain(
  brushDynamics: StudioCrdtJsonObject | undefined,
): boolean {
  const grain = brushDynamics?.grain;
  if (!grain || typeof grain !== "object" || Array.isArray(grain)) return false;
  if (!Object.hasOwn(grain, "source") || grain.source == null) return false;
  const source = grain.source;
  const canonical = serializeStudioBrushR8TextureGrainSourceCanonical(source);
  if (canonical === null || canonical !== JSON.stringify(source)) {
    throw new Error("R8 브러시 그레인 자산 참조가 올바르지 않습니다.");
  }
  return true;
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
    brushCatalogId: payload.brushCatalogId,
    brushCatalogName: payload.brushCatalogName,
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
  const pressureModel = extensions.pressureModel;
  if (isStudioInkPressureModel(pressureModel)) result.pressureModel = pressureModel;
  const dynamicMinimumDiameterRatio =
    payload.brushDynamics?.minimumDiameterRatio;
  if (
    dynamicMinimumDiameterRatio !== undefined
    && (
      (
        payload.version !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
        && payload.version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
      )
      || !isStudioDynamicBrushMinimumDiameterRatio(
        dynamicMinimumDiameterRatio,
      )
    )
  ) {
    throw new Error("동적 브러시 최소 굵기 스냅샷이 올바르지 않습니다.");
  }
  if (
    studioDynamicBrushDepositPipelineUsesContinuation(
      payload.brushDynamics?.depositPipeline,
    )
    && payload.version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
  ) {
    throw new Error("분할 연속 브러시 파이프라인과 페이로드 버전이 호환되지 않습니다.");
  }
  if (
    hasCanonicalRendererSignificantR8Grain(payload.brushDynamics)
    && payload.version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
  ) {
    throw new Error("R8 브러시 그레인과 페이로드 버전이 호환되지 않습니다.");
  }
  const materialPressureModel = extensions.materialPressureModel;
  const materialMinimumDiameterRatio =
    extensions.materialMinimumDiameterRatio;
  const hasMaterialPressureSnapshot =
    materialPressureModel !== undefined
    || materialMinimumDiameterRatio !== undefined;
  if (
    hasMaterialPressureSnapshot
    && payload.version !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
    && payload.version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
  ) {
    throw new Error("획 재질 필압 모델과 페이로드 버전이 호환되지 않습니다.");
  }
  if (
    hasMaterialPressureSnapshot
    && !isStudioMaterialPressureModel(materialPressureModel)
  ) {
    throw new Error("획 재질 필압 모델이 올바르지 않습니다.");
  }
  if (
    hasMaterialPressureSnapshot
    && !isStudioMaterialMinimumDiameterRatio(materialMinimumDiameterRatio)
  ) {
    throw new Error("획 재질 최소 굵기 스냅샷이 올바르지 않습니다.");
  }
  if (hasMaterialPressureSnapshot) {
    result.materialPressureModel = materialPressureModel;
    result.materialMinimumDiameterRatio = materialMinimumDiameterRatio;
  }
  const paintModel = extensions.paintModel;
  const paintModelCandidate = { ...result, paintModel };
  if (
    (
      payload.version === STUDIO_CRDT_PAINT_STROKE_PAYLOAD_VERSION
      || payload.version === STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
      || payload.version === STUDIO_CRDT_STROKE_PAYLOAD_VERSION
    )
    && isStudioStrokePaintModelCompatible(paintModelCandidate)
  ) {
    result.paintModel = paintModelCandidate.paintModel;
  }
  if (!result.groupId && record.layerId !== "page-root") result.groupId = record.layerId;
  return result;
}

export function studioSceneElementToCrdtElement(
  pageId: string,
  element: StudioCrdtCompatibleSceneElement
): StudioCrdtSceneElementInput {
  if (!isStudioCrdtPayloadSceneElementType(element.type)) {
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
    layerId: studioElementLayerId(element),
    payload,
  };
}

/**
 * Encodes every non-draw Studio element into the shared scene topology. Rich vector objects keep
 * their field-editable payload; asset-backed and future objects use a wire-only `reference`
 * envelope so large image/VRM/3D sources never enter a realtime operation.
 */
export function studioElementToCrdtSceneElement(
  pageId: string,
  element: StudioCrdtCompatibleElement
): StudioCrdtSceneElementInput {
  if (element.type === "draw") {
    throw new Error("드로우 요소는 획 CRDT로 동기화해야 합니다.");
  }
  if (isStudioCrdtPayloadSceneElementType(element.type)) {
    return studioSceneElementToCrdtElement(
      pageId,
      element as StudioCrdtCompatibleSceneElement
    );
  }
  const props: StudioCrdtJsonObject = { elementType: element.type };
  if (isStudioCrdtAdmittedWorkAssetElement(element)) {
    const source = element as StudioCrdtCompatibleElement & Record<string, unknown>;
    for (const key of STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS) {
      const normalized = jsonValue(source[key]);
      if (normalized !== undefined) props[key] = normalized;
    }
  }
  return {
    id: element.id,
    pageId,
    layerId: studioElementLayerId(element),
    payload: validateStudioCrdtSceneElementPayload({
      version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
      type: "reference",
      props,
    }),
  };
}

export function studioCrdtElementToSceneElement<
  TElement extends StudioCrdtCompatibleElement = StudioCrdtCompatibleSceneElement,
>(
  record: StudioCrdtSceneElementRecord,
  referenceSource?: TElement
): StudioCrdtCompatibleSceneElement | TElement {
  if (record.payload.type === "reference") {
    const elementType = record.payload.props.elementType;
    if (
      !referenceSource || referenceSource.id !== record.id ||
      referenceSource.type !== elementType
    ) {
      throw new Error("참조 장면 요소를 복원할 원본 에셋 요소가 없습니다.");
    }
    const referenceProps = { ...record.payload.props };
    delete referenceProps.elementType;
    const legacyReference = isStudioCrdtLegacyReferencePayload(record.payload);
    const element = {
      ...referenceSource,
      ...referenceProps,
      id: record.id,
      type: elementType,
      ...(!legacyReference ? {
        src: studioWorkAssetSourceUri({
          assetId: record.id,
          elementType: elementType as (typeof STUDIO_WORK_ASSET_TYPES)[number],
        }),
      } : {}),
    } as TElement & { groupId?: string };
    if (record.layerId === "page-root") delete element.groupId;
    else element.groupId = record.layerId;
    return element;
  }
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
  "drawingAssist",
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
  drawingAssist?: StudioDrawingAssistDocument;
  groups?: StudioCrdtCompatibleLayerGroup[];
}

export function studioLayerGroupToCrdtGroup(
  pageId: string,
  group: StudioCrdtCompatibleLayerGroup
): StudioCrdtLayerGroupInput {
  const props: StudioCrdtJsonObject = { name: group.name };
  if (group.hidden !== undefined) props.hidden = group.hidden;
  if (group.locked !== undefined) props.locked = group.locked;
  return {
    id: group.id,
    pageId,
    payload: validateStudioCrdtLayerGroupPayload({
      version: STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
      props,
    }),
  };
}

export function studioCrdtGroupToLayerGroup(
  record: StudioCrdtLayerGroupRecord,
  collapsed?: boolean
): StudioCrdtCompatibleLayerGroup {
  const group: StudioCrdtCompatibleLayerGroup = {
    id: record.id,
    name: record.payload.props.name as string,
  };
  if (typeof record.payload.props.hidden === "boolean") {
    group.hidden = record.payload.props.hidden;
  }
  if (typeof record.payload.props.locked === "boolean") {
    group.locked = record.payload.props.locked;
  }
  if (collapsed !== undefined) group.collapsed = collapsed;
  return group;
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
  layerGroupIds: ReadonlySet<string>;
}

function withConvergedLayerGroup<TElement extends StudioCrdtCompatibleElement>(
  element: TElement,
  pageId: string,
  layerId: string,
  availableGroupKeys: ReadonlySet<string>
): TElement {
  const next = { ...element } as TElement & { groupId?: string };
  let valid: boolean;
  try {
    valid = layerId !== "page-root" &&
      availableGroupKeys.has(studioCrdtLayerGroupKey(pageId, layerId));
  } catch {
    delete next.groupId;
    return next;
  }
  if (valid) {
    next.groupId = layerId;
  } else {
    delete next.groupId;
  }
  return next;
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
  layerGroupRecords: readonly StudioCrdtLayerGroupRecord[] = [],
  authority?: StudioCrdtSceneGraphAuthority,
  referenceSources?: ReadonlyMap<string, TElement>
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

  const pageIdSet = new Set(orderedPages.map((page) => page.id));
  const sourceGroupByKey = new Map<string, {
    pageId: string;
    group: StudioCrdtCompatibleLayerGroup;
  }>();
  for (const page of orderedPages) {
    for (const group of page.groups ?? []) {
      let key: string;
      try {
        key = studioCrdtLayerGroupKey(page.id, group.id);
      } catch {
        continue;
      }
      if (!sourceGroupByKey.has(key)) sourceGroupByKey.set(key, { pageId: page.id, group });
    }
  }
  const managedGroupIds = new Set<string>();
  const activeGroupsByPage = new Map<string, StudioCrdtCompatibleLayerGroup[]>();
  for (const record of layerGroupRecords) {
    let key: string;
    try {
      key = studioCrdtLayerGroupKey(record.pageId, record.id);
    } catch {
      continue;
    }
    const authoritative = authority === undefined || authority.layerGroupIds.has(key);
    if (authoritative) managedGroupIds.add(key);
    const source = sourceGroupByKey.get(key);
    if (!authoritative && !source) continue;
    if (!authoritative) managedGroupIds.add(key);
    if (authoritative && record.deleted) continue;
    const pageId = authoritative ? record.pageId : source!.pageId;
    if (!pageIdSet.has(pageId)) continue;
    const group = authoritative
      ? studioCrdtGroupToLayerGroup(record, source?.group.collapsed)
      : source!.group;
    const bucket = activeGroupsByPage.get(pageId) ?? [];
    bucket.push(group);
    activeGroupsByPage.set(pageId, bucket);
  }

  // Unmanaged legacy groups stay usable until their first real group operation materializes a
  // CRDT record. A managed tombstone or page reparent, however, immediately removes the old slot.
  const availableGroupKeys = new Set<string>();
  for (const [key] of sourceGroupByKey) {
    if (!managedGroupIds.has(key)) availableGroupKeys.add(key);
  }
  for (const [pageId, groups] of activeGroupsByPage) {
    for (const group of groups) availableGroupKeys.add(studioCrdtLayerGroupKey(pageId, group.id));
  }

  // Resolve topology-only asset references from the pre-reconciliation project snapshot. A page
  // tombstone can concurrently win while one of its assets is moved to a surviving page; building
  // this registry from `orderedPages` would discard the only local image/VRM/3D body before the
  // authoritative reference record gets a chance to reparent it.
  const sourceElementById = new Map<string, { pageId: string; element: TElement }>();
  for (const page of pages) {
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
        ? withConvergedLayerGroup(
          studioCrdtStrokeToDrawElement(record) as unknown as TElement,
          record.pageId,
          record.layerId,
          availableGroupKeys
        )
        : source!.element,
    });
    activeByPage.set(pageId, bucket);
  }
  for (const record of sceneElements) {
    const authoritative = authority === undefined || authority.sceneElementIds.has(record.id);
    if (authoritative) managedElementIds.add(record.id);
    const localSource = sourceElementById.get(record.id);
    const expectedReferenceType =
      record.payload.type === "reference" &&
      typeof record.payload.props.elementType === "string"
        ? record.payload.props.elementType
        : null;
    const legacyReference = record.payload.type === "reference" &&
      isStudioCrdtLegacyReferencePayload(record.payload);
    const canonicalLocalSource =
      expectedReferenceType &&
      localSource?.element.id === record.id && localSource.element.type === expectedReferenceType &&
      (legacyReference || (
        STUDIO_WORK_ASSET_TYPE_SET.has(expectedReferenceType) &&
        isStudioCrdtAdmittedWorkAssetElement(localSource.element)
      ))
        ? localSource
        : undefined;
    const hydratedSource = authoritative && expectedReferenceType && !legacyReference
      ? referenceSources?.get(record.id)
      : undefined;
    const exactHydratedSource =
      hydratedSource?.id === record.id &&
      hydratedSource.type === expectedReferenceType
        ? hydratedSource
        : undefined;
    const source = record.payload.type !== "reference"
      ? localSource
      : exactHydratedSource
        ? {
            pageId: record.pageId,
            // Keep rich local-only editing metadata where it exists, but let the admitted server
            // descriptor provide the durable fallback. The exact local stable element may add rich
            // editing metadata, and studioCrdtElementToSceneElement applies realtime reference props
            // last so immutable upload geometry can never reset a collaborator's later move.
            element: {
              ...exactHydratedSource,
              ...(canonicalLocalSource?.element ?? {}),
            } as TElement,
          }
        : canonicalLocalSource;
    if (!authoritative && !source) continue;
    if (!authoritative) managedElementIds.add(record.id);
    if (authoritative && record.deleted) continue;
    if (
      authoritative && record.payload.type === "reference" &&
      (!source || source.element.type !== record.payload.props.elementType)
    ) {
      // A topology-only record cannot invent or replace an asset payload. Keep the ID managed so
      // a mismatched stale snapshot is removed, but fail closed until project hydration supplies
      // the exact authored source object.
      continue;
    }
    const pageId = authoritative ? record.pageId : source!.pageId;
    const bucket = activeByPage.get(pageId) ?? [];
    bucket.push({
      id: record.id,
      orderIndex: record.orderIndex,
      element: authoritative
        ? withConvergedLayerGroup(
          studioCrdtElementToSceneElement(record, source?.element) as TElement,
          record.pageId,
          record.layerId,
          availableGroupKeys
        )
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
  const elementPages = orderedPages.map((page) => {
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

  // Group metadata is authoritative for membership validity even when the element itself was not
  // part of this transaction. This also covers legacy/image/3D elements that are not yet payload-
  // managed by the scene CRDT: a remote group tombstone must not leave an unlocked orphan groupId
  // in an older undo snapshot.
  const membershipPages = elementPages.map((page) => {
    let pageChanged = false;
    const elements = page.elements.map((element) => {
      const groupId = (element as TElement & { groupId?: string }).groupId;
      if (!groupId) return element;
      try {
        if (availableGroupKeys.has(studioCrdtLayerGroupKey(page.id, groupId))) return element;
      } catch {
        // Invalid/reserved legacy group identifiers are normalized to the page root below.
      }
      const next = { ...element } as TElement & { groupId?: string };
      delete next.groupId;
      pageChanged = true;
      return next as TElement;
    });
    if (!pageChanged) return page;
    elementChanged = true;
    return { ...page, elements };
  });

  let groupChanged = false;
  const nextPages = membershipPages.map((page) => {
    const legacy = (page.groups ?? []).filter((group) => {
      try {
        return !managedGroupIds.has(studioCrdtLayerGroupKey(page.id, group.id));
      } catch {
        return false;
      }
    });
    const managed = [...(activeGroupsByPage.get(page.id) ?? [])];
    const firstMemberIndex = new Map<string, number>();
    page.elements.forEach((element, index) => {
      const groupId = (element as TElement & { groupId?: string }).groupId;
      if (groupId && !firstMemberIndex.has(groupId)) firstMemberIndex.set(groupId, index);
    });
    managed.sort((left, right) =>
      (firstMemberIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (firstMemberIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id)
    );
    const groups = [...legacy, ...managed];
    const previousGroups = page.groups ?? [];
    const same = previousGroups.length === groups.length && previousGroups.every((group, index) => {
      const next = groups[index];
      return next !== undefined && group.id === next.id && group.name === next.name &&
        group.hidden === next.hidden && group.locked === next.locked &&
        group.collapsed === next.collapsed;
    });
    if (same) return page;
    groupChanged = true;
    return { ...page, groups };
  });

  const changed = topologyChanged || elementChanged || groupChanged;
  return { pages: changed ? nextPages : [...pages], changed };
}
