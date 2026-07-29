import * as Y from "yjs";

import {
  normalizeStudioBrushR8TextureGrainSource,
  serializeStudioBrushR8TextureGrainSourceCanonical,
} from "../../../../../lib/studio-brush-r8-grain-asset-contract";
import { hasValidStudioCrdtRasterDocument } from "../../../../../lib/studio-crdt-raster-document-contract";
import {
  STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS,
  STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
  STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES,
  STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS,
  STUDIO_WORK_ASSET_TYPES,
  StudioWorkAssetElementSchema,
  parseStudioWorkAssetStructuredEditValue,
  studioWorkAssetReferenceKey,
} from "../../../../../lib/studio-work-asset-contract";

import type { StudioBrushR8TextureGrainSource } from "../../../../../lib/studio-brush-r8-grain-asset-contract";
import type { StudioWorkAssetReference } from "../../../../../lib/studio-work-asset-contract";

export const STUDIO_CRDT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STUDIO_CRDT_STROKE_SAMPLE_MAX_COUNT = 100_000;
const STUDIO_CRDT_STROKE_SAMPLE_KEYS = [
  "points",
  "pressures",
  "tiltXs",
  "tiltYs",
  "twists",
  "speeds",
  "tangentialPressures",
] as const;
const STUDIO_CRDT_STROKE_JSON_KEYS = [
  "gradient",
  "pattern",
  "brushDynamics",
  "brushTip",
  "strokeStyle",
  "shapeParams",
  "symmetry",
  "extensions",
] as const;
const STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS = {
  fill: 512,
  brush: 512,
  blendMode: 512,
  brushCatalogId: 160,
  brushCatalogName: 120,
} as const;
const STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS = Object.keys(
  STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS
) as Array<keyof typeof STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS>;
const STUDIO_CRDT_STROKE_RECORD_KEYS = new Set([
  "id",
  "pageId",
  "layerId",
  "status",
  "deleted",
  "payloadVersion",
  "type",
  "kind",
  "mode",
  "stroke",
  "strokeWidth",
  "opacity",
  "sampleSpacing",
  ...STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS,
  ...STUDIO_CRDT_STROKE_JSON_KEYS,
  ...STUDIO_CRDT_STROKE_SAMPLE_KEYS,
]);
const STUDIO_CRDT_STROKE_METADATA_MAX_BYTES = 16 * 1_024;
const STUDIO_CRDT_STROKE_WIDTH_MAX = 8_192;
const STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION = 1;
const STUDIO_CRDT_LAYERED_FLOW_STROKE_PAYLOAD_VERSION = 2;
const STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION = 3;
const STUDIO_CRDT_STROKE_PAYLOAD_VERSION = 4;
const STUDIO_CRDT_LAYERED_FLOW_PAINT_MODEL = "layered-flow-v1";
const STUDIO_CRDT_BOUNDED_FLOW_PAINT_MODEL = "bounded-flow-v2";
const STUDIO_CRDT_MATERIAL_PRESSURE_MODEL = "canonical-material-v1";
const STUDIO_CRDT_SEGMENTED_CAUSAL_DEPOSIT_PIPELINE =
  "causal-deposit-v3-segmented";
const STUDIO_CRDT_CAUSAL_PRESSURE_MODELS = new Set([
  "linear-full-v1",
  "linear-residual-v2",
  "linear-residual-path-v3",
]);
const STUDIO_CRDT_LAYERED_FLOW_COMPATIBLE_BRUSH_IDS = new Set([
  "pen",
  "fineliner",
  "ballpoint",
  "technical-pen",
  "marker",
  "felt-tip",
  "marker-bold",
  "alcohol-marker",
]);
const STUDIO_CRDT_KNOWN_INCOMPATIBLE_LAYERED_FLOW_BRUSH_IDS = new Set([
  "pixel-grid-v1",
  "gpen",
  "liner",
  "mapping-pen",
  "kaburapen",
  "ink-brush",
  "airbrush-fine",
  "pencil-grain",
  "wash-brush",
  "calligraphy",
  "brush-pen",
  "perfect-ink",
  "perfect-marker",
  "highlighter",
  "chisel-highlighter",
  "pastel-highlighter",
  "neon",
  "glow",
  "soft-glow",
  "glitter",
  "star-dust",
  "sparkle-star",
  "brush",
  "flat-brush",
  "watercolor",
  "ink-wash",
  "gouache",
  "oil",
  "acrylic",
  "pastel",
  "oil-pastel",
  "ink-particle",
  "airbrush",
  "spray",
  "splatter",
  "soft-brush",
  "dry-media",
  "crayon",
  "chalk",
  "charcoal",
  "pencil",
  "soft-pencil",
  "pencil-2b",
  "pencil-6b",
  "colored-pencil",
  "screentone",
  "crosshatch",
]);
const STUDIO_CRDT_BOUNDED_FLOW_DYNAMIC_BRUSH_IDS = new Set([
  "ink-particle",
  "airbrush",
  "dry-media",
  "soft-brush",
  "spray",
  "splatter",
  "crayon",
  "chalk",
  "charcoal",
]);
const STUDIO_CRDT_SCENE_INDEX_ROOT = "scene-elements";
const STUDIO_CRDT_PAGE_INDEX_ROOT = "studio-pages";
const STUDIO_CRDT_LAYER_GROUP_INDEX_ROOT = "layer-groups";
const STUDIO_CRDT_SCENE_ROOT_PREFIX = "scene-element:";
const STUDIO_CRDT_PAGE_ROOT_PREFIX = "studio-page:";
const STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX = "layer-group:";
const STUDIO_CRDT_PAGE_ORDER_ROOT = "page-order";
const STUDIO_CRDT_DELETION_OPS_ROOT = "studio-deletion-ops";
const STUDIO_CRDT_DELETION_ACKS_ROOT = "studio-deletion-acks";
const STUDIO_CRDT_PROPERTY_PREFIXES = ["base:", "prop:", "unset:"] as const;
const STUDIO_CRDT_SCENE_PAYLOAD_MAX_BYTES = 16 * 1_024;
const STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES = 8 * 1_024;
const STUDIO_CRDT_LAYER_GROUP_PAYLOAD_MAX_BYTES = 2 * 1_024;
const STUDIO_CRDT_COLLECTION_MAX_ENTRIES = 100_000;
const STUDIO_CRDT_LAYER_GROUP_MAX_ENTRIES = 4_096;
const STUDIO_CRDT_ACTIVE_ORDER_ENTRY_MAX_COUNT = 256;
const STUDIO_CRDT_JSON_MAX_DEPTH = 10;
const STUDIO_CRDT_JSON_MAX_ENTRIES = 4_096;
const STUDIO_CRDT_JSON_MAX_STRING_LENGTH = 64 * 1_024;
const STUDIO_CRDT_MAX_COORDINATE = 10_000_000;
const STUDIO_CRDT_DRAWING_ASSIST_LEGACY_VERSION = 1;
const STUDIO_CRDT_DRAWING_ASSIST_VERSION = 2;
const STUDIO_CRDT_DRAWING_ASSIST_MAX_VANISHING_POINTS = 3;
const STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MIN_DEG = 1;
const STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MAX_DEG = 89;
const STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MIN = 8;
const STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MAX = 200;
const STUDIO_CRDT_ADVANCED_RULER_VERSION = 1;
const STUDIO_CRDT_ADVANCED_RULER_MAX_COUNT = 12;
const STUDIO_CRDT_ADVANCED_RULER_MAX_BYTES = 6 * 1_024;
const STUDIO_CRDT_ADVANCED_RULER_MAX_NAME_LENGTH = 80;
const STUDIO_CRDT_ADVANCED_RULER_MAX_OFFSET = 1_000_000;
const STUDIO_CRDT_ADVANCED_RULER_MIN_CONTROL_POLYGON_LENGTH = 1e-6;
const STUDIO_CRDT_DELETION_TARGET_MAX_LENGTH = 384;
const STUDIO_CRDT_TEXT_ENCODER = new TextEncoder();
const STUDIO_WORK_ASSET_TYPE_SET = new Set<string>(STUDIO_WORK_ASSET_TYPES);
const STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEY_SET = new Set<string>(
  STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS
);
const STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEY_SET = new Set<string>(
  STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS
);

type StudioCrdtDeletionTarget =
  | { kind: "stroke"; id: string }
  | { kind: "scene"; id: string }
  | { kind: "page"; id: string }
  | { kind: "group"; pageId: string; id: string };

