import { parseStudioDrawingAssistDocument } from "./studio-drawing-assist-document";

import type { StudioAdvancedRulerDocument } from "./studio-advanced-ruler-document";

import {
  STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS,
  STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
  STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES,
  STUDIO_WORK_ASSET_TYPES,
} from "@/lib/studio-work-asset-contract";

export const STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION = 1 as const;
export const STUDIO_CRDT_SCENE_ELEMENT_MAX_BYTES = 16 * 1024;
export const STUDIO_CRDT_PAGE_PAYLOAD_VERSION = 1 as const;
export const STUDIO_CRDT_PAGE_MAX_BYTES = 8 * 1024;
export const STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION = 1 as const;
export const STUDIO_CRDT_LAYER_GROUP_MAX_BYTES = 2 * 1024;

export const STUDIO_CRDT_PAYLOAD_SCENE_ELEMENT_TYPES = [
  "text",
  "bubble",
  "sticker",
  "frame",
  "focusLines",
  "speedLines",
] as const;

/**
 * `reference` keeps the deployed v1 topology envelope (`elementType` only) readable forever.
 * Server-admitted assets extend the same bounded envelope with placement/filter properties, but
 * legacy documents are never forced through that opt-in storage contract during hydration.
 */
export const STUDIO_CRDT_SCENE_ELEMENT_TYPES = [
  ...STUDIO_CRDT_PAYLOAD_SCENE_ELEMENT_TYPES,
  "reference",
] as const;

export type StudioCrdtPayloadSceneElementType =
  (typeof STUDIO_CRDT_PAYLOAD_SCENE_ELEMENT_TYPES)[number];
export type StudioCrdtSceneElementType = (typeof STUDIO_CRDT_SCENE_ELEMENT_TYPES)[number];
export type StudioCrdtJsonValue =
  | null
  | boolean
  | number
  | string
  | StudioCrdtJsonValue[]
  | { [key: string]: StudioCrdtJsonValue };
export type StudioCrdtJsonObject = { [key: string]: StudioCrdtJsonValue };

export interface StudioCrdtSceneElementPayload {
  version: typeof STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION;
  type: StudioCrdtSceneElementType;
  props: StudioCrdtJsonObject;
}

export interface StudioCrdtPagePayload {
  version: typeof STUDIO_CRDT_PAGE_PAYLOAD_VERSION;
  props: StudioCrdtJsonObject;
}

/**
 * Shared layer-folder metadata. `collapsed` deliberately does not belong to this envelope: it is
 * a per-artist navigator preference and must never make another collaborator's panel jump.
 */
export interface StudioCrdtLayerGroupPayload {
  version: typeof STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION;
  props: StudioCrdtJsonObject;
}

const MAX_COORDINATE = 10_000_000;
const MAX_ID_LENGTH = 160;
const MAX_JSON_DEPTH = 10;
const MAX_JSON_ENTRIES = 4_096;
const MAX_JSON_STRING_LENGTH = 64 * 1024;
const TEXT_ENCODER = new TextEncoder();
const STUDIO_WORK_ASSET_TYPE_SET = new Set<string>(STUDIO_WORK_ASSET_TYPES);

function exactIdentifier(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ID_LENGTH) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

/** Collision-free page-scoped identity shared by the client document and server validator. */
export function studioCrdtLayerGroupKey(pageId: string, groupId: string): string {
  if (!exactIdentifier(pageId)) throw new Error("페이지 식별자가 올바르지 않습니다.");
  if (groupId === "page-root") {
    throw new Error("page-root는 레이어 그룹 식별자로 사용할 수 없습니다.");
  }
  if (!exactIdentifier(groupId)) {
    throw new Error("레이어 그룹 식별자가 올바르지 않습니다.");
  }
  return `${pageId.length}:${pageId}${groupId.length}:${groupId}`;
}

const COMMON_SCENE_ELEMENT_KEYS = [
  "name", "hidden", "locked", "noClip", "opacity", "blendMode", "lockAspect", "groupId",
  "clipBelow", "alphaLocked", "maskSrc", "maskEnabled", "layerRole", "layerColor",
  "emeresSourceId",
] as const;

export const STUDIO_CRDT_SCENE_ELEMENT_KEYS_BY_TYPE: Record<
  StudioCrdtSceneElementType,
  ReadonlySet<string>