const STUDIO_CRDT_COMMON_SCENE_KEYS = [
  "name",
  "hidden",
  "locked",
  "noClip",
  "opacity",
  "blendMode",
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

const STUDIO_CRDT_SCENE_KEYS_BY_TYPE = {
  text: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "text", "x", "y", "width", "fontSize", "fill", "rotation", "font", "stroke",
    "strokeWidth", "letterSpacing", "lineHeight", "vertical", "align", "fontStyle",
    "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "shadowOpacity",
    "fillType", "gradientColorStart", "gradientColorEnd", "gradientDirection", "gradient",
    "textPath", "skewX", "skewY",
  ]),
  bubble: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "variant", "text", "x", "y", "width", "height", "fill", "textFill", "rotation",
    "tail", "tailDirection", "extraTails", "font", "fontSize", "lineHeight", "vertical",
    "align", "fontStyle", "tailXRatio", "tailHeight", "tailBase", "tailBend",
    "tailAnchorId", "tailAnchorPoint", "stroke", "strokeWidth", "strokeStyle", "gradient",
    "autoShrinkText", "autoShrinkMinFontSize", "starAmplitude", "shadowColor", "shadowBlur",
    "shadowOffsetX", "shadowOffsetY", "shadowOpacity", "customShapePoints",
  ]),
  sticker: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "text", "x", "y", "fontSize", "rotation", "skewX", "skewY",
  ]),
  frame: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "x", "y", "width", "height", "bg", "bgColor", "stroke", "strokeWidth", "dashStyle",
    "storyBeat", "aiProvenance", "points",
  ]),
  focusLines: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "x", "y", "width", "height", "lineCount", "innerRadius", "outerRadius", "stroke",
    "strokeWidth", "noise", "rotation", "centerXRatio", "centerYRatio",
  ]),
  speedLines: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "x", "y", "width", "height", "lineCount", "direction", "stroke", "strokeWidth",
    "noise", "rotation",
  ]),
  // Wire-only topology and bounded edit state for admitted image/VRM/3D bodies. Source bytes stay
  // in work-scoped private storage; this record owns placement, filters, page/layer, and tombstone.
  reference: new Set(["elementType", ...STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS]),
} as const;

type StudioCrdtSceneType = keyof typeof STUDIO_CRDT_SCENE_KEYS_BY_TYPE;

const STUDIO_CRDT_REQUIRED_SCENE_KEYS: Record<StudioCrdtSceneType, readonly string[]> = {
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

const STUDIO_CRDT_PAGE_KEYS = new Set([
  "bg",
  "bgGrad",
  "canvasH",
  "name",
  "note",
  "hideMaster",
  "shotType",
  "cameraAngle",
  "drawingAssist",
]);

const STUDIO_CRDT_LAYER_GROUP_KEYS = new Set(["name", "hidden", "locked"]);

export function isBoundedStudioCrdtId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 160) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return false;
  }
  return true;
}

function hasOnlyKeys(value: Y.Map<unknown>, allowed: ReadonlySet<string>): boolean {
  for (const key of value.keys()) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function materializeExistingMapRoot(
  doc: Y.Doc,
  rootName: string
): Y.Map<unknown> | null | undefined {
  if (!doc.share.has(rootName)) return undefined;
  try {
    return doc.getMap<unknown>(rootName);
  } catch {
    return null;
  }
}

function materializeExistingArrayRoot(
  doc: Y.Doc,
  rootName: string
): Y.Array<unknown> | null | undefined {
  if (!doc.share.has(rootName)) return undefined;
  try {
    return doc.getArray<unknown>(rootName);
  } catch {
    return null;
  }
}

function isBoundedJsonValue(
  value: unknown,
  state = { entries: 0, seen: new WeakSet<object>() },
  depth = 0
): boolean {
  if (depth > STUDIO_CRDT_JSON_MAX_DEPTH || ++state.entries > STUDIO_CRDT_JSON_MAX_ENTRIES) {
    return false;
  }
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    return value.length <= STUDIO_CRDT_JSON_MAX_STRING_LENGTH && !value.includes("\0");
  }
  if (typeof value !== "object" || value instanceof Y.AbstractType || state.seen.has(value)) {
    return false;
  }
  state.seen.add(value);
  if (Array.isArray(value)) {
    return value.every((item) => isBoundedJsonValue(item, state, depth + 1));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const [key, item] of Object.entries(value)) {
    if (
      key.length === 0 ||
      key.length > 512 ||
      key.includes("\0") ||
      !isBoundedJsonValue(item, state, depth + 1)
    ) {
      return false;
    }
  }
  return true;
}

function encodedJsonByteLength(value: unknown): number | null {
  try {
    return STUDIO_CRDT_TEXT_ENCODER.encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function finiteNumberInRange(value: unknown, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum && !value.includes("\0");
}

function boundedExactText(value: unknown, maximum: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return false;
  }
  return true;
}

function isExactJsonObject(
  value: unknown,
  requiredKeys: ReadonlySet<string>
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  return keys.length === requiredKeys.size && keys.every((key) => requiredKeys.has(key));
}

const STUDIO_CRDT_DRAWING_ASSIST_LEGACY_KEYS = new Set([
  "version",
  "perspective",
  "isometric",
]);
const STUDIO_CRDT_DRAWING_ASSIST_KEYS = new Set([
  "version",
  "perspective",
  "isometric",
  "advanced",
]);
const STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS_LEGACY = new Set(["active", "points"]);
/** Canonical: independent eye-level horizon + optional VP horizon lock (CSP-class). */
const STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS = new Set([
  "active",
  "points",
  "eyeLevelY",
  "lockHorizon",
]);
const STUDIO_CRDT_VANISHING_POINT_KEYS = new Set(["id", "x", "y"]);
const STUDIO_CRDT_ISOMETRIC_ASSIST_KEYS = new Set([
  "active",
  "angleDeg",
  "cellSize",
  "originX",
  "originY",
]);
const STUDIO_CRDT_ADVANCED_RULER_KEYS = new Set([
  "version",
  "rulers",
  "activeSnapRulerId",
  "selectedRulerId",
]);
const STUDIO_CRDT_ADVANCED_RULER_SCOPE_KEYS = new Set(["kind", "groupId"]);
const STUDIO_CRDT_ADVANCED_RULER_POINT_KEYS = new Set(["x", "y"]);
const STUDIO_CRDT_ADVANCED_CURVE_RULER_KEYS = new Set([
  "id",
  "type",
  "name",
  "enabled",
  "visible",
  "scope",
  "snapMode",
  "fixedOffset",
  "p0",
  "p1",
  "p2",
  "p3",
]);
const STUDIO_CRDT_ADVANCED_FISHEYE_RULER_KEYS = new Set([
  "id",
  "type",
  "name",
  "enabled",
  "visible",
  "scope",
  "guideFamily",
  "centerX",
  "centerY",
  "radius",
  "rotationDeg",
  "fovDeg",
  "strength",
  "outsidePolicy",
]);

function isValidStudioCrdtAdvancedRulerScope(value: unknown): boolean {
  if (!isExactJsonObject(value, STUDIO_CRDT_ADVANCED_RULER_SCOPE_KEYS)) return false;
  return (value.kind === "page" && value.groupId === null) ||
    (value.kind === "group" && isBoundedStudioCrdtId(value.groupId));
}

function isValidStudioCrdtAdvancedRulerPoint(value: unknown): value is {
  x: number;
  y: number;
} {
  return isExactJsonObject(value, STUDIO_CRDT_ADVANCED_RULER_POINT_KEYS) &&
    finiteNumberInRange(value.x, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE) &&
    finiteNumberInRange(value.y, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE);
}

function hasValidStudioCrdtAdvancedRulerBase(value: Record<string, unknown>): boolean {
  return isBoundedStudioCrdtId(value.id) &&
    boundedExactText(value.name, STUDIO_CRDT_ADVANCED_RULER_MAX_NAME_LENGTH) &&
    typeof value.enabled === "boolean" &&
    typeof value.visible === "boolean" &&
    isValidStudioCrdtAdvancedRulerScope(value.scope);
}

function isValidStudioCrdtAdvancedCurveRuler(value: unknown): value is Record<string, unknown> {
  if (
    !isExactJsonObject(value, STUDIO_CRDT_ADVANCED_CURVE_RULER_KEYS) ||
    value.type !== "curve" ||
    !hasValidStudioCrdtAdvancedRulerBase(value) ||
    !["through-start", "on-curve", "fixed"].includes(value.snapMode as string) ||
    !finiteNumberInRange(
      value.fixedOffset,
      -STUDIO_CRDT_ADVANCED_RULER_MAX_OFFSET,
      STUDIO_CRDT_ADVANCED_RULER_MAX_OFFSET
    ) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p0) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p1) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p2) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p3)
  ) {
    return false;
  }
  const controlPolygonLength = Math.hypot(value.p1.x - value.p0.x, value.p1.y - value.p0.y) +
    Math.hypot(value.p2.x - value.p1.x, value.p2.y - value.p1.y) +
    Math.hypot(value.p3.x - value.p2.x, value.p3.y - value.p2.y);
  return controlPolygonLength >= STUDIO_CRDT_ADVANCED_RULER_MIN_CONTROL_POLYGON_LENGTH;
}

function isValidStudioCrdtAdvancedFisheyeRuler(value: unknown): value is Record<string, unknown> {
  return isExactJsonObject(value, STUDIO_CRDT_ADVANCED_FISHEYE_RULER_KEYS) &&
    value.type === "fisheye" &&
    hasValidStudioCrdtAdvancedRulerBase(value) &&
    ["auto", "radial", "spherical"].includes(value.guideFamily as string) &&
    finiteNumberInRange(
      value.centerX,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    ) &&
    finiteNumberInRange(
      value.centerY,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    ) &&
    finiteNumberInRange(value.radius, 8, STUDIO_CRDT_MAX_COORDINATE) &&
    finiteNumberInRange(value.rotationDeg, 0, 360) &&
    value.rotationDeg !== 360 &&
    finiteNumberInRange(value.fovDeg, 30, 220) &&
    finiteNumberInRange(value.strength, 0.25, 4) &&
    ["reject", "clamp", "passthrough"].includes(value.outsidePolicy as string);
}

function isValidStudioCrdtAdvancedRulerDocument(value: unknown): value is Record<string, unknown> {
  if (
    !isExactJsonObject(value, STUDIO_CRDT_ADVANCED_RULER_KEYS) ||
    value.version !== STUDIO_CRDT_ADVANCED_RULER_VERSION ||
    !Array.isArray(value.rulers) ||
    value.rulers.length > STUDIO_CRDT_ADVANCED_RULER_MAX_COUNT
  ) {
    return false;
  }
  const ids = new Set<string>();
  const enabledIds = new Set<string>();
  for (const ruler of value.rulers) {
    if (
      (!isValidStudioCrdtAdvancedCurveRuler(ruler) &&
        !isValidStudioCrdtAdvancedFisheyeRuler(ruler)) ||
      ids.has(ruler.id as string)
    ) {
      return false;
    }
    ids.add(ruler.id as string);
    if (ruler.enabled === true) enabledIds.add(ruler.id as string);
  }
  if (
    value.activeSnapRulerId !== null &&
    (!isBoundedStudioCrdtId(value.activeSnapRulerId) ||
      !enabledIds.has(value.activeSnapRulerId))
  ) {
    return false;
  }
  if (
    value.selectedRulerId !== null &&
    (!isBoundedStudioCrdtId(value.selectedRulerId) || !ids.has(value.selectedRulerId))
  ) {
    return false;
  }
  const byteLength = encodedJsonByteLength(value);
  return byteLength !== null && byteLength <= STUDIO_CRDT_ADVANCED_RULER_MAX_BYTES;
}

function isValidStudioCrdtDrawingAssist(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const version = (value as Record<string, unknown>).version;
  const expectedKeys = version === STUDIO_CRDT_DRAWING_ASSIST_LEGACY_VERSION
    ? STUDIO_CRDT_DRAWING_ASSIST_LEGACY_KEYS
    : version === STUDIO_CRDT_DRAWING_ASSIST_VERSION
      ? STUDIO_CRDT_DRAWING_ASSIST_KEYS
      : null;
  if (!expectedKeys || !isExactJsonObject(value, expectedKeys)) return false;
  const { perspective, isometric } = value;
  const perspectiveKeysOk = isExactJsonObject(perspective, STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS)
    || isExactJsonObject(perspective, STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS_LEGACY);
  if (
    !perspectiveKeysOk ||
    !isExactJsonObject(isometric, STUDIO_CRDT_ISOMETRIC_ASSIST_KEYS) ||
    typeof perspective.active !== "boolean" ||
    typeof isometric.active !== "boolean" ||
    (perspective.active && isometric.active) ||
    !Array.isArray(perspective.points) ||
    perspective.points.length > STUDIO_CRDT_DRAWING_ASSIST_MAX_VANISHING_POINTS ||
    !finiteNumberInRange(
      isometric.angleDeg,
      STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MIN_DEG,
      STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MAX_DEG
    ) ||
    !finiteNumberInRange(
      isometric.cellSize,
      STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MIN,
      STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MAX
    ) ||
    !finiteNumberInRange(
      isometric.originX,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    ) ||
    !finiteNumberInRange(
      isometric.originY,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    )
  ) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(perspective, "eyeLevelY")) {
    const eyeLevelY = (perspective as { eyeLevelY: unknown }).eyeLevelY;
    if (
      eyeLevelY !== null
      && !finiteNumberInRange(eyeLevelY, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE)
    ) {
      return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(perspective, "lockHorizon")) {
    if (typeof (perspective as { lockHorizon: unknown }).lockHorizon !== "boolean") {
      return false;
    }
  }

  const pointIds = new Set<string>();
  for (const point of perspective.points) {
    if (
      !isExactJsonObject(point, STUDIO_CRDT_VANISHING_POINT_KEYS) ||
      !isBoundedStudioCrdtId(point.id) ||
      pointIds.has(point.id) ||
      !finiteNumberInRange(point.x, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE) ||
      !finiteNumberInRange(point.y, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE)
    ) {
      return false;
    }
    pointIds.add(point.id);
  }
  if (value.version === STUDIO_CRDT_DRAWING_ASSIST_VERSION) {
    if (!isValidStudioCrdtAdvancedRulerDocument(value.advanced)) return false;
    if (
      value.advanced.activeSnapRulerId !== null &&
      (perspective.active || isometric.active)
    ) {
      return false;
    }
  }
  const byteLength = encodedJsonByteLength(value);
  return byteLength !== null && byteLength <= STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES;
}

function isValidStudioWorkAssetReferenceCandidate(
  property: string,
  value: unknown
): boolean {
  if (property === "elementType") {
    return isValidLegacyStudioCrdtReferenceType(value);
  }
  if (property === "x" || property === "y") {
    return finiteNumberInRange(value, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE);
  }
  if (property === "width" || property === "height") {
    return finiteNumberInRange(value, Number.MIN_VALUE, STUDIO_CRDT_MAX_COORDINATE);
  }
  if (property === "rotation") return finiteNumberInRange(value, -360_000, 360_000);
  if (property === "opacity") return finiteNumberInRange(value, 0, 1);
  if (STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEY_SET.has(property)) return typeof value === "boolean";
  if (STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEY_SET.has(property)) {
    try {
      parseStudioWorkAssetStructuredEditValue(
        property as (typeof STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS)[number],
        value
      );
      return true;
    } catch {
      return false;
    }
  }
  const range = STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES[
    property as keyof typeof STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES
  ];
  return Boolean(range && finiteNumberInRange(value, range.minimum, range.maximum));
}

function isValidLegacyStudioCrdtReferenceType(value: unknown): value is string {
  return boundedExactText(value, 160) && value !== "draw" && !isStudioCrdtSceneType(value);
}

function hasLegacyStudioCrdtReferenceProps(
  props: Record<string, unknown>
): boolean {
  return Object.keys(props).length === 1 &&
    isValidLegacyStudioCrdtReferenceType(props.elementType);
}

function hasValidStudioWorkAssetReferenceProps(
  id: string,
  props: Record<string, unknown>
): boolean {
  if (hasLegacyStudioCrdtReferenceProps(props)) return true;
  const { elementType, ...editProps } = props;
  return typeof elementType === "string" && STUDIO_WORK_ASSET_TYPE_SET.has(elementType) &&
    StudioWorkAssetElementSchema.safeParse({
      id,
      type: elementType,
      ...editProps,
    }).success;
}