> = {
  text: new Set([
    ...COMMON_SCENE_ELEMENT_KEYS,
    "text", "x", "y", "width", "fontSize", "fill", "rotation", "font", "stroke",
    "strokeWidth", "letterSpacing", "lineHeight", "vertical", "align", "fontStyle",
    "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "shadowOpacity",
    "fillType", "gradientColorStart", "gradientColorEnd", "gradientDirection", "gradient",
    "textPath", "skewX", "skewY",
  ]),
  bubble: new Set([
    ...COMMON_SCENE_ELEMENT_KEYS,
    "variant", "text", "x", "y", "width", "height", "fill", "textFill", "rotation",
    "tail", "tailDirection", "extraTails", "font", "fontSize", "lineHeight", "vertical",
    "align", "fontStyle", "tailXRatio", "tailHeight", "tailBase", "tailBend",
    "tailAnchorId", "tailAnchorPoint", "stroke", "strokeWidth", "strokeStyle", "gradient",
    "autoShrinkText", "autoShrinkMinFontSize", "starAmplitude", "shadowColor", "shadowBlur",
    "shadowOffsetX", "shadowOffsetY", "shadowOpacity", "customShapePoints",
  ]),
  sticker: new Set([
    ...COMMON_SCENE_ELEMENT_KEYS,
    "text", "x", "y", "fontSize", "rotation", "skewX", "skewY",
  ]),
  frame: new Set([
    ...COMMON_SCENE_ELEMENT_KEYS,
    "x", "y", "width", "height", "bg", "bgColor", "stroke", "strokeWidth", "dashStyle",
    "storyBeat", "aiProvenance", "points",
  ]),
  focusLines: new Set([
    ...COMMON_SCENE_ELEMENT_KEYS,
    "x", "y", "width", "height", "lineCount", "innerRadius", "outerRadius", "stroke",
    "strokeWidth", "noise", "rotation", "centerXRatio", "centerYRatio",
  ]),
  speedLines: new Set([
    ...COMMON_SCENE_ELEMENT_KEYS,
    "x", "y", "width", "height", "lineCount", "direction", "stroke", "strokeWidth",
    "noise", "rotation",
  ]),
  reference: new Set(["elementType", ...STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS]),
};

export const STUDIO_CRDT_REQUIRED_SCENE_ELEMENT_KEYS: Record<
  StudioCrdtSceneElementType,
  readonly string[]
> = {
  text: ["text", "x", "y", "width", "fontSize", "fill", "rotation"],
  bubble: ["variant", "text", "x", "y", "width", "height", "fill", "textFill", "rotation"],
  sticker: ["text", "x", "y", "fontSize", "rotation"],
  frame: ["x", "y", "width", "height"],
  focusLines: [
    "x", "y", "width", "height", "lineCount", "innerRadius", "outerRadius", "stroke",
    "strokeWidth", "noise", "rotation",
  ],
  speedLines: [
    "x", "y", "width", "height", "lineCount", "direction", "stroke", "strokeWidth",
    "rotation",
  ],
  reference: ["elementType"],
};

export const STUDIO_CRDT_PAGE_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  "bg", "bgGrad", "canvasH", "name", "note", "hideMaster", "shotType", "cameraAngle",
  "drawingAssist",
]);

export const STUDIO_CRDT_LAYER_GROUP_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  "name", "hidden", "locked",
]);

export function isStudioCrdtSceneElementType(
  value: unknown
): value is StudioCrdtSceneElementType {
  return typeof value === "string" &&
    (STUDIO_CRDT_SCENE_ELEMENT_TYPES as readonly string[]).includes(value);
}

export function isStudioCrdtPayloadSceneElementType(
  value: unknown
): value is StudioCrdtPayloadSceneElementType {
  return typeof value === "string" &&
    (STUDIO_CRDT_PAYLOAD_SCENE_ELEMENT_TYPES as readonly string[]).includes(value);
}

function isLegacyStudioCrdtReferenceType(value: unknown): value is string {
  return exactIdentifier(value) && value !== "draw" && !isStudioCrdtSceneElementType(value);
}

export function isStudioCrdtLegacyReferencePayload(
  payload: Pick<StudioCrdtSceneElementPayload, "type" | "props">
): boolean {
  return payload.type === "reference" &&
    Object.keys(payload.props).length === 1 &&
    isLegacyStudioCrdtReferenceType(payload.props.elementType);
}