function isStudioCrdtSceneType(value: unknown): value is StudioCrdtSceneType {
  return typeof value === "string" && Object.hasOwn(STUDIO_CRDT_SCENE_KEYS_BY_TYPE, value);
}

function readReservedProperties(
  record: Y.Map<unknown>,
  allowedProperties: ReadonlySet<string>,
  metadataKeys: ReadonlySet<string>
): Record<string, unknown> | null {
  const baseline: Record<string, unknown> = {};
  const properties: Record<string, unknown> = {};
  const unset = new Set<string>();
  for (const [key, value] of record) {
    if (metadataKeys.has(key)) continue;
    const prefix = STUDIO_CRDT_PROPERTY_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (!prefix) return null;
    const property = key.slice(prefix.length);
    if (!allowedProperties.has(property)) return null;
    if (prefix === "unset:") {
      if (typeof value !== "boolean") return null;
      if (value) unset.add(property);
      continue;
    }
    if (!isBoundedJsonValue(value)) return null;
    if (prefix === "base:") baseline[property] = value;
    else properties[property] = value;
  }
  const effective = { ...baseline, ...properties };
  for (const property of unset) delete effective[property];
  // The browser validates the effective payload as one JSON tree after resolving base/prop/unset.
  // Re-validating the whole object here is essential: validating each property with a fresh entry
  // counter would allow several individually-small values to exceed the shared 4,096-entry limit
  // and create a durable document that every conforming client refuses to materialize.
  return isBoundedJsonValue(effective) ? effective : null;
}

export interface StudioCrdtWorkAssetReferenceSnapshot {
  identities: ReadonlyMap<string, string>;
  admittedReferences: ReadonlyMap<string, StudioWorkAssetReference>;
  activeCount: number;
}

export interface StudioCrdtR8GrainReferenceSnapshot {
  /** Canonical immutable source keyed by the durable stroke identity that owns it. */
  byStrokeId: ReadonlyMap<string, Readonly<StudioBrushR8TextureGrainSource>>;
  /** One canonical source per durable work-asset identity. */
  byAssetId: ReadonlyMap<string, Readonly<StudioBrushR8TextureGrainSource>>;
  /** True when one asset ID was poisoned with two different canonical content identities. */
  hasConflictingAssetId: boolean;
}

/**
 * Snapshots every canonical renderer-significant R8 source from the durable stroke map.
 *
 * Root-schema validation runs before callers consume this snapshot, but this helper still
 * normalizes independently and ignores malformed candidates so it is safe to use while comparing
 * a pre-update document with a candidate update.
 */
export function snapshotStudioCrdtR8GrainReferences(
  doc: Y.Doc
): StudioCrdtR8GrainReferenceSnapshot {
  const byStrokeId = new Map<string, Readonly<StudioBrushR8TextureGrainSource>>();
  const byAssetId = new Map<string, Readonly<StudioBrushR8TextureGrainSource>>();
  let hasConflictingAssetId = false;
  const strokes = materializeExistingMapRoot(doc, "strokes");
  if (!(strokes instanceof Y.Map)) {
    return { byStrokeId, byAssetId, hasConflictingAssetId };
  }
  for (const [strokeId, value] of strokes) {
    if (!isBoundedStudioCrdtId(strokeId) || !(value instanceof Y.Map)) continue;
    const brushDynamics = value.get("brushDynamics");
    if (!brushDynamics || typeof brushDynamics !== "object" || Array.isArray(brushDynamics)) {
      continue;
    }
    const grain = (brushDynamics as Record<string, unknown>).grain;
    if (!grain || typeof grain !== "object" || Array.isArray(grain)) continue;
    const source = normalizeStudioBrushR8TextureGrainSource(
      (grain as Record<string, unknown>).source
    );
    if (!source) continue;
    byStrokeId.set(strokeId, source);
    const existing = byAssetId.get(source.asset.assetId);
    if (
      existing
      && serializeStudioBrushR8TextureGrainSourceCanonical(existing)
        !== serializeStudioBrushR8TextureGrainSourceCanonical(source)
    ) {
      hasConflictingAssetId = true;
      continue;
    }
    byAssetId.set(source.asset.assetId, source);
  }
  return { byStrokeId, byAssetId, hasConflictingAssetId };
}

/** Returns every materialized identity plus the non-tombstoned count in a valid document. */
export function snapshotStudioWorkAssetReferences(
  doc: Y.Doc
): StudioCrdtWorkAssetReferenceSnapshot {
  const identities = new Map<string, string>();
  const admittedReferences = new Map<string, StudioWorkAssetReference>();
  const index = materializeExistingMapRoot(doc, STUDIO_CRDT_SCENE_INDEX_ROOT);
  if (!(index instanceof Y.Map)) return { identities, admittedReferences, activeCount: 0 };
  let activeCount = 0;
  const metadataKeys = new Set(["id", "pageId", "layerId", "payloadVersion", "type", "deleted"]);
  for (const [id, tracked] of index) {
    if (tracked !== true) continue;
    const record = materializeExistingMapRoot(
      doc,
      `${STUDIO_CRDT_SCENE_ROOT_PREFIX}${encodeURIComponent(id)}`
    );
    if (
      !(record instanceof Y.Map) ||
      record.get("type") !== "reference"
    ) continue;
    const props = readReservedProperties(
      record,
      STUDIO_CRDT_SCENE_KEYS_BY_TYPE.reference,
      metadataKeys
    );
    if (!props) continue;
    const elementType = props.elementType;
    if (!isValidLegacyStudioCrdtReferenceType(elementType)) continue;
    identities.set(id, elementType);
    if (
      hasLegacyStudioCrdtReferenceProps(props) ||
      !STUDIO_WORK_ASSET_TYPE_SET.has(elementType)
    ) continue;
    const reference = {
      assetId: id,
      elementType: elementType as StudioWorkAssetReference["elementType"],
    };
    admittedReferences.set(studioWorkAssetReferenceKey(reference), reference);
    if (record.get("deleted") !== true) activeCount += 1;
  }
  return { identities, admittedReferences, activeCount };
}

function canonicalReservedRootId(rootName: string, prefix: string): string | null {
  if (!rootName.startsWith(prefix)) return null;
  const encodedId = rootName.slice(prefix.length);
  if (encodedId.length === 0) return null;
  try {
    const id = decodeURIComponent(encodedId);
    return isBoundedStudioCrdtId(id) && encodeURIComponent(id) === encodedId ? id : null;
  } catch {
    return null;
  }
}

interface StudioCrdtLayerGroupIdentity {
  key: string;
  pageId: string;
  groupId: string;
}

function parseStudioCrdtLayerGroupKey(key: string): StudioCrdtLayerGroupIdentity | null {
  if (key.length < 5 || key.length > 328) return null;
  const readPart = (offset: number): { value: string; nextOffset: number } | null => {
    const separator = key.indexOf(":", offset);
    if (separator < 0) return null;
    const lengthToken = key.slice(offset, separator);
    if (!/^(?:0|[1-9][0-9]*)$/u.test(lengthToken)) return null;
    const length = Number(lengthToken);
    if (!Number.isSafeInteger(length) || length <= 0 || length > 160) return null;
    const start = separator + 1;
    const end = start + length;
    if (end > key.length) return null;
    return { value: key.slice(start, end), nextOffset: end };
  };
  const page = readPart(0);
  if (!page) return null;
  const group = readPart(page.nextOffset);
  if (
    !group ||
    group.nextOffset !== key.length ||
    !isBoundedStudioCrdtId(page.value) ||
    !isBoundedStudioCrdtId(group.value) ||
    group.value === "page-root"
  ) {
    return null;
  }
  const canonical = `${page.value.length}:${page.value}${group.value.length}:${group.value}`;
  return canonical === key
    ? { key, pageId: page.value, groupId: group.value }
    : null;
}

function canonicalReservedLayerGroupKey(rootName: string): StudioCrdtLayerGroupIdentity | null {
  if (!rootName.startsWith(STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX)) return null;
  const encodedKey = rootName.slice(STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX.length);
  if (!encodedKey) return null;
  try {
    const key = decodeURIComponent(encodedKey);
    if (encodeURIComponent(key) !== encodedKey) return null;
    return parseStudioCrdtLayerGroupKey(key);
  } catch {
    return null;
  }
}

function encodeStudioCrdtDeletionTarget(target: StudioCrdtDeletionTarget): string {
  return target.kind === "group"
    ? JSON.stringify([target.kind, target.pageId, target.id])
    : JSON.stringify([target.kind, target.id]);
}