function cloneJson(
  value: StudioCrdtJsonValue,
  state = { entries: 0 },
  depth = 0
): StudioCrdtJsonValue {
  if (depth > MAX_JSON_DEPTH || ++state.entries > MAX_JSON_ENTRIES) {
    throw new Error("장면 확장 데이터가 허용 범위를 벗어났습니다.");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("장면 확장 데이터에 유한하지 않은 수가 있습니다.");
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING_LENGTH) throw new Error("장면 확장 문자열이 너무 깁니다.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => cloneJson(item, state, depth + 1));
  if (typeof value !== "object") throw new Error("장면 확장 데이터는 JSON 형식이어야 합니다.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("장면 확장 데이터는 일반 JSON 객체여야 합니다.");
  }
  const result: StudioCrdtJsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.length > 512 || key.includes("\0")) {
      throw new Error("장면 확장 데이터 키가 올바르지 않습니다.");
    }
    result[key] = cloneJson(item, state, depth + 1);
  }
  return result;
}

function cloneJsonObject(value: StudioCrdtJsonObject): StudioCrdtJsonObject {
  const cloned = cloneJson(value);
  if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
    throw new Error("장면 확장 데이터는 JSON 객체여야 합니다.");
  }
  return cloned;
}

function copyStudioAdvancedRulerDocument(
  document: StudioAdvancedRulerDocument
): StudioCrdtJsonObject {
  const rulers: StudioCrdtJsonObject[] = document.rulers.map((ruler) => {
    const common: StudioCrdtJsonObject = {
      id: ruler.id,
      type: ruler.type,
      name: ruler.name,
      enabled: ruler.enabled,
      visible: ruler.visible,
      scope: {
        kind: ruler.scope.kind,
        groupId: ruler.scope.groupId,
      },
    };
    if (ruler.type === "curve") {
      return {
        ...common,
        snapMode: ruler.snapMode,
        fixedOffset: ruler.fixedOffset,
        p0: { x: ruler.p0.x, y: ruler.p0.y },
        p1: { x: ruler.p1.x, y: ruler.p1.y },
        p2: { x: ruler.p2.x, y: ruler.p2.y },
        p3: { x: ruler.p3.x, y: ruler.p3.y },
      };
    }
    return {
      ...common,
      guideFamily: ruler.guideFamily,
      centerX: ruler.centerX,
      centerY: ruler.centerY,
      radius: ruler.radius,
      rotationDeg: ruler.rotationDeg,
      fovDeg: ruler.fovDeg,
      strength: ruler.strength,
      outsidePolicy: ruler.outsidePolicy,
    };
  });
  return {
    version: document.version,
    rulers,
    activeSnapRulerId: document.activeSnapRulerId,
    selectedRulerId: document.selectedRulerId,
  };
}

function boundedString(value: unknown, maximum = MAX_JSON_STRING_LENGTH): value is string {
  return typeof value === "string" && value.length <= maximum && !value.includes("\0");
}

function finiteRange(value: unknown, minimum: number, maximum: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} 값이 허용 범위를 벗어났습니다.`);
  }
}

export function validateStudioCrdtSceneElementPayload(
  payload: StudioCrdtSceneElementPayload
): StudioCrdtSceneElementPayload {
  if (
    payload.version !== STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION ||
    !isStudioCrdtSceneElementType(payload.type)
  ) {
    throw new Error("지원하지 않는 장면 요소 페이로드 버전입니다.");
  }
  const props = cloneJsonObject(payload.props);
  const allowedKeys = STUDIO_CRDT_SCENE_ELEMENT_KEYS_BY_TYPE[payload.type];
  for (const key of Object.keys(props)) {
    if (!allowedKeys.has(key)) throw new Error(`${payload.type} 요소의 ${key} 속성은 동기화할 수 없습니다.`);
  }
  for (const key of STUDIO_CRDT_REQUIRED_SCENE_ELEMENT_KEYS[payload.type]) {
    if (!(key in props)) throw new Error(`${payload.type} 요소의 ${key} 속성이 필요합니다.`);
  }
  const legacyReference = isStudioCrdtLegacyReferencePayload({
    type: payload.type,
    props,
  });
  if (payload.type === "reference") {
    if (!isLegacyStudioCrdtReferenceType(props.elementType)) {
      throw new Error("참조 요소의 원본 타입이 올바르지 않습니다.");
    }
    if (!legacyReference) {
      if (!STUDIO_WORK_ASSET_TYPE_SET.has(props.elementType as string)) {
        throw new Error("승인된 참조 요소 타입이 올바르지 않습니다.");
      }
      for (const key of ["x", "y", "width", "height", "rotation"] as const) {
        if (!(key in props)) throw new Error(`reference 요소의 ${key} 속성이 필요합니다.`);
      }
    }
  }
  for (const key of ["x", "y"] as const) {
    if (key in props) finiteRange(props[key], -MAX_COORDINATE, MAX_COORDINATE, key);
  }
  for (const key of ["width", "height", "fontSize", "strokeWidth"] as const) {
    if (key in props) finiteRange(props[key], 0, MAX_COORDINATE, key);
  }
  if (payload.type === "reference" && !legacyReference) {
    finiteRange(props.width, Number.MIN_VALUE, MAX_COORDINATE, "width");
    finiteRange(props.height, Number.MIN_VALUE, MAX_COORDINATE, "height");
  }
  for (const key of [
    "letterSpacing", "lineHeight", "shadowBlur", "shadowOffsetX", "shadowOffsetY",
    "shadowOpacity", "skewX", "skewY", "tailXRatio", "tailHeight", "tailBase", "tailBend",
    "autoShrinkMinFontSize", "starAmplitude", "lineCount", "innerRadius", "outerRadius", "noise",
    "centerXRatio", "centerYRatio",
  ] as const) {
    if (key in props) finiteRange(props[key], -MAX_COORDINATE, MAX_COORDINATE, key);
  }
  if ("rotation" in props) finiteRange(props.rotation, -1_000_000, 1_000_000, "rotation");
  if (payload.type === "reference" && !legacyReference) {
    finiteRange(props.rotation, -360_000, 360_000, "rotation");
  }
  if ("opacity" in props) finiteRange(props.opacity, 0, 1, "opacity");
  for (const key of [
    "hidden", "locked", "noClip", "lockAspect", "clipBelow", "alphaLocked", "maskEnabled",
    "vertical", "autoShrinkText", ...STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS,
  ] as const) {
    if (key in props && typeof props[key] !== "boolean") {
      throw new Error(`장면 요소의 ${key} 값이 올바르지 않습니다.`);
    }
  }
  if (payload.type === "reference") {
    for (const [key, range] of Object.entries(STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES)) {
      if (key in props) finiteRange(props[key], range.minimum, range.maximum, key);
    }
  }
  if ("text" in props && !boundedString(props.text)) {
    throw new Error("장면 요소의 텍스트가 올바르지 않습니다.");
  }
  for (const key of ["fill", "textFill", "stroke", "variant", "direction"] as const) {
    if (key in props && !boundedString(props[key], 512)) {
      throw new Error(`장면 요소의 ${key} 값이 올바르지 않습니다.`);
    }
  }
  const enumValues: Readonly<Record<string, readonly string[]>> = {
    align: ["left", "center", "right"],
    fontStyle: ["normal", "bold", "italic", "bold italic"],
    fillType: ["solid", "gradient"],
    gradientDirection: ["vertical", "horizontal"],
    tail: ["left", "right", "none"],
    tailDirection: ["bottom", "top", "left", "right"],
    dashStyle: ["solid", "dashed"],
    direction: ["horizontal", "vertical"],
  };
  for (const [key, values] of Object.entries(enumValues)) {
    if (key in props && !values.includes(props[key] as string)) {
      throw new Error(`장면 요소의 ${key} 값이 올바르지 않습니다.`);
    }
  }
  if ("lineCount" in props && (!Number.isInteger(props.lineCount) || (props.lineCount as number) < 1)) {
    throw new Error("장면 효과선 개수가 올바르지 않습니다.");
  }
  for (const key of ["points", "customShapePoints"] as const) {
    if (!(key in props)) continue;
    const values = props[key];
    if (!Array.isArray(values) || values.length % 2 !== 0 ||
      (key === "points" ? values.length !== 8 : values.length < 6) ||
      values.some((value) => typeof value !== "number" || !Number.isFinite(value) ||
        Math.abs(value) > MAX_COORDINATE)) {
      throw new Error(`장면 요소의 ${key} 좌표가 올바르지 않습니다.`);
    }
  }
  if (
    TEXT_ENCODER.encode(JSON.stringify({ version: payload.version, type: payload.type, props }))
      .byteLength > STUDIO_CRDT_SCENE_ELEMENT_MAX_BYTES
  ) {
    throw new Error("장면 요소가 실시간 동기화 16KiB 한도를 초과했습니다.");
  }
  return { version: payload.version, type: payload.type, props };
}

export function validateStudioCrdtPagePayload(payload: StudioCrdtPagePayload): StudioCrdtPagePayload {
  if (payload.version !== STUDIO_CRDT_PAGE_PAYLOAD_VERSION) {
    throw new Error("지원하지 않는 페이지 페이로드 버전입니다.");
  }
  const props = cloneJsonObject(payload.props);
  for (const key of Object.keys(props)) {
    if (!STUDIO_CRDT_PAGE_PROPERTY_KEYS.has(key)) {
      throw new Error(`페이지의 ${key} 속성은 동기화할 수 없습니다.`);
    }
  }
  if (!boundedString(props.bg, 512)) throw new Error("페이지 배경이 올바르지 않습니다.");
  finiteRange(props.canvasH, 1, MAX_COORDINATE, "canvasH");
  const bgGrad = props.bgGrad;
  if (bgGrad !== null && (!Array.isArray(bgGrad) || bgGrad.length > 32 ||
    bgGrad.some((color) => !boundedString(color, 512)))) {
    throw new Error("페이지 그라데이션이 올바르지 않습니다.");
  }
  for (const key of ["name", "note", "shotType", "cameraAngle"] as const) {
    if (key in props && !boundedString(props[key], key === "note" ? 8_192 : 512)) {
      throw new Error(`페이지의 ${key} 값이 올바르지 않습니다.`);
    }
  }
  if ("hideMaster" in props && typeof props.hideMaster !== "boolean") {
    throw new Error("페이지 마스터 표시 값이 올바르지 않습니다.");
  }
  if ("drawingAssist" in props) {
    const drawingAssist = parseStudioDrawingAssistDocument(props.drawingAssist);
    if (!drawingAssist) {
      throw new Error("페이지 드로잉 보조 설정이 손상되었거나 지원하지 않는 버전입니다.");
    }
    props.drawingAssist = {
      version: drawingAssist.version,
      perspective: {
        active: drawingAssist.perspective.active,
        points: drawingAssist.perspective.points.map((point) => ({
          id: point.id,
          x: point.x,
          y: point.y,
        })),
      },
      isometric: {
        active: drawingAssist.isometric.active,
        angleDeg: drawingAssist.isometric.angleDeg,
        cellSize: drawingAssist.isometric.cellSize,
        originX: drawingAssist.isometric.originX,
        originY: drawingAssist.isometric.originY,
      },
      advanced: copyStudioAdvancedRulerDocument(drawingAssist.advanced),
    };
  }
  if (TEXT_ENCODER.encode(JSON.stringify({ version: payload.version, props })).byteLength >
    STUDIO_CRDT_PAGE_MAX_BYTES) {
    throw new Error("페이지 정보가 실시간 동기화 8KiB 한도를 초과했습니다.");
  }
  return { version: payload.version, props };
}

export function validateStudioCrdtLayerGroupPayload(
  payload: StudioCrdtLayerGroupPayload
): StudioCrdtLayerGroupPayload {
  if (payload.version !== STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION) {
    throw new Error("지원하지 않는 레이어 그룹 페이로드 버전입니다.");
  }
  const props = cloneJsonObject(payload.props);
  for (const key of Object.keys(props)) {
    if (!STUDIO_CRDT_LAYER_GROUP_PROPERTY_KEYS.has(key)) {
      throw new Error(`레이어 그룹의 ${key} 속성은 동기화할 수 없습니다.`);
    }
  }
  if (
    !boundedString(props.name, 512) || props.name.length === 0 ||
    [...props.name].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    })
  ) {
    throw new Error("레이어 그룹 이름이 올바르지 않습니다.");
  }
  for (const key of ["hidden", "locked"] as const) {
    if (key in props && typeof props[key] !== "boolean") {
      throw new Error(`레이어 그룹의 ${key} 값이 올바르지 않습니다.`);
    }
  }
  if (
    TEXT_ENCODER.encode(JSON.stringify({ version: payload.version, props })).byteLength >
    STUDIO_CRDT_LAYER_GROUP_MAX_BYTES
  ) {
    throw new Error("레이어 그룹 정보가 실시간 동기화 2KiB 한도를 초과했습니다.");
  }
  return { version: payload.version, props };
}