function parseStudioCrdtDeletionTarget(value: unknown): StudioCrdtDeletionTarget | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > STUDIO_CRDT_DELETION_TARGET_MAX_LENGTH
  ) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    if (
      parsed.length === 2 &&
      (parsed[0] === "stroke" || parsed[0] === "scene" || parsed[0] === "page") &&
      isBoundedStudioCrdtId(parsed[1])
    ) {
      const target = { kind: parsed[0], id: parsed[1] } satisfies StudioCrdtDeletionTarget;
      return encodeStudioCrdtDeletionTarget(target) === value ? target : null;
    }
    if (
      parsed.length === 3 &&
      parsed[0] === "group" &&
      isBoundedStudioCrdtId(parsed[1]) &&
      isBoundedStudioCrdtId(parsed[2]) &&
      parsed[2] !== "page-root"
    ) {
      const target = {
        kind: "group",
        pageId: parsed[1],
        id: parsed[2],
      } satisfies StudioCrdtDeletionTarget;
      return encodeStudioCrdtDeletionTarget(target) === value ? target : null;
    }
  } catch {
    return null;
  }
  return null;
}

function studioCrdtDeletionTargetExists(doc: Y.Doc, target: StudioCrdtDeletionTarget): boolean {
  if (target.kind === "stroke") {
    const strokes = materializeExistingMapRoot(doc, "strokes");
    return strokes instanceof Y.Map && strokes.get(target.id) instanceof Y.Map;
  }
  if (target.kind === "scene") {
    const index = materializeExistingMapRoot(doc, STUDIO_CRDT_SCENE_INDEX_ROOT);
    const record = materializeExistingMapRoot(
      doc,
      `${STUDIO_CRDT_SCENE_ROOT_PREFIX}${encodeURIComponent(target.id)}`
    );
    return index instanceof Y.Map && index.get(target.id) === true && record instanceof Y.Map;
  }
  if (target.kind === "page") {
    const index = materializeExistingMapRoot(doc, STUDIO_CRDT_PAGE_INDEX_ROOT);
    const record = materializeExistingMapRoot(
      doc,
      `${STUDIO_CRDT_PAGE_ROOT_PREFIX}${encodeURIComponent(target.id)}`
    );
    return index instanceof Y.Map && index.get(target.id) === true && record instanceof Y.Map;
  }
  const key = `${target.pageId.length}:${target.pageId}${target.id.length}:${target.id}`;
  const index = materializeExistingMapRoot(doc, STUDIO_CRDT_LAYER_GROUP_INDEX_ROOT);
  const record = materializeExistingMapRoot(
    doc,
    `${STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX}${encodeURIComponent(key)}`
  );
  return index instanceof Y.Map && index.get(key) === true && record instanceof Y.Map;
}

function validateStudioCrdtDeletionRoots(doc: Y.Doc): boolean {
  const operations = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_OPS_ROOT);
  const acknowledgements = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_ACKS_ROOT);
  if (
    operations === null ||
    acknowledgements === null ||
    (operations?.size ?? 0) > STUDIO_CRDT_COLLECTION_MAX_ENTRIES ||
    (acknowledgements?.size ?? 0) > STUDIO_CRDT_COLLECTION_MAX_ENTRIES
  ) return false;
  if (operations) {
    for (const [operationId, encodedTarget] of operations) {
      const target = parseStudioCrdtDeletionTarget(encodedTarget);
      if (!STUDIO_CRDT_UUID_PATTERN.test(operationId) || !target || !studioCrdtDeletionTargetExists(doc, target)) {
        return false;
      }
    }
  }
  if (acknowledgements) {
    for (const [operationId, encodedTarget] of acknowledgements) {
      if (
        !STUDIO_CRDT_UUID_PATTERN.test(operationId) ||
        !parseStudioCrdtDeletionTarget(encodedTarget) ||
        !operations ||
        operations.get(operationId) !== encodedTarget
      ) return false;
    }
  }
  return true;
}

export interface StudioCrdtDeletionRootSnapshot {
  operations: ReadonlyMap<string, unknown>;
  acknowledgements: ReadonlyMap<string, unknown>;
}

export function snapshotStudioCrdtDeletionRoots(doc: Y.Doc): StudioCrdtDeletionRootSnapshot | null {
  const operations = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_OPS_ROOT);
  const acknowledgements = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_ACKS_ROOT);
  if (operations === null || acknowledgements === null) return null;
  return {
    operations: new Map(operations ?? []),
    acknowledgements: new Map(acknowledgements ?? []),
  };
}

export function preservesStudioCrdtDeletionRoots(
  snapshot: StudioCrdtDeletionRootSnapshot | null,
  doc: Y.Doc
): boolean {
  if (!snapshot) return false;
  const operations = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_OPS_ROOT);
  const acknowledgements = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_ACKS_ROOT);
  if (operations === null || acknowledgements === null) return false;
  for (const [operationId, target] of snapshot.operations) {
    if (!operations || operations.get(operationId) !== target) return false;
  }
  for (const [operationId, target] of snapshot.acknowledgements) {
    if (!acknowledgements || acknowledgements.get(operationId) !== target) return false;
  }
  return true;
}

function validateSceneElementRoot(id: string, record: Y.Map<unknown>): boolean {
  const metadataKeys = new Set(["id", "pageId", "layerId", "payloadVersion", "type", "deleted"]);
  const type = record.get("type");
  if (
    record.get("id") !== id ||
    !isBoundedStudioCrdtId(record.get("pageId")) ||
    !isBoundedStudioCrdtId(record.get("layerId")) ||
    record.get("payloadVersion") !== 1 ||
    !isStudioCrdtSceneType(type) ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean")
  ) {
    return false;
  }
  const props = readReservedProperties(record, STUDIO_CRDT_SCENE_KEYS_BY_TYPE[type], metadataKeys);
  if (!props) return false;
  for (const key of STUDIO_CRDT_REQUIRED_SCENE_KEYS[type]) {
    if (!(key in props)) return false;
  }
  if (
    type === "reference" &&
    !hasValidStudioWorkAssetReferenceProps(id, props)
  ) return false;
  if (type === "reference") {
    // Validate losing baseline/override candidates too. Otherwise a valid effective `prop:` value
    // could hide an invalid `base:` candidate which becomes active after a later unset operation.
    for (const [key, value] of record) {
      const prefix = key.startsWith("base:")
        ? "base:"
        : key.startsWith("prop:")
          ? "prop:"
          : null;
      if (!prefix) continue;
      const property = key.slice(prefix.length);
      if (!isValidStudioWorkAssetReferenceCandidate(property, value)) return false;
    }
  }
  for (const key of ["x", "y"]) {
    if (key in props && !finiteNumberInRange(props[key], -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE)) {
      return false;
    }
  }
  for (const key of ["width", "height", "fontSize", "strokeWidth"]) {
    if (key in props && !finiteNumberInRange(props[key], 0, STUDIO_CRDT_MAX_COORDINATE)) return false;
  }
  for (const key of [
    "letterSpacing",
    "lineHeight",
    "shadowBlur",
    "shadowOffsetX",
    "shadowOffsetY",
    "shadowOpacity",
    "skewX",
    "skewY",
    "tailXRatio",
    "tailHeight",
    "tailBase",
    "tailBend",
    "autoShrinkMinFontSize",
    "starAmplitude",
    "lineCount",
    "innerRadius",
    "outerRadius",
    "noise",
    "centerXRatio",
    "centerYRatio",
  ]) {
    if (
      key in props &&
      !finiteNumberInRange(
        props[key],
        -STUDIO_CRDT_MAX_COORDINATE,
        STUDIO_CRDT_MAX_COORDINATE
      )
    ) return false;
  }
  if ("rotation" in props && !finiteNumberInRange(props.rotation, -1_000_000, 1_000_000)) return false;
  if ("opacity" in props && !finiteNumberInRange(props.opacity, 0, 1)) return false;
  for (const key of [
    "hidden",
    "locked",
    "noClip",
    "lockAspect",
    "clipBelow",
    "alphaLocked",
    "maskEnabled",
    "vertical",
    "autoShrinkText",
  ]) {
    if (key in props && typeof props[key] !== "boolean") return false;
  }
  if ("text" in props && !boundedString(props.text, STUDIO_CRDT_JSON_MAX_STRING_LENGTH)) return false;
  for (const key of ["fill", "textFill", "stroke", "variant", "direction"]) {
    if (key in props && !boundedString(props[key], 512)) return false;
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
    if (key in props && !values.includes(props[key] as string)) return false;
  }
  if (
    "lineCount" in props &&
    (!Number.isInteger(props.lineCount) || (props.lineCount as number) < 1)
  ) return false;
  for (const key of ["points", "customShapePoints"] as const) {
    if (!(key in props)) continue;
    const values = props[key];
    if (
      !Array.isArray(values) ||
      values.length % 2 !== 0 ||
      (key === "points" ? values.length !== 8 : values.length < 6) ||
      values.some(
        (value) =>
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          Math.abs(value) > STUDIO_CRDT_MAX_COORDINATE
      )
    ) return false;
  }
  const byteLength = encodedJsonByteLength({ version: 1, type, props });
  return byteLength !== null && byteLength <= STUDIO_CRDT_SCENE_PAYLOAD_MAX_BYTES;
}

function validatePageRoot(id: string, record: Y.Map<unknown>): boolean {
  const metadataKeys = new Set(["id", "payloadVersion", "deleted"]);
  if (
    record.get("id") !== id ||
    record.get("payloadVersion") !== 1 ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean")
  ) {
    return false;
  }
  const props = readReservedProperties(record, STUDIO_CRDT_PAGE_KEYS, metadataKeys);
  if (!props || !boundedString(props.bg, 512)) return false;
  if (!finiteNumberInRange(props.canvasH, 1, STUDIO_CRDT_MAX_COORDINATE)) return false;
  if (
    props.bgGrad !== null &&
    (!Array.isArray(props.bgGrad) ||
      props.bgGrad.length > 32 ||
      props.bgGrad.some((color) => !boundedString(color, 512)))
  ) {
    return false;
  }
  for (const key of ["name", "note", "shotType", "cameraAngle"]) {
    if (key in props && !boundedString(props[key], key === "note" ? 8_192 : 512)) return false;
  }
  if ("hideMaster" in props && typeof props.hideMaster !== "boolean") return false;
  if ("drawingAssist" in props && !isValidStudioCrdtDrawingAssist(props.drawingAssist)) {
    return false;
  }
  // A valid `prop:` winner can hide an invalid `base:` candidate until a later unset. Validate
  // both candidates now so every future effective page payload remains safe to materialize.
  for (const [key, value] of record) {
    if (
      (key === "base:drawingAssist" || key === "prop:drawingAssist") &&
      !isValidStudioCrdtDrawingAssist(value)
    ) {
      return false;
    }
  }
  const byteLength = encodedJsonByteLength({ version: 1, props });
  return byteLength !== null && byteLength <= STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES;
}

function validateLayerGroupRoot(
  identity: StudioCrdtLayerGroupIdentity,
  record: Y.Map<unknown>
): boolean {
  const metadataKeys = new Set(["id", "pageId", "payloadVersion", "deleted"]);
  if (
    record.get("id") !== identity.groupId ||
    record.get("pageId") !== identity.pageId ||
    record.get("payloadVersion") !== 1 ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean") ||
    record.get("unset:name") === true
  ) {
    return false;
  }
  for (const [key, value] of record) {
    if (metadataKeys.has(key) || key.startsWith("unset:")) continue;
    const separator = key.indexOf(":");
    const property = separator >= 0 ? key.slice(separator + 1) : "";
    if (property === "name") {
      if (!boundedExactText(value, 512)) return false;
    } else if ((property === "hidden" || property === "locked") && typeof value !== "boolean") {
      return false;
    }
  }
  const props = readReservedProperties(record, STUDIO_CRDT_LAYER_GROUP_KEYS, metadataKeys);
  if (!props || !boundedExactText(props.name, 512)) return false;
  for (const key of ["hidden", "locked"] as const) {
    if (key in props && typeof props[key] !== "boolean") return false;
  }
  const byteLength = encodedJsonByteLength({ version: 1, props });
  return byteLength !== null && byteLength <= STUDIO_CRDT_LAYER_GROUP_PAYLOAD_MAX_BYTES;
}

function validateTrackedLayerGroupRoots(doc: Y.Doc): boolean {
  const root = materializeExistingMapRoot(doc, STUDIO_CRDT_LAYER_GROUP_INDEX_ROOT);
  const trackedKeys = new Set<string>();
  if (root !== undefined) {
    if (root === null || root.size > STUDIO_CRDT_LAYER_GROUP_MAX_ENTRIES) return false;
    for (const [key, active] of root) {
      const identity = parseStudioCrdtLayerGroupKey(key);
      if (!identity || active !== true) return false;
      const record = materializeExistingMapRoot(
        doc,
        `${STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX}${encodeURIComponent(key)}`
      );
      if (!record || !validateLayerGroupRoot(identity, record)) return false;
      trackedKeys.add(key);
    }
  }
  let dynamicRootCount = 0;
  for (const [rootName, value] of doc.share) {
    if (!rootName.startsWith(STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX)) continue;
    dynamicRootCount += 1;
    if (dynamicRootCount > STUDIO_CRDT_LAYER_GROUP_MAX_ENTRIES) return false;
    const identity = canonicalReservedLayerGroupKey(rootName);
    if (
      !identity ||
      !trackedKeys.has(identity.key) ||
      !(value instanceof Y.Map) ||
      !validateLayerGroupRoot(identity, value)
    ) {
      return false;
    }
  }
  return true;
}

export interface StudioCrdtStrokePaintContractInput {
  payloadVersion: unknown;
  paintModel: unknown;
  kind?: unknown;
  mode?: unknown;
  brush?: unknown;
  sampleSpacing?: unknown;
  pressureModel?: unknown;
  fill?: unknown;
  brushDynamics?: unknown;
  stampPipeline?: unknown;
  watercolorPipeline?: unknown;
  symmetry?: unknown;
}

function hasCausalStrokePaintGeometry(
  input: StudioCrdtStrokePaintContractInput
): boolean {
  return (
    typeof input.sampleSpacing === "number"
    && Number.isFinite(input.sampleSpacing)
    && input.sampleSpacing >= 0
  ) || (
    typeof input.pressureModel === "string"
    && STUDIO_CRDT_CAUSAL_PRESSURE_MODELS.has(input.pressureModel)
  );
}

function hasNonIdentityStrokeSymmetry(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "object" || Array.isArray(value)) return true;
  const type = (value as Record<string, unknown>).type;
  return type !== undefined && type !== "none";
}

function isBoundedFlowStrokeSymmetryCompatible(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (source.type === undefined || source.type === "none") return true;
  if (
    source.type !== "vertical"
    && source.type !== "horizontal"
    && source.type !== "radial"
    && source.type !== "kaleidoscope"
  ) return false;
  if (
    typeof source.centerX !== "number"
    || !Number.isFinite(source.centerX)
    || typeof source.centerY !== "number"
    || !Number.isFinite(source.centerY)
  ) return false;
  if (source.type === "vertical" || source.type === "horizontal") return true;
  return typeof source.radialCount === "number"
    && Number.isInteger(source.radialCount)
    && source.radialCount >= 1
    && source.radialCount <= 32;
}

function isLayeredFlowStrokeBrushCompatible(brush: unknown): boolean {
  if (typeof brush !== "string" || brush.length === 0) return true;
  return STUDIO_CRDT_LAYERED_FLOW_COMPATIBLE_BRUSH_IDS.has(brush)
    || !STUDIO_CRDT_KNOWN_INCOMPATIBLE_LAYERED_FLOW_BRUSH_IDS.has(brush);
}

function rendererSignificantR8GrainAdmission(
  brushDynamics: unknown,
): "absent" | "valid" | "invalid" {
  if (!brushDynamics || typeof brushDynamics !== "object" || Array.isArray(brushDynamics)) {
    return "absent";
  }
  const grain = (brushDynamics as Record<string, unknown>).grain;
  if (!grain || typeof grain !== "object" || Array.isArray(grain)) return "absent";
  if (!Object.prototype.hasOwnProperty.call(grain, "source")) return "absent";
  const source = (grain as Record<string, unknown>).source;
  if (source == null) return "absent";
  const canonical = serializeStudioBrushR8TextureGrainSourceCanonical(source);
  return canonical !== null && canonical === JSON.stringify(source)
    ? "valid"
    : "invalid";
}

/**
 * Server mirror of the browser's pure stroke-paint admission contract. Runtime imports stay
 * one-way at the API boundary; the service test pins this mirror against the browser oracle.
 */
export function hasValidStudioCrdtStrokePaintContract(
  input: StudioCrdtStrokePaintContractInput
): boolean {
  if (
    input.payloadVersion !== STUDIO_CRDT_LAYERED_FLOW_STROKE_PAYLOAD_VERSION
    && input.payloadVersion !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
    && input.payloadVersion !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
  ) return false;
  const brushDynamics = input.brushDynamics !== null
    && typeof input.brushDynamics === "object"
    && !Array.isArray(input.brushDynamics)
    ? input.brushDynamics as Record<string, unknown>
    : undefined;
  const r8GrainAdmission = rendererSignificantR8GrainAdmission(input.brushDynamics);
  if (
    r8GrainAdmission === "invalid"
    || (
      r8GrainAdmission === "valid"
      && input.payloadVersion !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
    )
  ) return false;
  if (
    brushDynamics?.depositPipeline === STUDIO_CRDT_SEGMENTED_CAUSAL_DEPOSIT_PIPELINE
    && input.payloadVersion !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
  ) return false;
  if ((input.kind ?? "freehand") !== "freehand" || (input.mode ?? "pen") !== "pen") {
    return false;
  }
  if (input.fill !== undefined && input.fill !== null) return false;
  if (input.stampPipeline !== undefined && input.stampPipeline !== null) return false;
  if (input.watercolorPipeline !== undefined && input.watercolorPipeline !== null) return false;
  if (!hasCausalStrokePaintGeometry(input)) return false;

  if (input.paintModel === STUDIO_CRDT_LAYERED_FLOW_PAINT_MODEL) {
    return (
      (input.brushDynamics === undefined || input.brushDynamics === null)
      && !hasNonIdentityStrokeSymmetry(input.symmetry)
      && isLayeredFlowStrokeBrushCompatible(input.brush)
    );
  }
  if (input.paintModel === STUDIO_CRDT_BOUNDED_FLOW_PAINT_MODEL) {
    return (
      typeof input.brushDynamics === "object"
      && input.brushDynamics !== null
      && typeof input.brush === "string"
      && STUDIO_CRDT_BOUNDED_FLOW_DYNAMIC_BRUSH_IDS.has(input.brush)
      && isBoundedFlowStrokeSymmetryCompatible(input.symmetry)
    );
  }
  return false;
}

function validateStrokeRoot(id: string, record: Y.Map<unknown>): boolean {
  const strokeWidth = record.get("strokeWidth");
  const payloadVersion = record.get("payloadVersion");
  if (
    !hasOnlyKeys(record, STUDIO_CRDT_STROKE_RECORD_KEYS) ||
    record.get("id") !== id ||
    !isBoundedStudioCrdtId(record.get("pageId")) ||
    !isBoundedStudioCrdtId(record.get("layerId")) ||
    (record.get("status") !== "drawing" && record.get("status") !== "finalized") ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean") ||
    (payloadVersion !== STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION &&
      payloadVersion !== STUDIO_CRDT_LAYERED_FLOW_STROKE_PAYLOAD_VERSION &&
      payloadVersion !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION &&
      payloadVersion !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION) ||
    record.get("type") !== "draw" ||
    (record.get("mode") !== "pen" && record.get("mode") !== "eraser") ||
    !boundedExactText(record.get("kind"), 80) ||
    !boundedExactText(record.get("stroke"), 256) ||
    !finiteNumberInRange(strokeWidth, 0.01, STUDIO_CRDT_STROKE_WIDTH_MAX)
  ) {
    return false;
  }
  const opacity = record.get("opacity");
  if (record.has("opacity") && !finiteNumberInRange(opacity, 0, 1)) return false;
  const sampleSpacing = record.get("sampleSpacing");
  if (
    record.has("sampleSpacing") &&
    !finiteNumberInRange(sampleSpacing, 0, STUDIO_CRDT_STROKE_WIDTH_MAX)
  ) return false;
  for (const key of STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS) {
    const value = record.get(key);
    if (
      record.has(key)
      && (
        !boundedExactText(value, STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS[key])
        || ((key === "brushCatalogId" || key === "brushCatalogName") && value.trim() !== value)
      )
    ) return false;
  }
  for (const key of STUDIO_CRDT_STROKE_JSON_KEYS) {
    const value = record.get(key);
    if (
      record.has(key) &&
      (value === null || typeof value !== "object" || Array.isArray(value) ||
        !isBoundedJsonValue(value))
    ) return false;
  }
  const extensionsValue = record.get("extensions");
  const extensions = extensionsValue !== null && typeof extensionsValue === "object"
    && !Array.isArray(extensionsValue)
    ? extensionsValue as Record<string, unknown>
    : undefined;
  const brushDynamicsValue = record.get("brushDynamics");
  const brushDynamics = brushDynamicsValue !== null
    && typeof brushDynamicsValue === "object"
    && !Array.isArray(brushDynamicsValue)
    ? brushDynamicsValue as Record<string, unknown>
    : undefined;
  const hasMaterialPressureModel = extensions !== undefined
    && Object.prototype.hasOwnProperty.call(extensions, "materialPressureModel");
  const hasMaterialMinimumDiameterRatio = extensions !== undefined
    && Object.prototype.hasOwnProperty.call(extensions, "materialMinimumDiameterRatio");
  const hasDynamicMinimumDiameterRatio = brushDynamics !== undefined
    && Object.prototype.hasOwnProperty.call(brushDynamics, "minimumDiameterRatio");
  const hasSegmentedCausalDeposit =
    brushDynamics?.depositPipeline === STUDIO_CRDT_SEGMENTED_CAUSAL_DEPOSIT_PIPELINE;
  const r8GrainAdmission = rendererSignificantR8GrainAdmission(brushDynamicsValue);
  if (
    payloadVersion !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
    && payloadVersion !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
    && (
      hasMaterialPressureModel
      || hasMaterialMinimumDiameterRatio
      || hasDynamicMinimumDiameterRatio
    )
  ) return false;
  if (
    (
      payloadVersion === STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
      || payloadVersion === STUDIO_CRDT_STROKE_PAYLOAD_VERSION
    )
    && (
      hasMaterialPressureModel !== hasMaterialMinimumDiameterRatio
      || (hasMaterialPressureModel
        && extensions?.materialPressureModel !== STUDIO_CRDT_MATERIAL_PRESSURE_MODEL)
      || (hasMaterialMinimumDiameterRatio
        && !finiteNumberInRange(extensions?.materialMinimumDiameterRatio, 0, 1))
      || (hasDynamicMinimumDiameterRatio
        && !finiteNumberInRange(brushDynamics?.minimumDiameterRatio, 0, 1))
    )
  ) return false;
  if (
    hasSegmentedCausalDeposit
    && payloadVersion !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
  ) return false;
  if (
    r8GrainAdmission === "invalid"
    || (
      r8GrainAdmission === "valid"
      && payloadVersion !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
    )
  ) return false;
  const paintModel = extensions?.paintModel;
  if (
    paintModel !== undefined
    && !hasValidStudioCrdtStrokePaintContract({
      payloadVersion,
      paintModel,
      kind: record.get("kind"),
      mode: record.get("mode"),
      brush: record.get("brush"),
      sampleSpacing: record.get("sampleSpacing"),
      pressureModel: extensions?.pressureModel,
      fill: record.get("fill"),
      brushDynamics: brushDynamicsValue,
      stampPipeline: extensions?.stampPipeline,
      watercolorPipeline: extensions?.watercolorPipeline,
      symmetry: record.get("symmetry"),
    })
  ) return false;
  const metadata: Record<string, unknown> = {
    version: payloadVersion,
    type: "draw",
    kind: record.get("kind"),
    mode: record.get("mode"),
    stroke: record.get("stroke"),
    strokeWidth,
  };
  for (const key of [
    "opacity",
    "sampleSpacing",
    ...STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS,
    ...STUDIO_CRDT_STROKE_JSON_KEYS,
  ]) {
    if (record.has(key)) metadata[key] = record.get(key);
  }
  const metadataBytes = encodedJsonByteLength(metadata);
  if (metadataBytes === null || metadataBytes > STUDIO_CRDT_STROKE_METADATA_MAX_BYTES) return false;

  const arrays = Object.fromEntries(
    STUDIO_CRDT_STROKE_SAMPLE_KEYS.map((key) => [key, record.get(key)])
  ) as Record<(typeof STUDIO_CRDT_STROKE_SAMPLE_KEYS)[number], unknown>;
  if (STUDIO_CRDT_STROKE_SAMPLE_KEYS.some((key) => !(arrays[key] instanceof Y.Array))) {
    return false;
  }
  const points = arrays.points as Y.Array<unknown>;
  if (
    points.length % 2 !== 0 ||
    points.length / 2 > STUDIO_CRDT_STROKE_SAMPLE_MAX_COUNT
  ) return false;
  const sampleCount = points.length / 2;
  if (
    STUDIO_CRDT_STROKE_SAMPLE_KEYS.slice(1).some(
      (key) => (arrays[key] as Y.Array<unknown>).length !== sampleCount
    )
  ) return false;
  const ranges: Record<(typeof STUDIO_CRDT_STROKE_SAMPLE_KEYS)[number], readonly [number, number]> = {
    points: [-STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE],
    pressures: [0, 1],
    tiltXs: [-90, 90],
    tiltYs: [-90, 90],
    twists: [0, 359],
    speeds: [0, 1_000_000],
    tangentialPressures: [-1, 1],
  };
  for (const key of STUDIO_CRDT_STROKE_SAMPLE_KEYS) {
    const [minimum, maximum] = ranges[key];
    if (
      (arrays[key] as Y.Array<unknown>).toArray().some(
        (value) => !finiteNumberInRange(value, minimum, maximum)
      )
    ) return false;
  }
  return true;
}

function validateTrackedDynamicRoots(
  doc: Y.Doc,
  indexRootName: string,
  dynamicPrefix: string,
  validateRecord: (id: string, record: Y.Map<unknown>) => boolean,
  maximumEntries = STUDIO_CRDT_COLLECTION_MAX_ENTRIES
): boolean {
  const root = materializeExistingMapRoot(doc, indexRootName);
  const trackedIds = new Set<string>();
  if (root !== undefined) {
    if (root === null || root.size > maximumEntries) return false;
    for (const [id, active] of root) {
      if (!isBoundedStudioCrdtId(id) || active !== true) return false;
      const record = materializeExistingMapRoot(doc, `${dynamicPrefix}${encodeURIComponent(id)}`);
      if (!record || !validateRecord(id, record)) return false;
      trackedIds.add(id);
    }
  }
  let dynamicRootCount = 0;
  for (const [rootName, value] of doc.share) {
    if (!rootName.startsWith(dynamicPrefix)) continue;
    dynamicRootCount += 1;
    if (dynamicRootCount > maximumEntries) return false;
    const id = canonicalReservedRootId(rootName, dynamicPrefix);
    if (!id || !trackedIds.has(id) || !(value instanceof Y.Map) || !validateRecord(id, value)) {
      return false;
    }
  }
  return true;
}

/** Rejects valid Yjs syntax that would poison the Studio document's runtime collection contract. */
export function hasValidStudioCrdtRootSchema(doc: Y.Doc): boolean {
  const strokesRoot = materializeExistingMapRoot(doc, "strokes");
  if (strokesRoot !== undefined) {
    if (strokesRoot === null) return false;
    for (const [id, value] of strokesRoot) {
      if (
        !isBoundedStudioCrdtId(id) ||
        !(value instanceof Y.Map) ||
        !validateStrokeRoot(id, value)
      ) return false;
    }
  }

  const orderRoot = materializeExistingArrayRoot(doc, "stroke-order");
  if (orderRoot !== undefined) {
    if (orderRoot === null || orderRoot.length > STUDIO_CRDT_COLLECTION_MAX_ENTRIES) {
      return false;
    }
    const activeCounts = new Map<string, number>();
    const matchingActiveCoordinates = new Set<string>();
    const sceneIndexRoot = materializeExistingMapRoot(doc, STUDIO_CRDT_SCENE_INDEX_ROOT);
    for (const value of orderRoot) {
      if (!(value instanceof Y.Map)) return false;
      const strokeId = value.get("strokeId");
      const elementId = value.get("elementId");
      const isStroke = isBoundedStudioCrdtId(strokeId) && elementId === undefined;
      const isScene = isBoundedStudioCrdtId(elementId) && strokeId === undefined;
      if (!isStroke && !isScene) return false;
      const allowedKeys = isStroke
        ? new Set(["strokeId", "pageId", "layerId", "active"])
        : new Set(["elementId", "pageId", "layerId", "kind", "active"]);
      if (
        !hasOnlyKeys(value, allowedKeys) ||
        !isBoundedStudioCrdtId(value.get("pageId")) ||
        !isBoundedStudioCrdtId(value.get("layerId")) ||
        typeof value.get("active") !== "boolean" ||
        (isScene && value.get("kind") !== "scene")
      ) return false;
      const targetId = (isStroke ? strokeId : elementId) as string;
      const target = isStroke
        ? strokesRoot?.get(targetId)
        : materializeExistingMapRoot(
            doc,
            `${STUDIO_CRDT_SCENE_ROOT_PREFIX}${encodeURIComponent(targetId)}`
          );
      const active = value.get("active") === true;
      if (
        !(target instanceof Y.Map) ||
        target.get("id") !== targetId ||
        (isScene && (!sceneIndexRoot || sceneIndexRoot.get(targetId) !== true))
      ) return false;
      if (active) {
        const countKey = `${isStroke ? "stroke" : "scene"}:${targetId}`;
        const count = (activeCounts.get(countKey) ?? 0) + 1;
        if (count > STUDIO_CRDT_ACTIVE_ORDER_ENTRY_MAX_COUNT) return false;
        activeCounts.set(countKey, count);
        if (
          target.get("pageId") === value.get("pageId") &&
          target.get("layerId") === value.get("layerId")
        ) matchingActiveCoordinates.add(countKey);
      }
    }
    // Concurrent reparents can leave multiple active entries with different coordinates. Y.Map
    // deterministically chooses one record owner while Y.Array retains both operations, so losing
    // active entries are valid history. At least one active entry must still describe the winning
    // record coordinate; otherwise the order log cannot place the current record coherently.
    for (const countKey of activeCounts.keys()) {
      if (!matchingActiveCoordinates.has(countKey)) return false;
    }
  }

  if (
    !validateTrackedDynamicRoots(
      doc,
      STUDIO_CRDT_SCENE_INDEX_ROOT,
      STUDIO_CRDT_SCENE_ROOT_PREFIX,
      validateSceneElementRoot
    ) ||
    !validateTrackedDynamicRoots(
      doc,
      STUDIO_CRDT_PAGE_INDEX_ROOT,
      STUDIO_CRDT_PAGE_ROOT_PREFIX,
      validatePageRoot
    ) ||
    !validateTrackedLayerGroupRoots(doc)
  ) {
    return false;
  }

  const pageOrderRoot = materializeExistingArrayRoot(doc, STUDIO_CRDT_PAGE_ORDER_ROOT);
  if (pageOrderRoot !== undefined) {
    if (
      pageOrderRoot === null ||
      pageOrderRoot.length > STUDIO_CRDT_COLLECTION_MAX_ENTRIES
    ) return false;
    const allowedKeys = new Set(["pageId", "active"]);
    const activeCounts = new Map<string, number>();
    const pageIndexRoot = materializeExistingMapRoot(doc, STUDIO_CRDT_PAGE_INDEX_ROOT);
    for (const value of pageOrderRoot) {
      const pageId = value instanceof Y.Map ? value.get("pageId") : undefined;
      const pageRecord = isBoundedStudioCrdtId(pageId)
        ? materializeExistingMapRoot(
            doc,
            `${STUDIO_CRDT_PAGE_ROOT_PREFIX}${encodeURIComponent(pageId)}`
          )
        : undefined;
      if (
        !(value instanceof Y.Map) ||
        !hasOnlyKeys(value, allowedKeys) ||
        !isBoundedStudioCrdtId(pageId) ||
        typeof value.get("active") !== "boolean" ||
        !pageIndexRoot ||
        pageIndexRoot.get(pageId) !== true ||
        !(pageRecord instanceof Y.Map) ||
        pageRecord.get("id") !== pageId
      ) return false;
      if (value.get("active") === true) {
        const count = (activeCounts.get(pageId) ?? 0) + 1;
        if (count > STUDIO_CRDT_ACTIVE_ORDER_ENTRY_MAX_COUNT) return false;
        activeCounts.set(pageId, count);
      }
    }
  }
  return validateStudioCrdtDeletionRoots(doc) && hasValidStudioCrdtRasterDocument(doc);
}
