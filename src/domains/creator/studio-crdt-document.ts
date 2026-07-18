import * as Y from "yjs";

import {
  decodeStudioCrdtStateVector,
  decodeStudioCrdtSyncChunks,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtStateVector,
  encodeStudioCrdtUpdate,
  STUDIO_CRDT_ORIGIN_LOCAL,
  STUDIO_CRDT_ORIGIN_REMOTE,
  STUDIO_CRDT_ORIGIN_SYNC,
  STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  type StudioCrdtSyncResponse,
  type StudioCrdtStrokePayloadVersion,
} from "./studio-crdt-protocol";
import { runStudioCrdtRasterWorker } from "./studio-crdt-raster-worker-client";
import {
  STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
  STUDIO_CRDT_LAYER_GROUP_PROPERTY_KEYS,
  STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
  STUDIO_CRDT_PAGE_PROPERTY_KEYS,
  STUDIO_CRDT_REQUIRED_SCENE_ELEMENT_KEYS,
  STUDIO_CRDT_SCENE_ELEMENT_KEYS_BY_TYPE,
  STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
  isStudioCrdtSceneElementType,
  studioCrdtLayerGroupKey,
  validateStudioCrdtLayerGroupPayload,
  validateStudioCrdtPagePayload,
  validateStudioCrdtSceneElementPayload,
  type StudioCrdtJsonObject,
  type StudioCrdtJsonValue,
  type StudioCrdtLayerGroupPayload,
  type StudioCrdtPagePayload,
  type StudioCrdtSceneElementPayload,
} from "./studio-crdt-scene-schema";
import {
  isStudioInkPressureModel,
  studioInkFallbackPressure,
  type StudioInkPressureModel,
} from "./studio-ink-pressure-model";
import { isStudioStrokePaintModelCompatible } from "./studio-stroke-paint-model";

import type { StudioRasterCompactionCheckpoint } from "@/lib/studio-crdt-raster-compaction";

import {
  STUDIO_CRDT_RASTER_CHECKPOINTS_ROOT,
  STUDIO_CRDT_RASTER_MAX_REFERENCED_BYTES,
  STUDIO_CRDT_RASTER_MAX_SURFACES,
  STUDIO_CRDT_RASTER_OPERATIONS_ROOT,
  STUDIO_CRDT_RASTER_SURFACES_ROOT,
  STUDIO_CRDT_RASTER_UNDO_ACKS_ROOT,
  STUDIO_CRDT_RASTER_UNDO_OPERATIONS_ROOT,
  extractStudioCrdtRasterRawRoots,
  readStudioCrdtRasterDocument,
  type StudioCrdtRasterDocumentSnapshot,
  type StudioCrdtRasterIdentityKind,
} from "@/lib/studio-crdt-raster-document-contract";
import {
  STUDIO_RASTER_CRDT_VERSION,
  STUDIO_RASTER_MAX_OPERATIONS,
  STUDIO_RASTER_MAX_UNDO_OPERATIONS,
  canonicalStudioRasterJson,
  compareStudioRasterEventOrder,
  createStudioRasterOperationLog,
  mergeStudioRasterOperationLogs,
  type StudioRasterAssetReference,
  type StudioRasterOperation,
  type StudioRasterOperationLog,
  type StudioRasterUndoAcknowledgement,
  type StudioRasterUndoOperation,
} from "@/lib/studio-crdt-raster-ops";

export {
  STUDIO_CRDT_ORIGIN_LOCAL,
  STUDIO_CRDT_ORIGIN_REMOTE,
  STUDIO_CRDT_ORIGIN_SYNC,
  STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
  type StudioCrdtStrokePayloadVersion,
} from "./studio-crdt-protocol";
export {
  STUDIO_CRDT_LAYER_GROUP_MAX_BYTES,
  STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
  STUDIO_CRDT_PAGE_MAX_BYTES,
  STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
  STUDIO_CRDT_PAYLOAD_SCENE_ELEMENT_TYPES,
  STUDIO_CRDT_SCENE_ELEMENT_MAX_BYTES,
  STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
  STUDIO_CRDT_SCENE_ELEMENT_TYPES,
  isStudioCrdtPayloadSceneElementType,
  validateStudioCrdtPagePayload,
  validateStudioCrdtLayerGroupPayload,
  validateStudioCrdtSceneElementPayload,
  type StudioCrdtJsonObject,
  type StudioCrdtJsonValue,
  type StudioCrdtLayerGroupPayload,
  type StudioCrdtPagePayload,
  type StudioCrdtPayloadSceneElementType,
  type StudioCrdtSceneElementPayload,
  type StudioCrdtSceneElementType,
} from "./studio-crdt-scene-schema";
export const STUDIO_CRDT_STROKE_MAX_SAMPLES = 100_000;
export const STUDIO_CRDT_APPEND_MAX_SAMPLES = 4_096;
export const STUDIO_CRDT_REPLACE_CHUNK_SAMPLES = 256;
/** Inline CRDT metadata is intentionally small; large masks/assets must use an external reference. */
export const STUDIO_CRDT_METADATA_MAX_BYTES = 16 * 1024;
/**
 * Delete-wins observed-remove protocol roots. Each delete owns a unique, immutable operation ID;
 * explicit restore only acknowledges deletion IDs already visible to that peer.
 */
export const STUDIO_CRDT_DELETION_OPS_ROOT = "studio-deletion-ops";
export const STUDIO_CRDT_DELETION_ACKS_ROOT = "studio-deletion-acks";
export const STUDIO_CRDT_DELETION_OPERATION_MAX_ENTRIES = 100_000;
/**
 * Flat grow-only semantic raster roots. Values are canonical JSON strings rather than nested Yjs
 * objects so one immutable event is one atomic CRDT value and raster bytes never enter the doc.
 */
export {
  STUDIO_CRDT_RASTER_CHECKPOINTS_ROOT,
  STUDIO_CRDT_RASTER_MAX_CHECKPOINTS,
  STUDIO_CRDT_RASTER_MAX_REFERENCED_BYTES,
  STUDIO_CRDT_RASTER_MAX_SURFACES,
  STUDIO_CRDT_RASTER_OPERATIONS_ROOT,
  STUDIO_CRDT_RASTER_SURFACES_ROOT,
  STUDIO_CRDT_RASTER_UNDO_ACKS_ROOT,
  STUDIO_CRDT_RASTER_UNDO_OPERATIONS_ROOT,
} from "@/lib/studio-crdt-raster-document-contract";

const MAX_ID_LENGTH = 160;
const MAX_LAYER_GROUP_KEY_LENGTH = MAX_ID_LENGTH * 2 + 32;
const MAX_TEXT_LENGTH = 512;
const MAX_COORDINATE = 10_000_000;
const MAX_STROKE_WIDTH = 8_192;
const MAX_JSON_DEPTH = 10;
const MAX_JSON_ENTRIES = 4_096;
const MAX_JSON_STRING_LENGTH = 64 * 1024;
const MAX_ACTIVE_ORDER_ENTRIES_PER_STROKE = 256;
const MAX_DELETION_TARGET_LENGTH = MAX_ID_LENGTH * 2 + 64;
const BATCH_MIN_DELAY_MS = 30;
const BATCH_MAX_DELAY_MS = 50;
const DEFAULT_BATCH_DELAY_MS = 40;
const DEFAULT_BATCH_MAX_BYTES = 32 * 1024;
const TEXT_ENCODER = new TextEncoder();
const SCENE_ELEMENT_ROOT_PREFIX = "scene-element:";
const PAGE_ROOT_PREFIX = "studio-page:";
const LAYER_GROUP_ROOT_PREFIX = "layer-group:";
const PROPERTY_PREFIX = "prop:";
const BASELINE_PROPERTY_PREFIX = "base:";
const UNSET_PROPERTY_PREFIX = "unset:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RASTER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RASTER_SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
// A probe update starts at clock zero. Actual Yjs client/clock varuints can be a few bytes wider.
const RASTER_LOCAL_UPDATE_ENCODING_HEADROOM_BYTES = 64;

type StudioCrdtDeletionTarget =
  | { kind: "stroke"; id: string }
  | { kind: "scene"; id: string }
  | { kind: "page"; id: string }
  | { kind: "group"; pageId: string; id: string };

const SAMPLE_ARRAY_KEYS = [
  "points",
  "pressures",
  "tiltXs",
  "tiltYs",
  "twists",
  "speeds",
  "tangentialPressures",
] as const;

const JSON_PAYLOAD_KEYS = [
  "gradient",
  "pattern",
  "brushDynamics",
  "brushTip",
  "strokeStyle",
  "shapeParams",
  "symmetry",
  "extensions",
] as const;

const OPTIONAL_STRING_PAYLOAD_KEYS = ["fill", "brush", "blendMode"] as const;
const STROKE_PAYLOAD_KEYS = [
  "version", "type", "kind", "mode", "stroke", "strokeWidth", "opacity", "fill",
  "gradient", "pattern", "brush", "sampleSpacing", "brushDynamics", "brushTip",
  "strokeStyle", "shapeParams", "symmetry", "blendMode", "extensions", ...SAMPLE_ARRAY_KEYS,
] as const;

type StudioCrdtSampleArrayKey = (typeof SAMPLE_ARRAY_KEYS)[number];
type StudioCrdtStringPayloadKey = (typeof OPTIONAL_STRING_PAYLOAD_KEYS)[number];
export type StudioCrdtStrokePayloadKey = (typeof STROKE_PAYLOAD_KEYS)[number];

export interface StudioCrdtStrokeSamples {
  /** Flattened logical coordinates: [x0, y0, x1, y1, ...]. */
  points: number[];
  pressures?: number[];
  tiltXs?: number[];
  tiltYs?: number[];
  twists?: number[];
  speeds?: number[];
  tangentialPressures?: number[];
}

/** Versioned, JSON-safe representation of the complete StudioPage DrawEl surface. */
export interface StudioCrdtDrawStrokePayload extends StudioCrdtStrokeSamples {
  version: StudioCrdtStrokePayloadVersion;
  type: "draw";
  kind: string;
  mode: "pen" | "eraser";
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  fill?: string;
  gradient?: StudioCrdtJsonObject;
  pattern?: StudioCrdtJsonObject;
  brush?: string;
  sampleSpacing?: number;
  brushDynamics?: StudioCrdtJsonObject;
  brushTip?: StudioCrdtJsonObject;
  strokeStyle?: StudioCrdtJsonObject;
  shapeParams?: StudioCrdtJsonObject;
  symmetry?: StudioCrdtJsonObject;
  blendMode?: string;
  /** Future DrawEl/common-layer fields remain lossless without loosening the wire envelope. */
  extensions?: StudioCrdtJsonObject;
}

export interface StudioCrdtStrokeInput {
  id: string;
  pageId: string;
  layerId: string;
  payload: StudioCrdtDrawStrokePayload;
}

export interface StudioCrdtStrokeRecord extends StudioCrdtStrokeInput {
  status: "drawing" | "finalized";
  deleted: boolean;
  orderIndex: number;
}

/**
 * Small editable Studio objects use their bounded field payload. Asset-backed image/VRM/3D or
 * future element types use the wire-only `reference` payload; their source bytes intentionally
 * stay in project asset storage rather than entering a 48 KiB realtime operation.
 */
export interface StudioCrdtSceneElementInput {
  id: string;
  pageId: string;
  layerId: string;
  payload: StudioCrdtSceneElementPayload;
}

export interface StudioCrdtSceneElementRecord extends StudioCrdtSceneElementInput {
  deleted: boolean;
  orderIndex: number;
}

export interface StudioCrdtSceneElementQuery {
  pageId?: string;
  layerId?: string;
  includeDeleted?: boolean;
}

export interface StudioCrdtSceneElementPatch {
  pageId?: string;
  layerId?: string;
  set?: StudioCrdtJsonObject;
  unset?: readonly string[];
}

export interface StudioCrdtSceneElementUpsertOptions {
  beforeElementId?: string | null;
  resurrect?: boolean;
  /**
   * Legacy bootstrap contract. Every peer supplies the same previous snapshot as `baselineProps`
   * and only its actual local edits as `changedProps`. Baselines and edits use different Y.Map
   * keys, so simultaneous first registration of one legacy ID preserves independent field edits.
   */
  baselineProps?: StudioCrdtJsonObject;
  changedProps?: readonly string[];
  /** Optional baseline fields intentionally removed by this first local edit. */
  unsetProps?: readonly string[];
}

export interface StudioCrdtPageInput {
  id: string;
  payload: StudioCrdtPagePayload;
}

export interface StudioCrdtPageRecord extends StudioCrdtPageInput {
  deleted: boolean;
  orderIndex: number;
}

export interface StudioCrdtPagePatch {
  set?: StudioCrdtJsonObject;
  unset?: readonly string[];
}

export interface StudioCrdtPageUpsertOptions {
  beforePageId?: string | null;
  resurrect?: boolean;
  baselineProps?: StudioCrdtJsonObject;
  changedProps?: readonly string[];
  unsetProps?: readonly string[];
}

export interface StudioCrdtLayerGroupInput {
  id: string;
  pageId: string;
  payload: StudioCrdtLayerGroupPayload;
}

export interface StudioCrdtLayerGroupRecord extends StudioCrdtLayerGroupInput {
  deleted: boolean;
}

export interface StudioCrdtLayerGroupQuery {
  pageId?: string;
  includeDeleted?: boolean;
}

export interface StudioCrdtLayerGroupPatch {
  set?: StudioCrdtJsonObject;
  unset?: readonly string[];
}

export interface StudioCrdtLayerGroupUpsertOptions {
  resurrect?: boolean;
  baselineProps?: StudioCrdtJsonObject;
  changedProps?: readonly string[];
  unsetProps?: readonly string[];
}

export interface StudioCrdtStrokeQuery {
  pageId?: string;
  layerId?: string;
  includeDeleted?: boolean;
}

export interface StudioCrdtUpsertOptions {
  beforeStrokeId?: string | null;
  resurrect?: boolean;
  status?: StudioCrdtStrokeRecord["status"];
}

export interface StudioCrdtStrokePatch {
  pageId?: string;
  layerId?: string;
  /** Complete candidate payload; only `changedPayloadKeys` are written to the shared record. */
  payload?: StudioCrdtDrawStrokePayload;
  changedPayloadKeys?: readonly StudioCrdtStrokePayloadKey[];
}

export interface StudioCrdtChangeSummary {
  origin: unknown;
  local: boolean;
  /** Exact IDs touched by record/sample operations; order-only corruption may conservatively widen. */
  changedStrokeIds: ReadonlySet<string>;
  changedSceneElementIds: ReadonlySet<string>;
  changedPageIds: ReadonlySet<string>;
  changedLayerGroupIds: ReadonlySet<string>;
  /** Exact immutable raster identities touched by this transaction. */
  changedRasterSurfaceIds: ReadonlySet<string>;
  changedRasterOperationIds: ReadonlySet<string>;
  changedRasterUndoOperationIds: ReadonlySet<string>;
  changedRasterUndoAcknowledgementIds: ReadonlySet<string>;
  changedRasterCheckpointIds: ReadonlySet<string>;
}

export interface StudioCrdtChangeSnapshot {
  strokes: StudioCrdtStrokeRecord[];
  sceneElements: StudioCrdtSceneElementRecord[];
  pages: StudioCrdtPageRecord[];
  layerGroups: StudioCrdtLayerGroupRecord[];
  /** Only complete, exact-schema logs/checkpoints are materialized; malformed remote roots fail closed. */
  rasterOperationLogs: StudioRasterOperationLog[];
  rasterCheckpoints: StudioRasterCompactionCheckpoint[];
}

export const STUDIO_CRDT_CHANGE_SNAPSHOT_FIELDS = Object.freeze([
  "strokes",
  "sceneElements",
  "pages",
  "layerGroups",
  "rasterOperationLogs",
  "rasterCheckpoints",
] as const satisfies readonly (keyof StudioCrdtChangeSnapshot)[]);

export type StudioCrdtChangeSnapshotField =
  (typeof STUDIO_CRDT_CHANGE_SNAPSHOT_FIELDS)[number];
const STUDIO_CRDT_CHANGE_SNAPSHOT_FIELD_SET: ReadonlySet<string> =
  new Set(STUDIO_CRDT_CHANGE_SNAPSHOT_FIELDS);

/**
 * Backward-compatible complete transaction frontier. Every snapshot field is eagerly fixed while
 * the Yjs `afterTransaction` callback is still running and remains enumerable at the top level.
 */
export interface StudioCrdtChange extends StudioCrdtChangeSummary, StudioCrdtChangeSnapshot {}

/**
 * Explicitly projected transaction frontier. Unrequested snapshot fields are absent from both the
 * runtime `snapshot` object and its type instead of being represented by misleading empty arrays.
 */
export interface StudioCrdtProjectedChange<
  Fields extends readonly StudioCrdtChangeSnapshotField[] =
    readonly StudioCrdtChangeSnapshotField[]
> extends StudioCrdtChangeSummary {
  snapshotMode: "projected";
  snapshotFields: Readonly<Fields>;
  snapshot: Readonly<Pick<StudioCrdtChangeSnapshot, Fields[number]>>;
}

export interface StudioCrdtChangeSubscriptionOptions {
  /** Origin filtering happens before collecting the transaction summary. */
  includeOrigin?: (origin: unknown) => boolean;
  /** Summary filtering happens before any complete document frontier is materialized. */
  includeChange?: (summary: StudioCrdtChangeSummary) => boolean;
  /** Omitted for the backward-compatible complete transaction frontier. */
  snapshotFields?: undefined;
}

export type StudioCrdtProjectedChangeSubscriptionOptions<
  Fields extends readonly StudioCrdtChangeSnapshotField[] =
    readonly StudioCrdtChangeSnapshotField[]
> = Omit<StudioCrdtChangeSubscriptionOptions, "snapshotFields"> & {
  /** Only these fields are eagerly fixed at transaction time and exposed under `change.snapshot`. */
  snapshotFields: Fields;
};

export type StudioCrdtUpdateHandler = (update: Uint8Array, origin: unknown) => void;
export type StudioCrdtChangeHandler = (change: StudioCrdtChange) => void;
export type StudioCrdtProjectedChangeHandler<
  Fields extends readonly StudioCrdtChangeSnapshotField[] =
    readonly StudioCrdtChangeSnapshotField[]
> = (change: StudioCrdtProjectedChange<Fields>) => void;

export interface StudioCrdtBatchedUpdate {
  update: Uint8Array;
  origins: ReadonlySet<unknown>;
}

export interface StudioCrdtBatchOptions {
  delayMs?: number;
  maxBytes?: number;
  /** Local origins only by default, preventing received updates from being echoed to the server. */
  includeOrigin?: (origin: unknown) => boolean;
  setTimeout?: (handler: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface StudioCrdtBatchSubscription {
  flush(): void;
  unsubscribe(): void;
}

function defaultSetTimeout(handler: () => void, delay: number): unknown {
  return globalThis.setTimeout(handler, delay);
}

function defaultClearTimeout(handle: unknown): void {
  globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function exactText(value: unknown, maximum = MAX_TEXT_LENGTH): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return false;
  }
  return true;
}

function assertId(value: unknown, label: string): asserts value is string {
  if (!exactText(value, MAX_ID_LENGTH)) throw new Error(`${label} 식별자가 올바르지 않습니다.`);
}

function assertLayerGroupId(value: unknown): asserts value is string {
  assertId(value, "레이어 그룹");
  if (value === "page-root") throw new Error("page-root는 레이어 그룹 식별자로 사용할 수 없습니다.");
}

function assertFiniteRange(value: unknown, minimum: number, maximum: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} 값이 허용 범위를 벗어났습니다.`);
  }
}

function cloneAndValidateJson(
  value: StudioCrdtJsonValue,
  state = { entries: 0 },
  depth = 0
): StudioCrdtJsonValue {
  if (depth > MAX_JSON_DEPTH || ++state.entries > MAX_JSON_ENTRIES) {
    throw new Error("획 확장 데이터가 허용 범위를 벗어났습니다.");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("획 확장 데이터에 유한하지 않은 수가 있습니다.");
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING_LENGTH) throw new Error("획 확장 문자열이 너무 깁니다.");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneAndValidateJson(item, state, depth + 1));
  }
  if (typeof value !== "object") throw new Error("획 확장 데이터는 JSON 형식이어야 합니다.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("획 확장 데이터는 일반 JSON 객체여야 합니다.");
  }
  const result: StudioCrdtJsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (!exactText(key, MAX_TEXT_LENGTH)) throw new Error("획 확장 데이터 키가 올바르지 않습니다.");
    result[key] = cloneAndValidateJson(item, state, depth + 1);
  }
  return result;
}

function cloneJsonObject(value: StudioCrdtJsonObject): StudioCrdtJsonObject {
  const cloned = cloneAndValidateJson(value);
  if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
    throw new Error("획 확장 데이터는 JSON 객체여야 합니다.");
  }
  return cloned;
}

function sceneElementRootName(id: string): string {
  return `${SCENE_ELEMENT_ROOT_PREFIX}${encodeURIComponent(id)}`;
}

function pageRootName(id: string): string {
  return `${PAGE_ROOT_PREFIX}${encodeURIComponent(id)}`;
}

function layerGroupRootName(compositeKey: string): string {
  return `${LAYER_GROUP_ROOT_PREFIX}${encodeURIComponent(compositeKey)}`;
}

function encodeDeletionTarget(target: StudioCrdtDeletionTarget): string {
  return target.kind === "group"
    ? JSON.stringify([target.kind, target.pageId, target.id])
    : JSON.stringify([target.kind, target.id]);
}

function strokeDeletionTarget(id: string): string {
  return encodeDeletionTarget({ kind: "stroke", id });
}

function sceneDeletionTarget(id: string): string {
  return encodeDeletionTarget({ kind: "scene", id });
}

function pageDeletionTarget(id: string): string {
  return encodeDeletionTarget({ kind: "page", id });
}

function layerGroupDeletionTarget(pageId: string, id: string): string {
  return encodeDeletionTarget({ kind: "group", pageId, id });
}

function parseDeletionTarget(value: unknown): StudioCrdtDeletionTarget | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_DELETION_TARGET_LENGTH) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    if (
      parsed.length === 2 &&
      (parsed[0] === "stroke" || parsed[0] === "scene" || parsed[0] === "page") &&
      exactText(parsed[1], MAX_ID_LENGTH)
    ) {
      const target = { kind: parsed[0], id: parsed[1] } satisfies StudioCrdtDeletionTarget;
      return encodeDeletionTarget(target) === value ? target : null;
    }
    if (
      parsed.length === 3 &&
      parsed[0] === "group" &&
      exactText(parsed[1], MAX_ID_LENGTH) &&
      exactText(parsed[2], MAX_ID_LENGTH) &&
      parsed[2] !== "page-root"
    ) {
      const target = {
        kind: "group",
        pageId: parsed[1],
        id: parsed[2],
      } satisfies StudioCrdtDeletionTarget;
      return encodeDeletionTarget(target) === value ? target : null;
    }
  } catch {
    // Untrusted remote documents are read defensively; the API rejects malformed protocol roots.
  }
  return null;
}

function createDeletionOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("삭제 작업 식별자를 안전하게 생성할 수 없습니다.");
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function propertyKey(prefix: typeof PROPERTY_PREFIX | typeof BASELINE_PROPERTY_PREFIX, key: string): string {
  return `${prefix}${key}`;
}

function readCrdtProperties(record: Y.Map<unknown>): StudioCrdtJsonObject {
  const result: StudioCrdtJsonObject = {};
  let encodedKeyCount = 0;
  for (const key of record.keys()) {
    if (
      key.startsWith(BASELINE_PROPERTY_PREFIX) || key.startsWith(PROPERTY_PREFIX) ||
      key.startsWith(UNSET_PROPERTY_PREFIX)
    ) {
      encodedKeyCount += 1;
      if (encodedKeyCount > 256) throw new Error("CRDT 요소 속성 수가 허용 범위를 초과했습니다.");
    }
  }
  for (const [key, value] of record) {
    if (!key.startsWith(BASELINE_PROPERTY_PREFIX)) continue;
    const property = key.slice(BASELINE_PROPERTY_PREFIX.length);
    const cloned = cloneAndValidateJson(value as StudioCrdtJsonValue);
    result[property] = cloned;
  }
  for (const [key, value] of record) {
    if (!key.startsWith(PROPERTY_PREFIX)) continue;
    const property = key.slice(PROPERTY_PREFIX.length);
    const cloned = cloneAndValidateJson(value as StudioCrdtJsonValue);
    result[property] = cloned;
  }
  for (const [key, value] of record) {
    if (!key.startsWith(UNSET_PROPERTY_PREFIX) || value !== true) continue;
    delete result[key.slice(UNSET_PROPERTY_PREFIX.length)];
  }
  return result;
}

function setCrdtProperties(
  record: Y.Map<unknown>,
  prefix: typeof PROPERTY_PREFIX | typeof BASELINE_PROPERTY_PREFIX,
  props: StudioCrdtJsonObject,
  keys: readonly string[] = Object.keys(props)
): void {
  for (const key of keys) {
    if (!(key in props)) continue;
    record.set(propertyKey(prefix, key), cloneAndValidateJson(props[key]!));
    if (prefix === PROPERTY_PREFIX) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, false);
  }
}

function validateUnsetKeys(
  keys: readonly string[],
  allowed: ReadonlySet<string>,
  required: readonly string[]
): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (!exactText(key, MAX_TEXT_LENGTH) || !allowed.has(key) || seen.has(key)) {
      throw new Error("동기화에서 제거할 속성이 올바르지 않습니다.");
    }
    if (required.includes(key)) throw new Error(`${key} 필수 속성은 제거할 수 없습니다.`);
    seen.add(key);
  }
}

function payloadMetadataByteLength(payload: StudioCrdtDrawStrokePayload): number {
  const metadata: Record<string, unknown> = {
    version: payload.version,
    type: payload.type,
    kind: payload.kind,
    mode: payload.mode,
    stroke: payload.stroke,
    strokeWidth: payload.strokeWidth,
  };
  if (payload.opacity !== undefined) metadata.opacity = payload.opacity;
  if (payload.sampleSpacing !== undefined) metadata.sampleSpacing = payload.sampleSpacing;
  for (const key of OPTIONAL_STRING_PAYLOAD_KEYS) {
    if (payload[key] !== undefined) metadata[key] = payload[key];
  }
  for (const key of JSON_PAYLOAD_KEYS) {
    if (payload[key] !== undefined) metadata[key] = payload[key];
  }
  return TEXT_ENCODER.encode(JSON.stringify(metadata)).byteLength;
}

function sampleCount(samples: StudioCrdtStrokeSamples, allowEmpty: boolean): number {
  if (
    !Array.isArray(samples.points) ||
    samples.points.length % 2 !== 0 ||
    (!allowEmpty && samples.points.length === 0)
  ) {
    throw new Error("획 좌표는 x/y가 정렬된 쌍이어야 합니다.");
  }
  const count = samples.points.length / 2;
  if (count > STUDIO_CRDT_STROKE_MAX_SAMPLES) throw new Error("획 샘플 수가 너무 많습니다.");
  for (const coordinate of samples.points) {
    assertFiniteRange(coordinate, -MAX_COORDINATE, MAX_COORDINATE, "획 좌표");
  }
  const aligned = [
    samples.pressures,
    samples.tiltXs,
    samples.tiltYs,
    samples.twists,
    samples.speeds,
    samples.tangentialPressures,
  ];
  for (const values of aligned) {
    if (values !== undefined && (!Array.isArray(values) || values.length !== count)) {
      throw new Error("획 포인터 메타데이터가 좌표 샘플과 정렬되지 않았습니다.");
    }
  }
  for (const pressure of samples.pressures ?? []) assertFiniteRange(pressure, 0, 1, "필압");
  for (const tilt of samples.tiltXs ?? []) assertFiniteRange(tilt, -90, 90, "가로 틸트");
  for (const tilt of samples.tiltYs ?? []) assertFiniteRange(tilt, -90, 90, "세로 틸트");
  for (const twist of samples.twists ?? []) assertFiniteRange(twist, 0, 359, "펜 회전");
  for (const speed of samples.speeds ?? []) assertFiniteRange(speed, 0, 1_000_000, "포인터 속도");
  for (const pressure of samples.tangentialPressures ?? []) {
    assertFiniteRange(pressure, -1, 1, "배럴 압력");
  }
  return count;
}

function normalizedSamples(
  samples: StudioCrdtStrokeSamples,
  allowEmpty: boolean,
  storedPressureModel?: StudioInkPressureModel
) {
  const count = sampleCount(samples, allowEmpty);
  const extensions = "extensions" in samples && samples.extensions
    && typeof samples.extensions === "object"
    && !Array.isArray(samples.extensions)
    ? samples.extensions
    : undefined;
  const pressureModelValue = extensions && "pressureModel" in extensions
    ? extensions.pressureModel
    : undefined;
  const pressureModel = storedPressureModel ?? (isStudioInkPressureModel(pressureModelValue)
    ? pressureModelValue
    : undefined);
  return {
    points: [...samples.points],
    pressures: [
      ...(samples.pressures ?? Array<number>(count).fill(studioInkFallbackPressure(pressureModel))),
    ],
    tiltXs: [...(samples.tiltXs ?? Array<number>(count).fill(0))],
    tiltYs: [...(samples.tiltYs ?? Array<number>(count).fill(0))],
    twists: [...(samples.twists ?? Array<number>(count).fill(0))],
    speeds: [...(samples.speeds ?? Array<number>(count).fill(0))],
    tangentialPressures: [
      ...(samples.tangentialPressures ?? Array<number>(count).fill(0)),
    ],
  } satisfies Record<StudioCrdtSampleArrayKey, number[]>;
}

function validatePayload(payload: StudioCrdtDrawStrokePayload, allowEmpty: boolean): void {
  if (
    (payload.version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
      && payload.version !== STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION)
    || payload.type !== "draw"
  ) {
    throw new Error("지원하지 않는 획 페이로드 버전입니다.");
  }
  if (!exactText(payload.kind, 80)) throw new Error("획 종류가 올바르지 않습니다.");
  if (payload.mode !== "pen" && payload.mode !== "eraser") {
    throw new Error("획 합성 모드가 올바르지 않습니다.");
  }
  if (!exactText(payload.stroke, 256)) throw new Error("획 색상이 올바르지 않습니다.");
  assertFiniteRange(payload.strokeWidth, 0.01, MAX_STROKE_WIDTH, "획 굵기");
  if (payload.opacity !== undefined) assertFiniteRange(payload.opacity, 0, 1, "불투명도");
  if (payload.sampleSpacing !== undefined) {
    // Zero is the intentional fixed-rate contract: the 5 ms input filter already owns thinning,
    // so the renderer must not apply a second distance gate. Undefined still identifies legacy
    // geometry; a finite zero therefore cannot be normalized away or rejected at the wire edge.
    assertFiniteRange(payload.sampleSpacing, 0, MAX_STROKE_WIDTH, "샘플 간격");
  }
  for (const key of OPTIONAL_STRING_PAYLOAD_KEYS) {
    const value = payload[key];
    if (value !== undefined && !exactText(value, 512)) {
      throw new Error(`${key} 값이 올바르지 않습니다.`);
    }
  }
  for (const key of JSON_PAYLOAD_KEYS) {
    const value = payload[key];
    if (value !== undefined) cloneJsonObject(value);
  }
  const paintModel = payload.extensions?.paintModel;
  if (
    paintModel !== undefined
    && (
      payload.version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
      || !isStudioStrokePaintModelCompatible({
        ...payload,
        paintModel,
        pressureModel: payload.extensions?.pressureModel,
        stampPipeline: payload.extensions?.stampPipeline,
        watercolorPipeline: payload.extensions?.watercolorPipeline,
      })
    )
  ) {
    throw new Error("획 페인트 모델과 브러시 합성 모드가 호환되지 않습니다.");
  }
  if (payloadMetadataByteLength(payload) > STUDIO_CRDT_METADATA_MAX_BYTES) {
    throw new Error(
      "획 메타데이터가 실시간 동기화 한도를 초과했습니다. 큰 마스크와 자산은 외부 참조로 저장해 주세요."
    );
  }
  sampleCount(payload, allowEmpty);
}

function yArray(record: Y.Map<unknown>, key: StudioCrdtSampleArrayKey): Y.Array<number> | null {
  const value = record.get(key);
  return value instanceof Y.Array ? (value as Y.Array<number>) : null;
}

function readString(record: Y.Map<unknown>, key: string): string | null {
  const value = record.get(key);
  return typeof value === "string" ? value : null;
}

function readNumber(record: Y.Map<unknown>, key: string): number | null {
  const value = record.get(key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readJsonObject(record: Y.Map<unknown>, key: string): StudioCrdtJsonObject | undefined {
  const value = record.get(key);
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    return cloneJsonObject(value as StudioCrdtJsonObject);
  } catch {
    return undefined;
  }
}

function createSampleArray(values: readonly number[]): Y.Array<number> {
  const result = new Y.Array<number>();
  if (values.length > 0) result.push([...values]);
  return result;
}

function setOptionalRecordValue(
  record: Y.Map<unknown>,
  key: StudioCrdtStringPayloadKey | "opacity" | "sampleSpacing",
  value: string | number | undefined
): void {
  if (value === undefined) record.delete(key);
  else record.set(key, value);
}

function setPayloadMetadata(record: Y.Map<unknown>, payload: StudioCrdtDrawStrokePayload): void {
  record.set("payloadVersion", payload.version);
  record.set("type", payload.type);
  record.set("kind", payload.kind);
  record.set("mode", payload.mode);
  record.set("stroke", payload.stroke);
  record.set("strokeWidth", payload.strokeWidth);
  setOptionalRecordValue(record, "opacity", payload.opacity);
  setOptionalRecordValue(record, "sampleSpacing", payload.sampleSpacing);
  for (const key of OPTIONAL_STRING_PAYLOAD_KEYS) setOptionalRecordValue(record, key, payload[key]);
  for (const key of JSON_PAYLOAD_KEYS) {
    const value = payload[key];
    if (value === undefined) record.delete(key);
    else record.set(key, cloneJsonObject(value));
  }
}

function setPayloadMetadataField(
  record: Y.Map<unknown>,
  payload: StudioCrdtDrawStrokePayload,
  key: Exclude<StudioCrdtStrokePayloadKey, StudioCrdtSampleArrayKey>
): void {
  if (key === "version") record.set("payloadVersion", payload.version);
  else if (key === "type") record.set("type", payload.type);
  else if (key === "kind") record.set("kind", payload.kind);
  else if (key === "mode") record.set("mode", payload.mode);
  else if (key === "stroke") record.set("stroke", payload.stroke);
  else if (key === "strokeWidth") record.set("strokeWidth", payload.strokeWidth);
  else if (key === "opacity" || key === "sampleSpacing") {
    setOptionalRecordValue(record, key, payload[key]);
  } else if ((OPTIONAL_STRING_PAYLOAD_KEYS as readonly string[]).includes(key)) {
    const stringKey = key as StudioCrdtStringPayloadKey;
    setOptionalRecordValue(record, stringKey, payload[stringKey]);
  } else {
    const jsonKey = key as (typeof JSON_PAYLOAD_KEYS)[number];
    const value = payload[jsonKey];
    if (value === undefined) record.delete(jsonKey);
    else record.set(jsonKey, cloneJsonObject(value));
  }
}

function mergeStrokePayloadFields(
  current: StudioCrdtDrawStrokePayload,
  next: StudioCrdtDrawStrokePayload,
  changedKeys: readonly StudioCrdtStrokePayloadKey[]
): StudioCrdtDrawStrokePayload {
  const merged = { ...current } as Record<string, unknown>;
  for (const key of changedKeys) {
    const value = next[key];
    if (value === undefined) {
      delete merged[key];
    } else if (Array.isArray(value)) {
      merged[key] = [...value];
    } else if (value !== null && typeof value === "object") {
      merged[key] = cloneJsonObject(value as StudioCrdtJsonObject);
    } else {
      merged[key] = value;
    }
  }
  return merged as unknown as StudioCrdtDrawStrokePayload;
}

function readPayload(record: Y.Map<unknown>): StudioCrdtDrawStrokePayload | null {
  const version = record.get("payloadVersion");
  const type = record.get("type");
  const kind = readString(record, "kind");
  const mode = record.get("mode");
  const stroke = readString(record, "stroke");
  const strokeWidth = readNumber(record, "strokeWidth");
  const sharedArrays = Object.fromEntries(
    SAMPLE_ARRAY_KEYS.map((key) => [key, yArray(record, key)])
  ) as Record<StudioCrdtSampleArrayKey, Y.Array<number> | null>;
  const pointsLength = sharedArrays.points?.length ?? -1;
  const count = pointsLength / 2;
  if (
    (version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION
      && version !== STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION) ||
    type !== "draw" ||
    !kind ||
    (mode !== "pen" && mode !== "eraser") ||
    !stroke ||
    strokeWidth === null ||
    SAMPLE_ARRAY_KEYS.some((key) => sharedArrays[key] === null) ||
    pointsLength < 0 ||
    pointsLength % 2 !== 0 ||
    count > STUDIO_CRDT_STROKE_MAX_SAMPLES ||
    SAMPLE_ARRAY_KEYS.slice(1).some((key) => sharedArrays[key]!.length !== count)
  ) {
    return null;
  }
  const arrays = Object.fromEntries(
    SAMPLE_ARRAY_KEYS.map((key) => [key, sharedArrays[key]!.toArray()])
  ) as Record<StudioCrdtSampleArrayKey, number[]>;
  const payload: StudioCrdtDrawStrokePayload = {
    version,
    type,
    kind,
    mode,
    stroke,
    strokeWidth,
    points: arrays.points,
    pressures: arrays.pressures,
    tiltXs: arrays.tiltXs,
    tiltYs: arrays.tiltYs,
    twists: arrays.twists,
    speeds: arrays.speeds,
    tangentialPressures: arrays.tangentialPressures,
  };
  const opacity = readNumber(record, "opacity");
  const sampleSpacing = readNumber(record, "sampleSpacing");
  if (opacity !== null) payload.opacity = opacity;
  if (sampleSpacing !== null) payload.sampleSpacing = sampleSpacing;
  for (const key of OPTIONAL_STRING_PAYLOAD_KEYS) {
    const value = readString(record, key);
    if (value !== null) payload[key] = value;
  }
  for (const key of JSON_PAYLOAD_KEYS) {
    const value = readJsonObject(record, key);
    if (value !== undefined) payload[key] = value;
  }
  try {
    validatePayload(payload, true);
    return payload;
  } catch {
    return null;
  }
}

/** strokeRecordCache 등에 저장하기 전 레코드를 얼린다 — 캐시된 레코드는 get*() 호출마다 다시
 * 디코딩되지 않고 여러 호출에서 재사용되므로, 호출자가 실수로 내부(payload/props 등)를 제자리
 * 수정하면 캐시가 조용히 오염된다. lib/studio-crdt-raster-ops.ts 의 deepFreeze 와 동일한 관례. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function orderEntryValue(entry: unknown, key: string): string | null {
  if (!(entry instanceof Y.Map)) return null;
  const value = entry.get(key);
  return typeof value === "string" ? value : null;
}

function sceneOrderEntryId(entry: unknown): string | null {
  return orderEntryValue(entry, "elementId");
}

function pageOrderEntryId(entry: unknown): string | null {
  return orderEntryValue(entry, "pageId");
}

function mixedOrderEntryId(entry: unknown): string | null {
  return orderEntryValue(entry, "strokeId") ?? sceneOrderEntryId(entry);
}

function isRasterPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactRasterKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRasterPlainRecord(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function parseCanonicalRasterJson(value: unknown): unknown | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return canonicalStudioRasterJson(parsed) === value ? parsed : null;
  } catch {
    return null;
  }
}

function rasterEnvelopeSurfaceId(value: unknown): string | null {
  const parsed = parseCanonicalRasterJson(value);
  if (!hasExactRasterKeys(parsed, ["surfaceId", "operation"]) &&
      !hasExactRasterKeys(parsed, ["surfaceId", "undoOperation"]) &&
      !hasExactRasterKeys(parsed, ["surfaceId", "acknowledgement"])) {
    return null;
  }
  return typeof parsed.surfaceId === "string" && RASTER_SAFE_ID_PATTERN.test(parsed.surfaceId)
    ? parsed.surfaceId
    : null;
}

function rasterCheckpointSurfaceId(value: unknown): string | null {
  const parsed = parseCanonicalRasterJson(value);
  if (!isRasterPlainRecord(parsed) || !isRasterPlainRecord(parsed.surface)) return null;
  const surfaceId = parsed.surface.surfaceId;
  return typeof surfaceId === "string" && RASTER_SAFE_ID_PATTERN.test(surfaceId)
    ? surfaceId
    : null;
}

function assertRasterSafeId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > MAX_ID_LENGTH ||
    !RASTER_SAFE_ID_PATTERN.test(value)
  ) {
    throw new Error(`${label} 식별자가 올바르지 않습니다.`);
  }
}

interface StudioCrdtRasterMutation {
  readonly surface?: { readonly id: string; readonly value: string };
  readonly operations?: readonly { readonly id: string; readonly value: string }[];
  readonly undoOperations?: readonly { readonly id: string; readonly value: string }[];
  readonly undoAcknowledgements?: readonly { readonly id: string; readonly value: string }[];
}

function addRasterAsset(
  assets: Map<string, StudioRasterAssetReference>,
  asset: StudioRasterAssetReference,
  label: string
): number {
  const existing = assets.get(asset.assetId);
  if (existing) {
    if (canonicalStudioRasterJson(existing) !== canonicalStudioRasterJson(asset)) {
      throw new Error(`${label}: 같은 assetId가 서로 다른 불변 자산을 가리킵니다.`);
    }
    return 0;
  }
  assets.set(asset.assetId, asset);
  return asset.byteLength;
}

export function mergeStudioCrdtUpdates(updates: readonly Uint8Array[]): Uint8Array {
  if (updates.length === 0) throw new Error("병합할 CRDT 업데이트가 없습니다.");
  return updates.length === 1 ? updates[0].slice() : Y.mergeUpdates([...updates]);
}

/**
 * Y.Map records hold stroke metadata while nested Y.Arrays append pointer samples incrementally.
 * A single root Y.Array provides deterministic cross-client compositing order, including erasers.
 */
export class StudioCrdtDocument {
  private readonly doc: Y.Doc;
  private readonly strokes: Y.Map<Y.Map<unknown>>;
  private readonly sceneElementIds: Y.Map<boolean>;
  private readonly pageIds: Y.Map<boolean>;
  private readonly layerGroupIds: Y.Map<boolean>;
  private readonly order: Y.Array<Y.Map<unknown>>;
  private readonly pageOrder: Y.Array<Y.Map<unknown>>;
  private readonly deletionOps: Y.Map<string>;
  private readonly deletionAcks: Y.Map<string>;
  private readonly rasterSurfaces: Y.Map<string>;
  private readonly rasterOperations: Y.Map<string>;
  private readonly rasterUndoOperations: Y.Map<string>;
  private readonly rasterUndoAcknowledgements: Y.Map<string>;
  private readonly rasterCheckpoints: Y.Map<string>;
  private readonly deletionOpIdsByTarget = new Map<string, Set<string>>();
  private readonly cleanup = new Set<() => void>();
  private readonly strokeIdByType = new WeakMap<object, string>();
  private readonly changedStrokeIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedSceneElementIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedPageIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedLayerGroupIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedRasterSurfaceIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedRasterOperationIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedRasterUndoOperationIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedRasterUndoAcknowledgementIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private readonly changedRasterCheckpointIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  // subscribeChanges/get*() 호출마다 전체 문서를 다시 스캔하지 않도록, id별로 디코딩된 레코드를
  // 캐시한다. orderIndex는 캐시에 포함하지 않는다(순서는 다른 항목의 삽입/삭제로도 바뀌므로 get*()
  // 호출마다 order 배열에서 새로 계산한다). 갱신은 지연(lazy) 방식이다 — afterTransaction 리스너
  // (reconcileRecordCaches, 생성자 맨 끝에서 등록)는 changed*IdsByTransaction 을 dirty*Ids 집합에
  // 옮겨 담기만 할 뿐 그 자리에서 재디코딩하지 않는다(트랜잭션당 Set.add 몇 번뿐이라 사실상 공짜).
  // 실제 디코딩(readPayload 의 Y.Array.toArray() + deepFreeze)은 get*() 호출 시작에서 drainDirty*Ids
  // 가 수행한다 — 한 획을 라이브로 그리는 동안 appendStrokeSamples 가 로컬 트랜잭션을 수십~수백 번
  // 만들어도(포인터 이동마다 1개), 그 사이 아무도 get*() 를 호출하지 않으면 재디코딩은 0번, 마지막에
  // 실제로 읽힐 때 딱 1번만 일어난다 — eager 버전은 트랜잭션마다 매번 전체 샘플 배열을 다시 디코딩·
  // 동결해 라이브 드로잉 경로에 없던 비용을 새로 만들어냈다(리뷰에서 확인된 실측 회귀).
  private readonly strokeRecordCache = new Map<string, StudioCrdtStrokeRecord | null>();
  private readonly sceneElementRecordCache = new Map<string, StudioCrdtSceneElementRecord | null>();
  private readonly pageRecordCache = new Map<string, StudioCrdtPageRecord | null>();
  private readonly layerGroupRecordCache = new Map<string, StudioCrdtLayerGroupRecord | null>();
  private readonly dirtyStrokeIds = new Set<string>();
  private readonly dirtySceneElementIds = new Set<string>();
  private readonly dirtyPageIds = new Set<string>();
  private readonly dirtyLayerGroupIds = new Set<string>();
  private readonly observedSceneElementRoots = new Set<string>();
  private readonly observedPageRoots = new Set<string>();
  private readonly observedLayerGroupRoots = new Set<string>();
  private destroyed = false;

  constructor(initialUpdate?: Uint8Array | string) {
    this.doc = new Y.Doc();
    this.strokes = this.doc.getMap<Y.Map<unknown>>("strokes");
    this.sceneElementIds = this.doc.getMap<boolean>("scene-elements");
    this.pageIds = this.doc.getMap<boolean>("studio-pages");
    this.layerGroupIds = this.doc.getMap<boolean>("layer-groups");
    this.order = this.doc.getArray<Y.Map<unknown>>("stroke-order");
    this.pageOrder = this.doc.getArray<Y.Map<unknown>>("page-order");
    this.deletionOps = this.doc.getMap<string>(STUDIO_CRDT_DELETION_OPS_ROOT);
    this.deletionAcks = this.doc.getMap<string>(STUDIO_CRDT_DELETION_ACKS_ROOT);
    this.rasterSurfaces = this.doc.getMap<string>(STUDIO_CRDT_RASTER_SURFACES_ROOT);
    this.rasterOperations = this.doc.getMap<string>(STUDIO_CRDT_RASTER_OPERATIONS_ROOT);
    this.rasterUndoOperations = this.doc.getMap<string>(STUDIO_CRDT_RASTER_UNDO_OPERATIONS_ROOT);
    this.rasterUndoAcknowledgements = this.doc.getMap<string>(STUDIO_CRDT_RASTER_UNDO_ACKS_ROOT);
    this.rasterCheckpoints = this.doc.getMap<string>(STUDIO_CRDT_RASTER_CHECKPOINTS_ROOT);
    if (initialUpdate !== undefined) {
      const decoded =
        typeof initialUpdate === "string" ? decodeStudioCrdtUpdate(initialUpdate) : initialUpdate;
      Y.applyUpdate(this.doc, decoded, STUDIO_CRDT_ORIGIN_SYNC);
    }
    for (const [id, value] of this.strokes) this.registerRecord(id, value);
    for (const value of this.order) this.registerOrderEntry(value);
    for (const [id, active] of this.sceneElementIds) {
      if (active === true) this.observeSceneElementRoot(id);
    }
    for (const [id, active] of this.pageIds) {
      if (active === true) this.observePageRoot(id);
    }
    for (const [compositeKey, active] of this.layerGroupIds) {
      if (active === true) this.observeLayerGroupRoot(compositeKey);
    }
    for (const [operationId, target] of this.deletionOps) {
      this.indexDeletionOperation(operationId, target);
    }
    for (const [id] of this.strokes) this.refreshStrokeRecordCache(id);
    for (const [id, active] of this.sceneElementIds) {
      if (active === true) this.refreshSceneElementRecordCache(id);
    }
    for (const [id, active] of this.pageIds) {
      if (active === true) this.refreshPageRecordCache(id);
    }
    for (const [compositeKey, active] of this.layerGroupIds) {
      if (active === true) this.refreshLayerGroupRecordCache(compositeKey);
    }

    const observeStrokes: Parameters<typeof this.strokes.observeDeep>[0] = (events, transaction) => {
      const changedIds = this.changedIdsFor(transaction);
      for (const event of events) {
        const knownId = this.strokeIdByType.get(event.target);
        if (knownId) changedIds.add(knownId);
        if (event.target !== this.strokes || !(event instanceof Y.YMapEvent)) continue;
        for (const key of event.keysChanged) {
          if (typeof key !== "string" || !exactText(key, MAX_ID_LENGTH)) continue;
          changedIds.add(key);
          this.registerRecord(key, this.strokes.get(key));
        }
      }
    };
    const observeOrder: Parameters<typeof this.order.observeDeep>[0] = (events, transaction) => {
      const changedStrokeIds = this.changedIdsFor(transaction);
      const changedSceneElementIds = this.changedSceneElementIdsFor(transaction);
      for (const event of events) {
        const knownId = this.strokeIdByType.get(event.target);
        if (knownId) changedStrokeIds.add(knownId);
        if (event.target instanceof Y.Map) {
          const strokeId = orderEntryValue(event.target, "strokeId");
          const elementId = sceneOrderEntryId(event.target);
          if (strokeId) {
            changedStrokeIds.add(strokeId);
            this.registerOrderEntry(event.target);
          }
          if (elementId) changedSceneElementIds.add(elementId);
        }
        if (event.target !== this.order || !(event instanceof Y.YArrayEvent)) continue;
        let deletedUnknownEntry = false;
        for (const delta of event.changes.delta) {
          if (delta.delete) deletedUnknownEntry = true;
          if (!Array.isArray(delta.insert)) continue;
          for (const value of delta.insert) {
            const strokeId = orderEntryValue(value, "strokeId");
            const elementId = sceneOrderEntryId(value);
            if (strokeId) changedStrokeIds.add(strokeId);
            if (elementId) changedSceneElementIds.add(elementId);
            this.registerOrderEntry(value);
          }
        }
        if (deletedUnknownEntry) {
          // Production operations tombstone entries instead of deleting them. For an untrusted
          // structural delete, all surviving indices may have shifted, so widening is safest.
          for (const value of this.order) {
            const strokeId = orderEntryValue(value, "strokeId");
            const elementId = sceneOrderEntryId(value);
            if (strokeId) changedStrokeIds.add(strokeId);
            if (elementId) changedSceneElementIds.add(elementId);
          }
        }
      }
    };
    const observeSceneElementIds = (event: Y.YMapEvent<boolean>, transaction: Y.Transaction) => {
      const changedIds = this.changedSceneElementIdsFor(transaction);
      for (const id of event.keysChanged) {
        if (!exactText(id, MAX_ID_LENGTH)) continue;
        changedIds.add(id);
        if (this.sceneElementIds.get(id) === true) this.observeSceneElementRoot(id);
      }
    };
    const observePageIds = (event: Y.YMapEvent<boolean>, transaction: Y.Transaction) => {
      const changedIds = this.changedPageIdsFor(transaction);
      for (const id of event.keysChanged) {
        if (!exactText(id, MAX_ID_LENGTH)) continue;
        changedIds.add(id);
        if (this.pageIds.get(id) === true) this.observePageRoot(id);
      }
    };
    const observeLayerGroupIds = (event: Y.YMapEvent<boolean>, transaction: Y.Transaction) => {
      const changedIds = this.changedLayerGroupIdsFor(transaction);
      for (const compositeKey of event.keysChanged) {
        if (!exactText(compositeKey, MAX_LAYER_GROUP_KEY_LENGTH)) continue;
        changedIds.add(compositeKey);
        if (this.layerGroupIds.get(compositeKey) === true) {
          this.observeLayerGroupRoot(compositeKey);
        }
      }
    };
    const observePageOrder: Parameters<typeof this.pageOrder.observeDeep>[0] = (events, transaction) => {
      const changedIds = this.changedPageIdsFor(transaction);
      for (const event of events) {
        if (event.target instanceof Y.Map) {
          const id = pageOrderEntryId(event.target);
          if (id) changedIds.add(id);
        }
        if (event.target !== this.pageOrder || !(event instanceof Y.YArrayEvent)) continue;
        let deletedUnknownEntry = false;
        for (const delta of event.changes.delta) {
          if (delta.delete) deletedUnknownEntry = true;
          if (!Array.isArray(delta.insert)) continue;
          for (const value of delta.insert) {
            const id = pageOrderEntryId(value);
            if (id) changedIds.add(id);
          }
        }
        if (deletedUnknownEntry) {
          for (const value of this.pageOrder) {
            const id = pageOrderEntryId(value);
            if (id) changedIds.add(id);
          }
        }
      }
    };
    const observeDeletionOps = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      for (const operationId of event.keysChanged) {
        const oldValue = event.changes.keys.get(operationId)?.oldValue;
        if (typeof oldValue === "string") {
          this.unindexDeletionOperation(operationId, oldValue);
          this.markDeletionTargetChanged(oldValue, transaction);
        }
        const target = this.deletionOps.get(operationId);
        if (typeof target === "string") {
          this.indexDeletionOperation(operationId, target);
          this.markDeletionTargetChanged(target, transaction);
        }
      }
    };
    const observeDeletionAcks = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      for (const operationId of event.keysChanged) {
        const oldValue = event.changes.keys.get(operationId)?.oldValue;
        if (typeof oldValue === "string") this.markDeletionTargetChanged(oldValue, transaction);
        const target = this.deletionAcks.get(operationId);
        if (typeof target === "string") this.markDeletionTargetChanged(target, transaction);
      }
    };
    const markRasterEnvelopeSurfaces = (
      currentValue: unknown,
      oldValue: unknown,
      transaction: Y.Transaction,
      checkpoint = false
    ) => {
      const changedSurfaceIds = this.changedRasterSurfaceIdsFor(transaction);
      const parse = checkpoint ? rasterCheckpointSurfaceId : rasterEnvelopeSurfaceId;
      const currentSurfaceId = parse(currentValue);
      const oldSurfaceId = parse(oldValue);
      if (currentSurfaceId) changedSurfaceIds.add(currentSurfaceId);
      if (oldSurfaceId) changedSurfaceIds.add(oldSurfaceId);
    };
    const observeRasterSurfaces = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      const changedIds = this.changedRasterSurfaceIdsFor(transaction);
      for (const surfaceId of event.keysChanged) {
        if (RASTER_SAFE_ID_PATTERN.test(surfaceId) && surfaceId.length <= MAX_ID_LENGTH) {
          changedIds.add(surfaceId);
        }
      }
    };
    const observeRasterOperations = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      const changedIds = this.changedRasterOperationIdsFor(transaction);
      for (const operationId of event.keysChanged) {
        if (RASTER_UUID_PATTERN.test(operationId)) changedIds.add(operationId);
        markRasterEnvelopeSurfaces(
          this.rasterOperations.get(operationId),
          event.changes.keys.get(operationId)?.oldValue,
          transaction
        );
      }
    };
    const observeRasterUndoOperations = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      const changedIds = this.changedRasterUndoOperationIdsFor(transaction);
      for (const undoOperationId of event.keysChanged) {
        if (RASTER_UUID_PATTERN.test(undoOperationId)) changedIds.add(undoOperationId);
        markRasterEnvelopeSurfaces(
          this.rasterUndoOperations.get(undoOperationId),
          event.changes.keys.get(undoOperationId)?.oldValue,
          transaction
        );
      }
    };
    const observeRasterUndoAcknowledgements = (
      event: Y.YMapEvent<string>,
      transaction: Y.Transaction
    ) => {
      const changedIds = this.changedRasterUndoAcknowledgementIdsFor(transaction);
      for (const acknowledgementId of event.keysChanged) {
        if (RASTER_UUID_PATTERN.test(acknowledgementId)) changedIds.add(acknowledgementId);
        markRasterEnvelopeSurfaces(
          this.rasterUndoAcknowledgements.get(acknowledgementId),
          event.changes.keys.get(acknowledgementId)?.oldValue,
          transaction
        );
      }
    };
    const observeRasterCheckpoints = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      const changedIds = this.changedRasterCheckpointIdsFor(transaction);
      for (const checkpointId of event.keysChanged) {
        if (RASTER_UUID_PATTERN.test(checkpointId)) changedIds.add(checkpointId);
        markRasterEnvelopeSurfaces(
          this.rasterCheckpoints.get(checkpointId),
          event.changes.keys.get(checkpointId)?.oldValue,
          transaction,
          true
        );
      }
    };
    this.strokes.observeDeep(observeStrokes);
    this.order.observeDeep(observeOrder);
    this.sceneElementIds.observe(observeSceneElementIds);
    this.pageIds.observe(observePageIds);
    this.layerGroupIds.observe(observeLayerGroupIds);
    this.pageOrder.observeDeep(observePageOrder);
    this.deletionOps.observe(observeDeletionOps);
    this.deletionAcks.observe(observeDeletionAcks);
    this.rasterSurfaces.observe(observeRasterSurfaces);
    this.rasterOperations.observe(observeRasterOperations);
    this.rasterUndoOperations.observe(observeRasterUndoOperations);
    this.rasterUndoAcknowledgements.observe(observeRasterUndoAcknowledgements);
    this.rasterCheckpoints.observe(observeRasterCheckpoints);
    this.cleanup.add(() => this.strokes.unobserveDeep(observeStrokes));
    this.cleanup.add(() => this.order.unobserveDeep(observeOrder));
    this.cleanup.add(() => this.sceneElementIds.unobserve(observeSceneElementIds));
    this.cleanup.add(() => this.pageIds.unobserve(observePageIds));
    this.cleanup.add(() => this.layerGroupIds.unobserve(observeLayerGroupIds));
    this.cleanup.add(() => this.pageOrder.unobserveDeep(observePageOrder));
    this.cleanup.add(() => this.deletionOps.unobserve(observeDeletionOps));
    this.cleanup.add(() => this.deletionAcks.unobserve(observeDeletionAcks));
    this.cleanup.add(() => this.rasterSurfaces.unobserve(observeRasterSurfaces));
    this.cleanup.add(() => this.rasterOperations.unobserve(observeRasterOperations));
    this.cleanup.add(() => this.rasterUndoOperations.unobserve(observeRasterUndoOperations));
    this.cleanup.add(() => this.rasterUndoAcknowledgements.unobserve(observeRasterUndoAcknowledgements));
    this.cleanup.add(() => this.rasterCheckpoints.unobserve(observeRasterCheckpoints));

    // 이 리스너는 생성자에서 등록되므로, 이후 외부에서 호출되는 모든 subscribeChanges 리스너보다
    // 항상 먼저 afterTransaction을 받는다(Yjs는 등록 순서대로 리스너를 호출한다) — get*()가 이번
    // 트랜잭션의 dirty 표시를 놓치지 않는다는 불변식이 이 등록 순서에 의존한다. 여기서는 재디코딩을
    // 하지 않는다(Set.add 만 하므로 사실상 공짜) — 실제 디코딩은 drainDirty*Ids 가 get*() 호출 시점에
    // 지연 수행한다.
    const reconcileRecordCaches = (transaction: Y.Transaction) => {
      const changedStrokeIds = this.changedStrokeIdsByTransaction.get(transaction);
      if (changedStrokeIds) for (const id of changedStrokeIds) this.dirtyStrokeIds.add(id);
      const changedSceneElementIds = this.changedSceneElementIdsByTransaction.get(transaction);
      if (changedSceneElementIds) {
        for (const id of changedSceneElementIds) this.dirtySceneElementIds.add(id);
      }
      const changedPageIds = this.changedPageIdsByTransaction.get(transaction);
      if (changedPageIds) for (const id of changedPageIds) this.dirtyPageIds.add(id);
      const changedLayerGroupIds = this.changedLayerGroupIdsByTransaction.get(transaction);
      if (changedLayerGroupIds) {
        for (const compositeKey of changedLayerGroupIds) this.dirtyLayerGroupIds.add(compositeKey);
      }
    };
    this.doc.on("afterTransaction", reconcileRecordCaches);
    this.cleanup.add(() => this.doc.off("afterTransaction", reconcileRecordCaches));
  }

  subscribe(handler: StudioCrdtUpdateHandler): () => void {
    this.assertAlive();
    const listener = (update: Uint8Array, origin: unknown) => handler(update.slice(), origin);
    this.doc.on("update", listener);
    const unsubscribe = () => {
      this.doc.off("update", listener);
      this.cleanup.delete(unsubscribe);
    };
    this.cleanup.add(unsubscribe);
    return unsubscribe;
  }

  subscribeChanges<const Fields extends readonly StudioCrdtChangeSnapshotField[]>(
    handler: StudioCrdtProjectedChangeHandler<Fields>,
    options: StudioCrdtProjectedChangeSubscriptionOptions<Fields>
  ): () => void;
  subscribeChanges(
    handler: StudioCrdtChangeHandler,
    options?: StudioCrdtChangeSubscriptionOptions
  ): () => void;
  subscribeChanges<const Fields extends readonly StudioCrdtChangeSnapshotField[]>(
    handler: StudioCrdtChangeHandler | StudioCrdtProjectedChangeHandler<Fields>,
    options:
      | StudioCrdtChangeSubscriptionOptions
      | StudioCrdtProjectedChangeSubscriptionOptions<Fields> = {}
  ): () => void {
    this.assertAlive();
    const projectionFields: Readonly<Fields> | null = options.snapshotFields === undefined
      ? null
      : Object.freeze([...options.snapshotFields]) as unknown as Readonly<Fields>;
    const projectionFieldSet = projectionFields === null
      ? null
      : new Set<StudioCrdtChangeSnapshotField>(projectionFields);
    if (projectionFields !== null) {
      for (const field of projectionFields) {
        if (!STUDIO_CRDT_CHANGE_SNAPSHOT_FIELD_SET.has(field)) {
          throw new Error(`지원하지 않는 CRDT 변경 스냅샷 필드입니다: ${field}`);
        }
      }
    }
    const listener = (transaction: Y.Transaction) => {
      if (options.includeOrigin && !options.includeOrigin(transaction.origin)) return;
      const summary: StudioCrdtChangeSummary = {
        origin: transaction.origin,
        local: transaction.local || transaction.origin === STUDIO_CRDT_ORIGIN_LOCAL,
        changedStrokeIds: new Set(this.changedStrokeIdsByTransaction.get(transaction) ?? []),
        changedSceneElementIds: new Set(
          this.changedSceneElementIdsByTransaction.get(transaction) ?? []
        ),
        changedPageIds: new Set(this.changedPageIdsByTransaction.get(transaction) ?? []),
        changedLayerGroupIds: new Set(
          this.changedLayerGroupIdsByTransaction.get(transaction) ?? []
        ),
        changedRasterSurfaceIds: new Set(
          this.changedRasterSurfaceIdsByTransaction.get(transaction) ?? []
        ),
        changedRasterOperationIds: new Set(
          this.changedRasterOperationIdsByTransaction.get(transaction) ?? []
        ),
        changedRasterUndoOperationIds: new Set(
          this.changedRasterUndoOperationIdsByTransaction.get(transaction) ?? []
        ),
        changedRasterUndoAcknowledgementIds: new Set(
          this.changedRasterUndoAcknowledgementIdsByTransaction.get(transaction) ?? []
        ),
        changedRasterCheckpointIds: new Set(
          this.changedRasterCheckpointIdsByTransaction.get(transaction) ?? []
        ),
      };
      if (options.includeChange && !options.includeChange(summary)) return;
      if (projectionFields !== null && projectionFieldSet !== null) {
        const change: StudioCrdtProjectedChange<Fields> = {
          ...summary,
          snapshotMode: "projected",
          snapshotFields: projectionFields,
          snapshot: this.materializeChangeSnapshotProjection<Fields>(projectionFieldSet),
        };
        (handler as StudioCrdtProjectedChangeHandler<Fields>)(change);
        return;
      }
      const rasterSnapshot = this.tryReadExactRasterDocumentSnapshot();
      (handler as StudioCrdtChangeHandler)({
        ...summary,
        strokes: this.getStrokes({ includeDeleted: true }),
        sceneElements: this.getSceneElements({ includeDeleted: true }),
        pages: this.getPages(true),
        layerGroups: this.getLayerGroups({ includeDeleted: true }),
        rasterOperationLogs: rasterSnapshot
          ? [...rasterSnapshot.logs.values()].sort((left, right) => (
              left.surface.surfaceId < right.surface.surfaceId ? -1 :
              left.surface.surfaceId > right.surface.surfaceId ? 1 : 0
            ))
          : [],
        rasterCheckpoints: rasterSnapshot
          ? [...rasterSnapshot.checkpoints].sort((left, right) => {
              const order = compareStudioRasterEventOrder(left.through, right.through);
              if (order !== 0) return order;
              return left.checkpointId < right.checkpointId ? -1 :
                left.checkpointId > right.checkpointId ? 1 : 0;
            })
          : [],
      });
    };
    this.doc.on("afterTransaction", listener);
    const unsubscribe = () => {
      this.doc.off("afterTransaction", listener);
      this.cleanup.delete(unsubscribe);
    };
    this.cleanup.add(unsubscribe);
    return unsubscribe;
  }

  private materializeChangeSnapshotProjection<
    Fields extends readonly StudioCrdtChangeSnapshotField[]
  >(
    fields: ReadonlySet<StudioCrdtChangeSnapshotField>
  ): Readonly<Pick<StudioCrdtChangeSnapshot, Fields[number]>> {
    const snapshot: Partial<StudioCrdtChangeSnapshot> = {};
    if (fields.has("strokes")) {
      snapshot.strokes = this.getStrokes({ includeDeleted: true });
    }
    if (fields.has("sceneElements")) {
      snapshot.sceneElements = this.getSceneElements({ includeDeleted: true });
    }
    if (fields.has("pages")) {
      snapshot.pages = this.getPages(true);
    }
    if (fields.has("layerGroups")) {
      snapshot.layerGroups = this.getLayerGroups({ includeDeleted: true });
    }
    const needsRasterSnapshot = fields.has("rasterOperationLogs") ||
      fields.has("rasterCheckpoints");
    if (needsRasterSnapshot) {
      const rasterSnapshot = this.tryReadExactRasterDocumentSnapshot();
      if (fields.has("rasterOperationLogs")) {
        snapshot.rasterOperationLogs = rasterSnapshot
          ? [...rasterSnapshot.logs.values()].sort((left, right) => (
              left.surface.surfaceId < right.surface.surfaceId ? -1 :
              left.surface.surfaceId > right.surface.surfaceId ? 1 : 0
            ))
          : [];
      }
      if (fields.has("rasterCheckpoints")) {
        snapshot.rasterCheckpoints = rasterSnapshot
          ? [...rasterSnapshot.checkpoints].sort((left, right) => {
              const order = compareStudioRasterEventOrder(left.through, right.through);
              if (order !== 0) return order;
              return left.checkpointId < right.checkpointId ? -1 :
                left.checkpointId > right.checkpointId ? 1 : 0;
            })
          : [];
      }
    }
    return snapshot as Pick<StudioCrdtChangeSnapshot, Fields[number]>;
  }

  subscribeBatchedUpdates(
    handler: (batch: StudioCrdtBatchedUpdate) => void,
    options: StudioCrdtBatchOptions = {}
  ): StudioCrdtBatchSubscription {
    this.assertAlive();
    const delayMs = Math.min(
      BATCH_MAX_DELAY_MS,
      Math.max(BATCH_MIN_DELAY_MS, Math.trunc(options.delayMs ?? DEFAULT_BATCH_DELAY_MS))
    );
    const maximum = Math.min(
      STUDIO_CRDT_UPDATE_MAX_BYTES,
      Math.max(1_024, Math.trunc(options.maxBytes ?? DEFAULT_BATCH_MAX_BYTES))
    );
    const schedule = options.setTimeout ?? defaultSetTimeout;
    const cancel = options.clearTimeout ?? defaultClearTimeout;
    const includeOrigin = options.includeOrigin
      ?? ((origin: unknown) => origin === STUDIO_CRDT_ORIGIN_LOCAL);
    let updates: Uint8Array[] = [];
    let origins = new Set<unknown>();
    let queuedBytes = 0;
    let timeout: unknown = null;
    let active = true;

    const flush = () => {
      if (!active || updates.length === 0) return;
      if (timeout !== null) cancel(timeout);
      timeout = null;
      const currentUpdates = updates;
      const currentOrigins = origins;
      updates = [];
      origins = new Set();
      queuedBytes = 0;
      handler({ update: mergeStudioCrdtUpdates(currentUpdates), origins: currentOrigins });
    };
    const unsubscribeUpdates = this.subscribe((update, origin) => {
      if (!active || !includeOrigin(origin)) return;
      if (updates.length > 0 && queuedBytes + update.byteLength > maximum) flush();
      updates.push(update);
      origins.add(origin);
      queuedBytes += update.byteLength;
      if (queuedBytes >= maximum) {
        flush();
      } else if (timeout === null) {
        timeout = schedule(flush, delayMs);
      }
    });
    const unsubscribe = () => {
      if (!active) return;
      flush();
      active = false;
      if (timeout !== null) cancel(timeout);
      timeout = null;
      unsubscribeUpdates();
      this.cleanup.delete(unsubscribe);
    };
    this.cleanup.add(unsubscribe);
    return { flush, unsubscribe };
  }

  beginStroke(input: StudioCrdtStrokeInput, beforeStrokeId: string | null = null): StudioCrdtStrokeRecord {
    this.assertAlive();
    this.assertStrokeInput(input, true);
    if (this.strokes.has(input.id)) throw new Error("이미 존재하는 획 식별자입니다.");
    const normalized = normalizedSamples(input.payload, true);
    const emptyInput = this.withoutSamples(input);
    this.doc.transact(() => {
      const record = this.createRecord(emptyInput, "drawing");
      this.strokes.set(input.id, record);
      this.insertOrderEntry(input, beforeStrokeId);
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    const record = this.strokes.get(input.id);
    if (!(record instanceof Y.Map)) throw new Error("생성한 획 레코드가 손상되었습니다.");
    this.appendNormalizedSamples(record, normalized);
    return this.requiredStroke(input.id);
  }

  appendStrokeSamples(id: string, samples: StudioCrdtStrokeSamples): number {
    this.assertAlive();
    assertId(id, "획");
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map) || this.isDeleted(record, strokeDeletionTarget(id))) {
      throw new Error("추가할 획을 찾을 수 없습니다.");
    }
    if (record.get("status") !== "drawing") throw new Error("완료된 획에는 샘플을 추가할 수 없습니다.");
    const extensions = readJsonObject(record, "extensions");
    const pressureModel = isStudioInkPressureModel(extensions?.pressureModel)
      ? extensions.pressureModel
      : undefined;
    const normalized = normalizedSamples(samples, false, pressureModel);
    const appendedCount = normalized.points.length / 2;
    if (appendedCount > STUDIO_CRDT_APPEND_MAX_SAMPLES) {
      throw new Error("한 번에 추가할 수 있는 획 샘플 수를 초과했습니다.");
    }
    const currentCount = (yArray(record, "points")?.length ?? 0) / 2;
    if (currentCount + appendedCount > STUDIO_CRDT_STROKE_MAX_SAMPLES) {
      throw new Error("획 샘플 수가 최대 한도를 초과합니다.");
    }
    this.appendNormalizedSamples(record, normalized);
    return currentCount + appendedCount;
  }

  finalizeStroke(id: string, finalSamples?: StudioCrdtStrokeSamples): StudioCrdtStrokeRecord {
    this.assertAlive();
    if (finalSamples !== undefined) this.appendStrokeSamples(id, finalSamples);
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map) || this.isDeleted(record, strokeDeletionTarget(id))) {
      throw new Error("완료할 획을 찾을 수 없습니다.");
    }
    this.doc.transact(() => record.set("status", "finalized"), STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredStroke(id);
  }

  addStroke(input: StudioCrdtStrokeInput): StudioCrdtStrokeRecord {
    return this.upsertStroke(input, { status: "finalized" });
  }

  upsertStroke(
    input: StudioCrdtStrokeInput,
    options: StudioCrdtUpsertOptions = {}
  ): StudioCrdtStrokeRecord {
    this.assertAlive();
    this.assertStrokeInput(input, true);
    const existing = this.strokes.get(input.id);
    const desiredStatus = options.status ?? "finalized";
    if (existing !== undefined && !(existing instanceof Y.Map)) {
      throw new Error("기존 획 레코드가 손상되었습니다.");
    }
    if (!existing) {
      this.beginStroke(input, options.beforeStrokeId ?? null);
      if (desiredStatus === "finalized") {
        const created = this.strokes.get(input.id);
        if (!(created instanceof Y.Map)) throw new Error("생성한 획 레코드가 손상되었습니다.");
        this.doc.transact(
          () => created.set("status", "finalized"),
          STUDIO_CRDT_ORIGIN_LOCAL
        );
      }
      return this.requiredStroke(input.id);
    }

    const deletionTarget = strokeDeletionTarget(input.id);
    const deleted = this.isDeleted(existing, deletionTarget);
    if (deleted && !options.resurrect) throw new Error("삭제된 획은 명시적으로 복원해야 합니다.");
    const normalized = normalizedSamples(input.payload, true);
    const previousPageId = readString(existing, "pageId");
    const previousLayerId = readString(existing, "layerId");
    const requiresReorder = previousPageId !== input.pageId ||
      previousLayerId !== input.layerId ||
      options.beforeStrokeId !== undefined;
    if (requiresReorder) this.assertOrderEditBound(input.id);
    this.doc.transact(() => {
      if (deleted && options.resurrect) {
        this.acknowledgeCurrentDeletionOperations(existing, deletionTarget);
      }
      existing.set("pageId", input.pageId);
      existing.set("layerId", input.layerId);
      existing.set("status", "drawing");
      setPayloadMetadata(existing, input.payload);
      for (const key of SAMPLE_ARRAY_KEYS) {
        const target = yArray(existing, key);
        if (!target) throw new Error("획 샘플 배열이 손상되었습니다.");
        if (target.length > 0) target.delete(0, target.length);
      }
      if (requiresReorder) {
        this.deactivateOrderEntries(input.id);
        this.insertOrderEntry(input, options.beforeStrokeId ?? null);
      }
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    this.appendNormalizedSamples(existing, normalized);
    if (desiredStatus === "finalized") {
      this.doc.transact(
        () => existing.set("status", "finalized"),
        STUDIO_CRDT_ORIGIN_LOCAL
      );
    }
    return this.requiredStroke(input.id);
  }

  /**
   * Replaces a completed stroke without creating an oversized single Yjs update. Metadata and
   * array reset are one transaction, sample inserts are bounded transactions, and finalization is
   * last. Remote peers can therefore render the replacement progressively while every wire update
   * stays below the durable channel's incremental cap after batching.
   */
  replaceStroke(input: StudioCrdtStrokeInput): StudioCrdtStrokeRecord {
    return this.upsertStroke(input, { status: "finalized" });
  }

  /**
   * Applies only fields that changed in the caller's local before/after snapshot. Independent
   * metadata edits therefore remain independent Y.Map operations instead of a replace-all write.
   * Pointer arrays are one aligned atomic group and retain the existing bounded chunk transport.
   */
  patchStroke(id: string, patch: StudioCrdtStrokePatch): StudioCrdtStrokeRecord {
    this.assertAlive();
    assertId(id, "획");
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map) || this.isDeleted(record, strokeDeletionTarget(id))) {
      throw new Error("수정할 획을 찾을 수 없습니다.");
    }
    const current = this.requiredStroke(id);
    const changedKeys = [...new Set(patch.changedPayloadKeys ?? [])];
    for (const key of changedKeys) {
      if (!(STROKE_PAYLOAD_KEYS as readonly string[]).includes(key)) {
        throw new Error("수정할 획 속성이 올바르지 않습니다.");
      }
    }
    if (changedKeys.some((key) => (SAMPLE_ARRAY_KEYS as readonly string[]).includes(key))) {
      for (const key of SAMPLE_ARRAY_KEYS) {
        if (!changedKeys.includes(key)) changedKeys.push(key);
      }
    }
    if (changedKeys.length > 0 && !patch.payload) {
      throw new Error("획 속성을 수정하려면 다음 페이로드가 필요합니다.");
    }
    const pageId = patch.pageId ?? current.pageId;
    const layerId = patch.layerId ?? current.layerId;
    const payload = patch.payload
      ? mergeStrokePayloadFields(current.payload, patch.payload, changedKeys)
      : current.payload;
    this.assertStrokeInput({ id, pageId, layerId, payload }, true);

    const requiresReorder = pageId !== current.pageId || layerId !== current.layerId;
    if (requiresReorder) this.assertOrderEditBound(id);
    const sampleChanged = changedKeys.some((key) =>
      (SAMPLE_ARRAY_KEYS as readonly string[]).includes(key)
    );
    const metadataKeys = changedKeys.filter((key) =>
      !(SAMPLE_ARRAY_KEYS as readonly string[]).includes(key)
    ) as Exclude<StudioCrdtStrokePayloadKey, StudioCrdtSampleArrayKey>[];
    if (!requiresReorder && !sampleChanged && metadataKeys.length === 0) return current;

    const normalized = sampleChanged ? normalizedSamples(payload, true) : null;
    this.doc.transact(() => {
      if (requiresReorder) {
        record.set("pageId", pageId);
        record.set("layerId", layerId);
        this.deactivateOrderEntries(id);
        this.insertOrderEntry({ id, pageId, layerId }, null);
      }
      for (const key of metadataKeys) setPayloadMetadataField(record, payload, key);
      if (sampleChanged) {
        record.set("status", "drawing");
        for (const key of SAMPLE_ARRAY_KEYS) {
          const target = yArray(record, key);
          if (!target) throw new Error("획 샘플 배열이 손상되었습니다.");
          if (target.length > 0) target.delete(0, target.length);
        }
      }
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    if (normalized) {
      this.appendNormalizedSamples(record, normalized);
      this.doc.transact(() => record.set("status", "finalized"), STUDIO_CRDT_ORIGIN_LOCAL);
    }
    return this.requiredStroke(id);
  }

  deleteStroke(id: string): boolean {
    this.assertAlive();
    assertId(id, "획");
    const record = this.strokes.get(id);
    const target = strokeDeletionTarget(id);
    if (!(record instanceof Y.Map) || this.isDeleted(record, target)) return false;
    this.doc.transact(() => this.addDeletionOperation(target), STUDIO_CRDT_ORIGIN_LOCAL);
    return true;
  }

  restoreStroke(id: string): boolean {
    this.assertAlive();
    assertId(id, "획");
    const record = this.strokes.get(id);
    return record instanceof Y.Map
      ? this.restoreDeletedRecord(record, strokeDeletionTarget(id))
      : false;
  }

  moveStroke(id: string, beforeStrokeId: string | null): StudioCrdtStrokeRecord {
    this.assertAlive();
    assertId(id, "획");
    if (beforeStrokeId !== null) assertId(beforeStrokeId, "대상 획");
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map)) throw new Error("이동할 획을 찾을 수 없습니다.");
    const pageId = readString(record, "pageId");
    const layerId = readString(record, "layerId");
    if (!pageId || !layerId) throw new Error("획의 페이지 또는 레이어 정보가 손상되었습니다.");
    this.assertOrderEditBound(id);
    this.doc.transact(() => {
      this.deactivateOrderEntries(id);
      this.insertOrderEntry({ id, pageId, layerId }, beforeStrokeId);
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredStroke(id);
  }

  getStroke(id: string, includeDeleted = false): StudioCrdtStrokeRecord | null {
    this.assertAlive();
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map)) return null;
    const orderIndex = this.lastActiveOrderIndex(id);
    const result = this.readRecord(id, record, orderIndex);
    if (!result || (!includeDeleted && result.deleted)) return null;
    return result;
  }

  getStrokes(query: StudioCrdtStrokeQuery = {}): StudioCrdtStrokeRecord[] {
    this.assertAlive();
    this.drainDirtyStrokeIds();
    const latestOrder = new Map<string, number>();
    this.order.forEach((entry, index) => {
      if (!(entry instanceof Y.Map)) return;
      if (entry.get("active") !== true) return;
      const id = orderEntryValue(entry, "strokeId");
      if (id) latestOrder.set(id, index);
    });
    const records: StudioCrdtStrokeRecord[] = [];
    for (const [id, cached] of this.strokeRecordCache) {
      if (!cached) continue;
      const result: StudioCrdtStrokeRecord = {
        ...cached,
        orderIndex: latestOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
      };
      if (!query.includeDeleted && result.deleted) continue;
      if (query.pageId !== undefined && result.pageId !== query.pageId) continue;
      if (query.layerId !== undefined && result.layerId !== query.layerId) continue;
      records.push(result);
    }
    return records.sort(
      (left, right) =>
        left.pageId.localeCompare(right.pageId) ||
        left.orderIndex - right.orderIndex ||
        left.id.localeCompare(right.id)
    );
  }

  addSceneElement(
    input: StudioCrdtSceneElementInput,
    beforeElementId: string | null = null
  ): StudioCrdtSceneElementRecord {
    if (this.sceneElementIds.get(input.id) === true) {
      throw new Error("이미 존재하는 장면 요소 식별자입니다.");
    }
    return this.upsertSceneElement(input, { beforeElementId });
  }

  upsertSceneElement(
    input: StudioCrdtSceneElementInput,
    options: StudioCrdtSceneElementUpsertOptions = {}
  ): StudioCrdtSceneElementRecord {
    this.assertAlive();
    this.assertSceneElementInput(input);
    const payload = validateStudioCrdtSceneElementPayload(input.payload);
    const exists = this.sceneElementIds.get(input.id) === true;
    const record = this.sceneElementRecord(input.id, !exists);
    if (!record) throw new Error("장면 요소 레코드가 손상되었습니다.");
    const deletionTarget = sceneDeletionTarget(input.id);
    const deleted = this.isDeleted(record, deletionTarget);
    const existingPayload = exists ? this.readSceneElementPayload(record) : null;
    if (exists && !existingPayload) throw new Error("기존 장면 요소 레코드가 손상되었습니다.");
    if (existingPayload && existingPayload.type !== payload.type) {
      throw new Error("기존 장면 요소의 타입은 변경할 수 없습니다.");
    }
    if (deleted && !options.resurrect) {
      throw new Error("삭제된 장면 요소는 명시적으로 복원해야 합니다.");
    }

    const usesLegacyBootstrap = options.baselineProps !== undefined || options.changedProps !== undefined ||
      options.unsetProps !== undefined;
    let baseline: StudioCrdtJsonObject | null = null;
    let changedProps: readonly string[] = [];
    let unsetProps: readonly string[] = [];
    if (usesLegacyBootstrap) {
      if (!options.baselineProps) {
        throw new Error("레거시 요소 등록에는 기준 속성이 필요합니다.");
      }
      baseline = validateStudioCrdtSceneElementPayload({
        version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
        type: payload.type,
        props: options.baselineProps,
      }).props;
      const allowed = STUDIO_CRDT_SCENE_ELEMENT_KEYS_BY_TYPE[payload.type];
      const seen = new Set<string>();
      for (const key of options.changedProps ?? []) {
        if (!exactText(key, MAX_TEXT_LENGTH) || !allowed.has(key) || seen.has(key) || !(key in payload.props)) {
          throw new Error("레거시 요소의 변경 속성 목록이 올바르지 않습니다.");
        }
        seen.add(key);
      }
      changedProps = [...seen];
      validateUnsetKeys(
        options.unsetProps ?? [],
        allowed,
        STUDIO_CRDT_REQUIRED_SCENE_ELEMENT_KEYS[payload.type]
      );
      unsetProps = [...new Set(options.unsetProps ?? [])];
      if (unsetProps.some((key) => seen.has(key) || key in payload.props)) {
        throw new Error("제거할 레거시 속성은 변경 목록과 현재 페이로드에 포함될 수 없습니다.");
      }
    }

    const previousPageId = readString(record, "pageId");
    const previousLayerId = readString(record, "layerId");
    const requiresOrderEntry = !exists || previousPageId !== input.pageId ||
      previousLayerId !== input.layerId || options.beforeElementId !== undefined;
    if (exists && requiresOrderEntry) this.assertMixedOrderEditBound(input.id, "elementId");

    this.doc.transact(() => {
      if (deleted && options.resurrect) {
        this.acknowledgeCurrentDeletionOperations(record, deletionTarget);
      }
      this.sceneElementIds.set(input.id, true);
      record.set("id", input.id);
      record.set("pageId", input.pageId);
      record.set("layerId", input.layerId);
      record.set("payloadVersion", payload.version);
      record.set("type", payload.type);
      if (baseline) {
        for (const [key, value] of Object.entries(baseline)) {
          const baselineKey = propertyKey(BASELINE_PROPERTY_PREFIX, key);
          if (!record.has(baselineKey)) record.set(baselineKey, cloneAndValidateJson(value));
        }
        setCrdtProperties(record, PROPERTY_PREFIX, payload.props, changedProps);
        for (const key of unsetProps) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
      } else {
        const previous = existingPayload?.props ?? {};
        setCrdtProperties(record, PROPERTY_PREFIX, payload.props);
        for (const key of Object.keys(previous)) {
          if (!(key in payload.props)) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
        }
      }
      if (requiresOrderEntry) {
        this.deactivateMixedOrderEntries(input.id, "elementId");
        this.insertSceneOrderEntry(input, options.beforeElementId ?? null);
      }
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredSceneElement(input.id);
  }

  patchSceneElement(id: string, patch: StudioCrdtSceneElementPatch): StudioCrdtSceneElementRecord {
    this.assertAlive();
    assertId(id, "장면 요소");
    const record = this.sceneElementRecord(id);
    if (!record || this.isDeleted(record, sceneDeletionTarget(id))) {
      throw new Error("수정할 장면 요소를 찾을 수 없습니다.");
    }
    const current = this.readSceneElementPayload(record);
    if (!current) throw new Error("장면 요소 레코드가 손상되었습니다.");
    const set = patch.set ? cloneJsonObject(patch.set) : {};
    const unset = patch.unset ?? [];
    const allowed = STUDIO_CRDT_SCENE_ELEMENT_KEYS_BY_TYPE[current.type];
    for (const key of Object.keys(set)) {
      if (!allowed.has(key)) throw new Error(`${current.type} 요소의 ${key} 속성은 동기화할 수 없습니다.`);
    }
    validateUnsetKeys(unset, allowed, STUDIO_CRDT_REQUIRED_SCENE_ELEMENT_KEYS[current.type]);
    const nextProps = { ...current.props, ...set };
    for (const key of unset) delete nextProps[key];
    validateStudioCrdtSceneElementPayload({ ...current, props: nextProps });
    if (patch.pageId !== undefined) assertId(patch.pageId, "페이지");
    if (patch.layerId !== undefined) assertId(patch.layerId, "레이어");
    const nextPageId = patch.pageId ?? readString(record, "pageId");
    const nextLayerId = patch.layerId ?? readString(record, "layerId");
    if (!nextPageId || !nextLayerId) throw new Error("장면 요소 위치 정보가 손상되었습니다.");
    const reparented = nextPageId !== record.get("pageId") || nextLayerId !== record.get("layerId");
    if (reparented) this.assertMixedOrderEditBound(id, "elementId");

    this.doc.transact(() => {
      record.set("pageId", nextPageId);
      record.set("layerId", nextLayerId);
      setCrdtProperties(record, PROPERTY_PREFIX, set);
      for (const key of unset) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
      if (reparented) {
        this.deactivateMixedOrderEntries(id, "elementId");
        this.insertSceneOrderEntry({ id, pageId: nextPageId, layerId: nextLayerId }, null);
      }
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredSceneElement(id);
  }

  deleteSceneElement(id: string): boolean {
    this.assertAlive();
    assertId(id, "장면 요소");
    const record = this.sceneElementRecord(id);
    const target = sceneDeletionTarget(id);
    if (!record || this.isDeleted(record, target)) return false;
    this.doc.transact(() => this.addDeletionOperation(target), STUDIO_CRDT_ORIGIN_LOCAL);
    return true;
  }

  restoreSceneElement(id: string): boolean {
    this.assertAlive();
    assertId(id, "장면 요소");
    const record = this.sceneElementRecord(id);
    return record ? this.restoreDeletedRecord(record, sceneDeletionTarget(id)) : false;
  }

  moveSceneElement(id: string, beforeElementId: string | null): StudioCrdtSceneElementRecord {
    this.assertAlive();
    assertId(id, "장면 요소");
    if (beforeElementId !== null) assertId(beforeElementId, "대상 요소");
    const record = this.sceneElementRecord(id);
    if (!record) throw new Error("이동할 장면 요소를 찾을 수 없습니다.");
    const pageId = readString(record, "pageId");
    const layerId = readString(record, "layerId");
    if (!pageId || !layerId) throw new Error("장면 요소 위치 정보가 손상되었습니다.");
    this.assertMixedOrderEditBound(id, "elementId");
    this.doc.transact(() => {
      this.deactivateMixedOrderEntries(id, "elementId");
      this.insertSceneOrderEntry({ id, pageId, layerId }, beforeElementId);
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredSceneElement(id);
  }

  /** Moves a draw or supported non-raster object in their shared page-global z-order. */
  moveElement(
    id: string,
    beforeElementId: string | null
  ): StudioCrdtStrokeRecord | StudioCrdtSceneElementRecord {
    this.assertAlive();
    const hasSceneElement = this.sceneElementIds.get(id) === true;
    const hasStroke = this.strokes.has(id);
    if (hasSceneElement && hasStroke) throw new Error("중복된 CRDT 요소 식별자는 이동할 수 없습니다.");
    if (hasSceneElement) return this.moveSceneElement(id, beforeElementId);
    if (hasStroke) return this.moveStroke(id, beforeElementId);
    throw new Error("이동할 CRDT 요소를 찾을 수 없습니다.");
  }

  getSceneElement(id: string, includeDeleted = false): StudioCrdtSceneElementRecord | null {
    this.assertAlive();
    const record = this.sceneElementRecord(id);
    if (!record) return null;
    const result = this.readSceneElementRecord(id, record, this.lastActiveMixedOrderIndex(id, "elementId"));
    if (!result || (!includeDeleted && result.deleted)) return null;
    return result;
  }

  getSceneElements(query: StudioCrdtSceneElementQuery = {}): StudioCrdtSceneElementRecord[] {
    this.assertAlive();
    this.drainDirtySceneElementIds();
    const latestOrder = new Map<string, number>();
    this.order.forEach((entry, index) => {
      if (!(entry instanceof Y.Map) || entry.get("active") !== true) return;
      const id = sceneOrderEntryId(entry);
      if (id) latestOrder.set(id, index);
    });
    const records: StudioCrdtSceneElementRecord[] = [];
    for (const [id, cached] of this.sceneElementRecordCache) {
      if (!cached) continue;
      const result: StudioCrdtSceneElementRecord = {
        ...cached,
        orderIndex: latestOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
      };
      if (!query.includeDeleted && result.deleted) continue;
      if (query.pageId !== undefined && result.pageId !== query.pageId) continue;
      if (query.layerId !== undefined && result.layerId !== query.layerId) continue;
      records.push(result);
    }
    return records.sort(
      (left, right) => left.pageId.localeCompare(right.pageId) ||
        left.orderIndex - right.orderIndex || left.id.localeCompare(right.id)
    );
  }

  addPage(input: StudioCrdtPageInput, beforePageId: string | null = null): StudioCrdtPageRecord {
    if (this.pageIds.get(input.id) === true) throw new Error("이미 존재하는 페이지 식별자입니다.");
    return this.upsertPage(input, { beforePageId });
  }

  upsertPage(
    input: StudioCrdtPageInput,
    options: StudioCrdtPageUpsertOptions = {}
  ): StudioCrdtPageRecord {
    this.assertAlive();
    assertId(input.id, "페이지");
    const payload = validateStudioCrdtPagePayload(input.payload);
    const exists = this.pageIds.get(input.id) === true;
    const record = this.pageRecord(input.id, !exists);
    if (!record) throw new Error("페이지 레코드가 손상되었습니다.");
    const deletionTarget = pageDeletionTarget(input.id);
    const deleted = this.isDeleted(record, deletionTarget);
    const previousPayload = exists ? this.readPagePayload(record) : null;
    if (exists && !previousPayload) throw new Error("기존 페이지 레코드가 손상되었습니다.");
    if (deleted && !options.resurrect) {
      throw new Error("삭제된 페이지는 명시적으로 복원해야 합니다.");
    }
    const usesLegacyBootstrap = options.baselineProps !== undefined || options.changedProps !== undefined ||
      options.unsetProps !== undefined;
    let baseline: StudioCrdtJsonObject | null = null;
    let changedProps: readonly string[] = [];
    let unsetProps: readonly string[] = [];
    if (usesLegacyBootstrap) {
      if (!options.baselineProps) throw new Error("레거시 페이지 등록에는 기준 속성이 필요합니다.");
      baseline = validateStudioCrdtPagePayload({
        version: STUDIO_CRDT_PAGE_PAYLOAD_VERSION,
        props: options.baselineProps,
      }).props;
      const seen = new Set<string>();
      for (const key of options.changedProps ?? []) {
        if (!exactText(key, MAX_TEXT_LENGTH) || !STUDIO_CRDT_PAGE_PROPERTY_KEYS.has(key) ||
          seen.has(key) || !(key in payload.props)) {
          throw new Error("레거시 페이지의 변경 속성 목록이 올바르지 않습니다.");
        }
        seen.add(key);
      }
      changedProps = [...seen];
      validateUnsetKeys(
        options.unsetProps ?? [],
        STUDIO_CRDT_PAGE_PROPERTY_KEYS,
        ["bg", "bgGrad", "canvasH"]
      );
      unsetProps = [...new Set(options.unsetProps ?? [])];
      if (unsetProps.some((key) => seen.has(key) || key in payload.props)) {
        throw new Error("제거할 레거시 페이지 속성은 변경 목록과 현재 페이로드에 포함될 수 없습니다.");
      }
    }
    const requiresOrderEntry = !exists || options.beforePageId !== undefined;
    if (exists && requiresOrderEntry) this.assertPageOrderEditBound(input.id);
    this.doc.transact(() => {
      if (deleted && options.resurrect) {
        this.acknowledgeCurrentDeletionOperations(record, deletionTarget);
      }
      this.pageIds.set(input.id, true);
      record.set("id", input.id);
      record.set("payloadVersion", payload.version);
      if (baseline) {
        for (const [key, value] of Object.entries(baseline)) {
          const baselineKey = propertyKey(BASELINE_PROPERTY_PREFIX, key);
          if (!record.has(baselineKey)) record.set(baselineKey, cloneAndValidateJson(value));
        }
        setCrdtProperties(record, PROPERTY_PREFIX, payload.props, changedProps);
        for (const key of unsetProps) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
      } else {
        setCrdtProperties(record, PROPERTY_PREFIX, payload.props);
        for (const key of Object.keys(previousPayload?.props ?? {})) {
          if (!(key in payload.props)) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
        }
      }
      if (requiresOrderEntry) {
        this.deactivatePageOrderEntries(input.id);
        this.insertPageOrderEntry(input.id, options.beforePageId ?? null);
      }
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredPage(input.id);
  }

  patchPage(id: string, patch: StudioCrdtPagePatch): StudioCrdtPageRecord {
    this.assertAlive();
    assertId(id, "페이지");
    const record = this.pageRecord(id);
    if (!record || this.isDeleted(record, pageDeletionTarget(id))) {
      throw new Error("수정할 페이지를 찾을 수 없습니다.");
    }
    const current = this.readPagePayload(record);
    if (!current) throw new Error("페이지 레코드가 손상되었습니다.");
    const set = patch.set ? cloneJsonObject(patch.set) : {};
    for (const key of Object.keys(set)) {
      if (!STUDIO_CRDT_PAGE_PROPERTY_KEYS.has(key)) {
        throw new Error(`페이지의 ${key} 속성은 동기화할 수 없습니다.`);
      }
    }
    validateUnsetKeys(
      patch.unset ?? [],
      STUDIO_CRDT_PAGE_PROPERTY_KEYS,
      ["bg", "bgGrad", "canvasH"]
    );
    const props = { ...current.props, ...set };
    for (const key of patch.unset ?? []) delete props[key];
    validateStudioCrdtPagePayload({ version: STUDIO_CRDT_PAGE_PAYLOAD_VERSION, props });
    this.doc.transact(() => {
      setCrdtProperties(record, PROPERTY_PREFIX, set);
      for (const key of patch.unset ?? []) {
        record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
      }
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredPage(id);
  }

  deletePage(id: string): boolean {
    this.assertAlive();
    assertId(id, "페이지");
    const record = this.pageRecord(id);
    const target = pageDeletionTarget(id);
    if (!record || this.isDeleted(record, target)) return false;
    this.doc.transact(() => this.addDeletionOperation(target), STUDIO_CRDT_ORIGIN_LOCAL);
    return true;
  }

  restorePage(id: string): boolean {
    this.assertAlive();
    assertId(id, "페이지");
    const record = this.pageRecord(id);
    return record ? this.restoreDeletedRecord(record, pageDeletionTarget(id)) : false;
  }

  movePage(id: string, beforePageId: string | null): StudioCrdtPageRecord {
    this.assertAlive();
    assertId(id, "페이지");
    if (beforePageId !== null) assertId(beforePageId, "대상 페이지");
    if (!this.pageRecord(id)) throw new Error("이동할 페이지를 찾을 수 없습니다.");
    this.assertPageOrderEditBound(id);
    this.doc.transact(() => {
      this.deactivatePageOrderEntries(id);
      this.insertPageOrderEntry(id, beforePageId);
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredPage(id);
  }

  getPage(id: string, includeDeleted = false): StudioCrdtPageRecord | null {
    this.assertAlive();
    const record = this.pageRecord(id);
    if (!record) return null;
    const result = this.readPageRecord(id, record, this.lastActivePageOrderIndex(id));
    if (!result || (!includeDeleted && result.deleted)) return null;
    return result;
  }

  getPages(includeDeleted = false): StudioCrdtPageRecord[] {
    this.assertAlive();
    this.drainDirtyPageIds();
    const latestOrder = new Map<string, number>();
    this.pageOrder.forEach((entry, index) => {
      if (!(entry instanceof Y.Map) || entry.get("active") !== true) return;
      const id = pageOrderEntryId(entry);
      if (id) latestOrder.set(id, index);
    });
    const records: StudioCrdtPageRecord[] = [];
    for (const [id, cached] of this.pageRecordCache) {
      if (!cached) continue;
      const result: StudioCrdtPageRecord = {
        ...cached,
        orderIndex: latestOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
      };
      if (!includeDeleted && result.deleted) continue;
      records.push(result);
    }
    return records.sort(
      (left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id)
    );
  }

  addLayerGroup(input: StudioCrdtLayerGroupInput): StudioCrdtLayerGroupRecord {
    const compositeKey = studioCrdtLayerGroupKey(input.pageId, input.id);
    if (this.layerGroupIds.get(compositeKey) === true) {
      throw new Error("이미 존재하는 레이어 그룹 식별자입니다.");
    }
    return this.upsertLayerGroup(input);
  }

  upsertLayerGroup(
    input: StudioCrdtLayerGroupInput,
    options: StudioCrdtLayerGroupUpsertOptions = {}
  ): StudioCrdtLayerGroupRecord {
    this.assertAlive();
    assertLayerGroupId(input.id);
    assertId(input.pageId, "페이지");
    const compositeKey = studioCrdtLayerGroupKey(input.pageId, input.id);
    const payload = validateStudioCrdtLayerGroupPayload(input.payload);
    const exists = this.layerGroupIds.get(compositeKey) === true;
    const record = this.layerGroupRecord(compositeKey, !exists);
    if (!record) throw new Error("레이어 그룹 레코드가 손상되었습니다.");
    const deletionTarget = layerGroupDeletionTarget(input.pageId, input.id);
    const deleted = this.isDeleted(record, deletionTarget);
    const previousPayload = exists ? this.readLayerGroupPayload(record) : null;
    if (exists && !previousPayload) throw new Error("기존 레이어 그룹 레코드가 손상되었습니다.");
    if (deleted && !options.resurrect) {
      throw new Error("삭제된 레이어 그룹은 명시적으로 복원해야 합니다.");
    }

    const usesLegacyBootstrap = options.baselineProps !== undefined ||
      options.changedProps !== undefined || options.unsetProps !== undefined;
    let baseline: StudioCrdtJsonObject | null = null;
    let changedProps: readonly string[] = [];
    let unsetProps: readonly string[] = [];
    if (usesLegacyBootstrap) {
      if (!options.baselineProps) {
        throw new Error("레거시 레이어 그룹 등록에는 기준 속성이 필요합니다.");
      }
      baseline = validateStudioCrdtLayerGroupPayload({
        version: STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
        props: options.baselineProps,
      }).props;
      const seen = new Set<string>();
      for (const key of options.changedProps ?? []) {
        if (
          !exactText(key, MAX_TEXT_LENGTH) || !STUDIO_CRDT_LAYER_GROUP_PROPERTY_KEYS.has(key) ||
          seen.has(key) || !(key in payload.props)
        ) {
          throw new Error("레거시 레이어 그룹의 변경 속성 목록이 올바르지 않습니다.");
        }
        seen.add(key);
      }
      changedProps = [...seen];
      validateUnsetKeys(
        options.unsetProps ?? [],
        STUDIO_CRDT_LAYER_GROUP_PROPERTY_KEYS,
        ["name"]
      );
      unsetProps = [...new Set(options.unsetProps ?? [])];
      if (unsetProps.some((key) => seen.has(key) || key in payload.props)) {
        throw new Error("제거할 레이어 그룹 속성은 변경 목록과 현재 페이로드에 포함될 수 없습니다.");
      }
    }

    this.doc.transact(() => {
      if (deleted && options.resurrect) {
        this.acknowledgeCurrentDeletionOperations(record, deletionTarget);
      }
      this.layerGroupIds.set(compositeKey, true);
      record.set("id", input.id);
      record.set("pageId", input.pageId);
      record.set("payloadVersion", payload.version);
      if (baseline) {
        for (const [key, value] of Object.entries(baseline)) {
          const baselineKey = propertyKey(BASELINE_PROPERTY_PREFIX, key);
          if (!record.has(baselineKey)) record.set(baselineKey, cloneAndValidateJson(value));
        }
        setCrdtProperties(record, PROPERTY_PREFIX, payload.props, changedProps);
        for (const key of unsetProps) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
      } else {
        setCrdtProperties(record, PROPERTY_PREFIX, payload.props);
        for (const key of Object.keys(previousPayload?.props ?? {})) {
          if (!(key in payload.props)) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
        }
      }
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredLayerGroup(input.pageId, input.id);
  }

  patchLayerGroup(
    pageId: string,
    id: string,
    patch: StudioCrdtLayerGroupPatch
  ): StudioCrdtLayerGroupRecord {
    this.assertAlive();
    const compositeKey = studioCrdtLayerGroupKey(pageId, id);
    const record = this.layerGroupRecord(compositeKey);
    if (!record || this.isDeleted(record, layerGroupDeletionTarget(pageId, id))) {
      throw new Error("수정할 레이어 그룹을 찾을 수 없습니다.");
    }
    const current = this.readLayerGroupPayload(record);
    if (!current) throw new Error("레이어 그룹 레코드가 손상되었습니다.");
    const set = patch.set ? cloneJsonObject(patch.set) : {};
    for (const key of Object.keys(set)) {
      if (!STUDIO_CRDT_LAYER_GROUP_PROPERTY_KEYS.has(key)) {
        throw new Error(`레이어 그룹의 ${key} 속성은 동기화할 수 없습니다.`);
      }
    }
    validateUnsetKeys(
      patch.unset ?? [],
      STUDIO_CRDT_LAYER_GROUP_PROPERTY_KEYS,
      ["name"]
    );
    const props = { ...current.props, ...set };
    for (const key of patch.unset ?? []) delete props[key];
    validateStudioCrdtLayerGroupPayload({
      version: STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
      props,
    });
    this.doc.transact(() => {
      setCrdtProperties(record, PROPERTY_PREFIX, set);
      for (const key of patch.unset ?? []) record.set(`${UNSET_PROPERTY_PREFIX}${key}`, true);
    }, STUDIO_CRDT_ORIGIN_LOCAL);
    return this.requiredLayerGroup(pageId, id);
  }

  deleteLayerGroup(pageId: string, id: string): boolean {
    this.assertAlive();
    const record = this.layerGroupRecord(studioCrdtLayerGroupKey(pageId, id));
    const target = layerGroupDeletionTarget(pageId, id);
    if (!record || this.isDeleted(record, target)) return false;
    this.doc.transact(() => this.addDeletionOperation(target), STUDIO_CRDT_ORIGIN_LOCAL);
    return true;
  }

  restoreLayerGroup(pageId: string, id: string): boolean {
    this.assertAlive();
    const record = this.layerGroupRecord(studioCrdtLayerGroupKey(pageId, id));
    return record
      ? this.restoreDeletedRecord(record, layerGroupDeletionTarget(pageId, id))
      : false;
  }

  getLayerGroup(
    pageId: string,
    id: string,
    includeDeleted = false
  ): StudioCrdtLayerGroupRecord | null {
    this.assertAlive();
    const compositeKey = studioCrdtLayerGroupKey(pageId, id);
    const record = this.layerGroupRecord(compositeKey);
    if (!record) return null;
    const result = this.readLayerGroupRecord(compositeKey, record);
    if (!result || (!includeDeleted && result.deleted)) return null;
    return result;
  }

  getLayerGroups(query: StudioCrdtLayerGroupQuery = {}): StudioCrdtLayerGroupRecord[] {
    this.assertAlive();
    this.drainDirtyLayerGroupIds();
    const records: StudioCrdtLayerGroupRecord[] = [];
    for (const cached of this.layerGroupRecordCache.values()) {
      if (!cached) continue;
      if (!query.includeDeleted && cached.deleted) continue;
      if (query.pageId !== undefined && cached.pageId !== query.pageId) continue;
      records.push({ ...cached });
    }
    return records.sort(
      (left, right) => left.pageId.localeCompare(right.pageId) || left.id.localeCompare(right.id)
    );
  }

  /**
   * Adds the immutable set-union of one validated raster replica. Existing entries are never
   * overwritten or deleted. Every conflict is preflighted before the Yjs transaction because Yjs
   * transactions are atomic for observers but do not roll back JavaScript exceptions.
   */
  mergeRasterOperationLog(value: StudioRasterOperationLog): StudioRasterOperationLog {
    this.assertAlive();
    const incoming = createStudioRasterOperationLog(value);
    const snapshot = this.readExactRasterDocumentSnapshot();
    const surfaceId = incoming.surface.surfaceId;
    const surfaceJson = canonicalStudioRasterJson(incoming.surface);
    const existingSurfaceValue = this.rasterSurfaces.get(surfaceId);
    if (existingSurfaceValue !== undefined && existingSurfaceValue !== surfaceJson) {
      throw new Error("같은 래스터 surfaceId가 서로 다른 표면 계약을 가리킵니다.");
    }
    const current = snapshot.logs.get(surfaceId) ?? createStudioRasterOperationLog({
      version: STUDIO_RASTER_CRDT_VERSION,
      surface: incoming.surface,
      operations: [],
      undoOperations: [],
      undoAcknowledgements: [],
    });
    const merged = mergeStudioRasterOperationLogs([current, incoming]);
    for (const checkpoint of snapshot.checkpoints) {
      if (checkpoint.surface.surfaceId === surfaceId) {
        this.assertRasterCheckpointMatchesLog(checkpoint, merged);
      }
    }
    const operationEntries = merged.operations.map((operation) => ({
      id: operation.operationId,
      value: canonicalStudioRasterJson({ surfaceId, operation }),
    }));
    const undoEntries = merged.undoOperations.map((undoOperation) => ({
      id: undoOperation.undoOperationId,
      value: canonicalStudioRasterJson({ surfaceId, undoOperation }),
    }));
    const acknowledgementEntries = merged.undoAcknowledgements.map((acknowledgement) => ({
      id: acknowledgement.acknowledgementId,
      value: canonicalStudioRasterJson({ surfaceId, acknowledgement }),
    }));
    this.assertImmutableRasterEntries(this.rasterOperations, operationEntries, "래스터 작업");
    this.assertImmutableRasterEntries(this.rasterUndoOperations, undoEntries, "래스터 실행 취소");
    this.assertImmutableRasterEntries(
      this.rasterUndoAcknowledgements,
      acknowledgementEntries,
      "래스터 복원 확인"
    );
    this.assertRasterGlobalIdentities(snapshot, [
      ...operationEntries.map(({ id }) => ({ id, kind: "operation" as const })),
      ...undoEntries.map(({ id }) => ({ id, kind: "undo-operation" as const })),
      ...acknowledgementEntries.map(({ id }) => ({
        id,
        kind: "undo-acknowledgement" as const,
      })),
    ]);
    const writesSurface = existingSurfaceValue === undefined;
    const missingOperations = operationEntries.filter(({ id }) => !this.rasterOperations.has(id));
    const missingUndos = undoEntries.filter(({ id }) => !this.rasterUndoOperations.has(id));
    const missingAcknowledgements = acknowledgementEntries.filter(
      ({ id }) => !this.rasterUndoAcknowledgements.has(id)
    );
    if (this.rasterSurfaces.size + (writesSurface ? 1 : 0) > STUDIO_CRDT_RASTER_MAX_SURFACES ||
        this.rasterOperations.size + missingOperations.length > STUDIO_RASTER_MAX_OPERATIONS ||
        this.rasterUndoOperations.size + missingUndos.length > STUDIO_RASTER_MAX_UNDO_OPERATIONS ||
        this.rasterUndoAcknowledgements.size + missingAcknowledgements.length >
          STUDIO_RASTER_MAX_UNDO_OPERATIONS) {
      throw new Error("래스터 CRDT 문서 전역 root 수가 허용 한도를 초과했습니다.");
    }
    this.assertRasterProjectedAssetBudget(snapshot, incoming.operations, []);
    if (
      writesSurface || missingOperations.length > 0 || missingUndos.length > 0 ||
      missingAcknowledgements.length > 0
    ) {
      this.assertRasterMutationFitsTransport({
        surface: writesSurface ? { id: surfaceId, value: surfaceJson } : undefined,
        operations: missingOperations,
        undoOperations: missingUndos,
        undoAcknowledgements: missingAcknowledgements,
      });
      this.doc.transact(() => {
        if (writesSurface) this.rasterSurfaces.set(surfaceId, surfaceJson);
        for (const entry of missingOperations) this.rasterOperations.set(entry.id, entry.value);
        for (const entry of missingUndos) this.rasterUndoOperations.set(entry.id, entry.value);
        for (const entry of missingAcknowledgements) {
          this.rasterUndoAcknowledgements.set(entry.id, entry.value);
        }
      }, STUDIO_CRDT_ORIGIN_LOCAL);
    }
    return merged;
  }

  getRasterOperationLog(surfaceId: string): StudioRasterOperationLog | null {
    this.assertAlive();
    assertRasterSafeId(surfaceId, "래스터 surface");
    return this.tryReadExactRasterDocumentSnapshot()?.logs.get(surfaceId) ?? null;
  }

  /**
   * getRasterOperationLog 와 동일하지만 파싱·검증(JSON.parse + canonical 재직렬화 비교, exact-schema
   * 검증)을 Worker에서 실행한다 — 화면에 보이는 surface 하나만 필요한 렌더 경로(예:
   * StudioRasterCrdtSurface)가 원격 협업자 트랜잭션마다 메인 스레드를 막지 않도록. Y.Doc에서 각
   * 래스터 root의 원시 항목만 동기로 뽑아내고(가벼움 — JSON 파싱 없음), 무거운 파싱은 Worker(또는
   * 폴백 시 동일 로직의 동기 실행)로 넘긴다. mergeRasterOperationLog 의 로컬 쓰기 프리플라이트처럼
   * Yjs 트랜잭션 준비 도중 동기 결과가 필요한 호출부는 계속 getRasterOperationLog 를 써야 한다.
   */
  async getRasterOperationLogAsync(
    surfaceId: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<StudioRasterOperationLog | null> {
    this.assertAlive();
    assertRasterSafeId(surfaceId, "래스터 surface");
    const snapshot = await this.tryReadExactRasterDocumentSnapshotAsync(options.signal);
    return snapshot?.logs.get(surfaceId) ?? null;
  }

  getRasterOperationLogs(): StudioRasterOperationLog[] {
    this.assertAlive();
    const snapshot = this.tryReadExactRasterDocumentSnapshot();
    if (!snapshot) return [];
    return [...snapshot.logs.values()].sort((left, right) => (
      left.surface.surfaceId < right.surface.surfaceId ? -1 :
      left.surface.surfaceId > right.surface.surfaceId ? 1 : 0
    ));
  }

  getRasterCompactionCheckpoints(surfaceId?: string): StudioRasterCompactionCheckpoint[] {
    // Advisory metadata only. The wire form does not carry trusted replica membership/frontiers,
    // so callers must never use this as an authoritative replay base or prune events from it.
    this.assertAlive();
    if (surfaceId !== undefined) assertRasterSafeId(surfaceId, "래스터 surface");
    const snapshot = this.tryReadExactRasterDocumentSnapshot();
    if (!snapshot) return [];
    const checkpoints = snapshot.checkpoints.filter((checkpoint) => (
      surfaceId === undefined || checkpoint.surface.surfaceId === surfaceId
    ));
    return checkpoints.sort((left, right) => {
      const order = compareStudioRasterEventOrder(left.through, right.through);
      if (order !== 0) return order;
      return left.checkpointId < right.checkpointId ? -1 :
        left.checkpointId > right.checkpointId ? 1 : 0;
    });
  }

  applyUpdate(update: Uint8Array, origin: unknown = STUDIO_CRDT_ORIGIN_REMOTE): void {
    this.assertAlive();
    if (update.byteLength === 0 || update.byteLength > STUDIO_CRDT_UPDATE_MAX_BYTES) {
      throw new Error("증분 CRDT 업데이트 크기가 허용 범위를 벗어났습니다.");
    }
    Y.applyUpdate(this.doc, update, origin);
  }

  applyUpdateBase64(update: string, origin: unknown = STUDIO_CRDT_ORIGIN_REMOTE): void {
    this.applyUpdate(decodeStudioCrdtUpdate(update), origin);
  }

  applySyncResponse(response: StudioCrdtSyncResponse): void {
    this.assertAlive();
    const update = decodeStudioCrdtSyncChunks(response.chunks, response.totalBytes);
    Y.applyUpdate(this.doc, update, STUDIO_CRDT_ORIGIN_SYNC);
  }

  encodeStateVector(): Uint8Array {
    this.assertAlive();
    return Y.encodeStateVector(this.doc);
  }

  getStateVectorBase64(): string {
    return encodeStudioCrdtStateVector(this.encodeStateVector());
  }

  encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array {
    this.assertAlive();
    return Y.encodeStateAsUpdate(this.doc, remoteStateVector);
  }

  encodeMissingUpdate(serverStateVectorBase64: string): Uint8Array {
    return this.encodeStateAsUpdate(decodeStudioCrdtStateVector(serverStateVectorBase64));
  }

  encodeMissingUpdateBase64(serverStateVectorBase64: string): string {
    const update = this.encodeMissingUpdate(serverStateVectorBase64);
    if (update.byteLength > STUDIO_CRDT_UPDATE_MAX_BYTES) {
      throw new Error(
        "오프라인 변경분이 단일 업로드 한도를 초과했습니다. 연결 상태를 유지한 채 대기 중인 증분 업데이트를 다시 전송해 주세요."
      );
    }
    return encodeStudioCrdtUpdate(update);
  }

  getUpdateBase64(update: Uint8Array): string {
    return encodeStudioCrdtUpdate(update);
  }

  destroy(): void {
    if (this.destroyed) return;
    for (const dispose of [...this.cleanup]) dispose();
    this.cleanup.clear();
    this.destroyed = true;
    this.doc.destroy();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error("이미 닫힌 CRDT 문서입니다.");
  }

  private assertImmutableRasterEntries(
    root: Y.Map<string>,
    entries: readonly { readonly id: string; readonly value: string }[],
    label: string
  ): void {
    for (const entry of entries) {
      const existing = root.get(entry.id);
      if (existing !== undefined && existing !== entry.value) {
        throw new Error(`같은 ${label} ID가 서로 다른 불변 내용을 가리킵니다.`);
      }
    }
  }

  /**
   * Strict local-write preflight. Read APIs remain fail-closed for malformed remote state, while a
   * new local event is rejected until every existing raster root can be accounted for globally.
   */
  private readExactRasterDocumentSnapshot(): StudioCrdtRasterDocumentSnapshot {
    return readStudioCrdtRasterDocument(this.doc);
  }

  private assertRasterCheckpointMatchesLog(
    checkpoint: StudioRasterCompactionCheckpoint,
    log: StudioRasterOperationLog
  ): void {
    const operationKey = (operation: StudioRasterOperation) => ({
      ...operation.order,
      eventId: operation.operationId,
    });
    const undoKey = (operation: StudioRasterUndoOperation) => ({
      ...operation.order,
      eventId: operation.undoOperationId,
    });
    const acknowledgementKey = (acknowledgement: StudioRasterUndoAcknowledgement) => ({
      ...acknowledgement.order,
      eventId: acknowledgement.acknowledgementId,
    });
    const allKeys = [
      ...log.operations.map(operationKey),
      ...log.undoOperations.map(undoKey),
      ...log.undoAcknowledgements.map(acknowledgementKey),
    ];
    if (!allKeys.some((key) => (
      key.logicalClock === checkpoint.through.logicalClock &&
      key.actorId === checkpoint.through.actorId &&
      key.eventId === checkpoint.through.eventId
    ))) {
      throw new Error("래스터 checkpoint 경계가 실제 이벤트와 일치하지 않습니다.");
    }
    const sealedOperationIds = log.operations
      .filter((operation) => compareStudioRasterEventOrder(operationKey(operation), checkpoint.through) <= 0)
      .map(({ operationId }) => operationId)
      .sort();
    const sealedUndoOperationIds = log.undoOperations
      .filter((operation) => compareStudioRasterEventOrder(undoKey(operation), checkpoint.through) <= 0)
      .map(({ undoOperationId }) => undoOperationId)
      .sort();
    const sealedUndoAcknowledgementIds = log.undoAcknowledgements
      .filter((acknowledgement) => (
        compareStudioRasterEventOrder(acknowledgementKey(acknowledgement), checkpoint.through) <= 0
      ))
      .map(({ acknowledgementId }) => acknowledgementId)
      .sort();
    if (canonicalStudioRasterJson(sealedOperationIds) !==
          canonicalStudioRasterJson(checkpoint.sealedOperationIds) ||
        canonicalStudioRasterJson(sealedUndoOperationIds) !==
          canonicalStudioRasterJson(checkpoint.sealedUndoOperationIds) ||
        canonicalStudioRasterJson(sealedUndoAcknowledgementIds) !==
          canonicalStudioRasterJson(checkpoint.sealedUndoAcknowledgementIds)) {
      throw new Error("래스터 checkpoint 봉인 집합이 안정 prefix와 일치하지 않습니다.");
    }
    const sealedOperations = new Set(sealedOperationIds);
    const sealedUndos = new Set(sealedUndoOperationIds);
    if (log.undoOperations.some((operation) => (
      compareStudioRasterEventOrder(undoKey(operation), checkpoint.through) > 0 &&
      sealedOperations.has(operation.targetOperationId)
    )) || log.undoAcknowledgements.some((acknowledgement) => (
      compareStudioRasterEventOrder(acknowledgementKey(acknowledgement), checkpoint.through) > 0 &&
      sealedUndos.has(acknowledgement.undoOperationId)
    ))) {
      throw new Error("래스터 checkpoint가 닫히지 않은 undo horizon을 봉인합니다.");
    }
  }

  private assertRasterGlobalIdentities(
    snapshot: StudioCrdtRasterDocumentSnapshot,
    projected: readonly {
      readonly id: string;
      readonly kind: StudioCrdtRasterIdentityKind;
    }[]
  ): void {
    const identities = new Map(snapshot.identityKinds);
    for (const entry of projected) {
      const existingKind = identities.get(entry.id);
      if (existingKind !== undefined && existingKind !== entry.kind) {
        throw new Error("래스터 이벤트 UUID는 operation/undo/ack/checkpoint 전체에서 전역 고유해야 합니다.");
      }
      identities.set(entry.id, entry.kind);
    }
  }

  private assertRasterProjectedAssetBudget(
    snapshot: StudioCrdtRasterDocumentSnapshot,
    operations: readonly StudioRasterOperation[],
    checkpointAssets: readonly StudioRasterAssetReference[]
  ): void {
    const assets = new Map(snapshot.assets);
    let referencedBytes = snapshot.referencedBytes;
    for (const operation of operations) {
      for (const patch of operation.patches) {
        referencedBytes += addRasterAsset(assets, patch.effect.payload, "래스터 operation 자산");
        if (patch.selectionMask) {
          referencedBytes += addRasterAsset(assets, patch.selectionMask, "래스터 selection 자산");
        }
      }
    }
    for (const asset of checkpointAssets) {
      referencedBytes += addRasterAsset(assets, asset, "래스터 checkpoint 자산");
    }
    if (referencedBytes > STUDIO_CRDT_RASTER_MAX_REFERENCED_BYTES) {
      throw new Error("래스터 CRDT 문서 전역 자산 참조 예산을 초과했습니다.");
    }
  }

  private assertRasterMutationFitsTransport(mutation: StudioCrdtRasterMutation): void {
    const probe = new Y.Doc();
    try {
      probe.transact(() => {
        if (mutation.surface) {
          probe.getMap<string>(STUDIO_CRDT_RASTER_SURFACES_ROOT)
            .set(mutation.surface.id, mutation.surface.value);
        }
        const operations = probe.getMap<string>(STUDIO_CRDT_RASTER_OPERATIONS_ROOT);
        for (const entry of mutation.operations ?? []) operations.set(entry.id, entry.value);
        const undoOperations = probe.getMap<string>(STUDIO_CRDT_RASTER_UNDO_OPERATIONS_ROOT);
        for (const entry of mutation.undoOperations ?? []) undoOperations.set(entry.id, entry.value);
        const acknowledgements = probe.getMap<string>(STUDIO_CRDT_RASTER_UNDO_ACKS_ROOT);
        for (const entry of mutation.undoAcknowledgements ?? []) {
          acknowledgements.set(entry.id, entry.value);
        }
      });
      const encoded = Y.encodeStateAsUpdate(probe);
      if (encoded.byteLength + RASTER_LOCAL_UPDATE_ENCODING_HEADROOM_BYTES >
          STUDIO_CRDT_UPDATE_MAX_BYTES) {
        throw new Error(
          "래스터 CRDT 로컬 업데이트가 전송 한도를 초과합니다. 더 작은 이벤트 묶음으로 나눠 주세요."
        );
      }
    } finally {
      probe.destroy();
    }
  }

  private tryReadExactRasterDocumentSnapshot(): StudioCrdtRasterDocumentSnapshot | null {
    try {
      return this.readExactRasterDocumentSnapshot();
    } catch {
      return null;
    }
  }

  /** Worker-backed counterpart of tryReadExactRasterDocumentSnapshot — see getRasterOperationLogAsync. */
  private async tryReadExactRasterDocumentSnapshotAsync(
    signal?: AbortSignal
  ): Promise<StudioCrdtRasterDocumentSnapshot | null> {
    try {
      const roots = extractStudioCrdtRasterRawRoots(this.doc);
      if (!roots) return null;
      const { snapshot } = await runStudioCrdtRasterWorker(roots, { signal });
      return snapshot;
    } catch {
      return null;
    }
  }

  private assertStrokeInput(input: StudioCrdtStrokeInput, allowEmpty: boolean): void {
    assertId(input.id, "획");
    assertId(input.pageId, "페이지");
    assertId(input.layerId, "레이어");
    validatePayload(input.payload, allowEmpty);
  }

  private assertSceneElementInput(input: StudioCrdtSceneElementInput): void {
    assertId(input.id, "장면 요소");
    assertId(input.pageId, "페이지");
    assertId(input.layerId, "레이어");
    validateStudioCrdtSceneElementPayload(input.payload);
  }

  private withoutSamples(input: StudioCrdtStrokeInput): StudioCrdtStrokeInput {
    return {
      ...input,
      payload: {
        ...input.payload,
        points: [],
        pressures: [],
        tiltXs: [],
        tiltYs: [],
        twists: [],
        speeds: [],
        tangentialPressures: [],
      },
    };
  }

  private appendNormalizedSamples(
    record: Y.Map<unknown>,
    normalized: ReturnType<typeof normalizedSamples>
  ): void {
    const targets = new Map<StudioCrdtSampleArrayKey, Y.Array<number>>();
    for (const key of SAMPLE_ARRAY_KEYS) {
      const target = yArray(record, key);
      if (!target) throw new Error("획 샘플 배열이 손상되었습니다.");
      targets.set(key, target);
    }
    const sampleTotal = normalized.points.length / 2;
    for (let start = 0; start < sampleTotal; start += STUDIO_CRDT_REPLACE_CHUNK_SAMPLES) {
      const end = Math.min(sampleTotal, start + STUDIO_CRDT_REPLACE_CHUNK_SAMPLES);
      this.doc.transact(() => {
        for (const key of SAMPLE_ARRAY_KEYS) {
          const values = key === "points"
            ? normalized.points.slice(start * 2, end * 2)
            : normalized[key].slice(start, end);
          targets.get(key)!.push(values);
        }
      }, STUDIO_CRDT_ORIGIN_LOCAL);
    }
  }

  private changedIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedStrokeIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedStrokeIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedSceneElementIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedSceneElementIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedSceneElementIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedPageIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedPageIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedPageIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedLayerGroupIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedLayerGroupIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedLayerGroupIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedRasterSurfaceIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedRasterSurfaceIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedRasterSurfaceIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedRasterOperationIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedRasterOperationIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedRasterOperationIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedRasterUndoOperationIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedRasterUndoOperationIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedRasterUndoOperationIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedRasterUndoAcknowledgementIdsFor(
    transaction: Y.Transaction
  ): Set<string> {
    const existing = this.changedRasterUndoAcknowledgementIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedRasterUndoAcknowledgementIdsByTransaction.set(transaction, created);
    return created;
  }

  private changedRasterCheckpointIdsFor(transaction: Y.Transaction): Set<string> {
    const existing = this.changedRasterCheckpointIdsByTransaction.get(transaction);
    if (existing) return existing;
    const created = new Set<string>();
    this.changedRasterCheckpointIdsByTransaction.set(transaction, created);
    return created;
  }

  private indexDeletionOperation(operationId: string, target: string): void {
    if (!UUID_PATTERN.test(operationId) || !parseDeletionTarget(target)) return;
    const operationIds = this.deletionOpIdsByTarget.get(target) ?? new Set<string>();
    operationIds.add(operationId);
    this.deletionOpIdsByTarget.set(target, operationIds);
  }

  private unindexDeletionOperation(operationId: string, target: string): void {
    const operationIds = this.deletionOpIdsByTarget.get(target);
    if (!operationIds) return;
    operationIds.delete(operationId);
    if (operationIds.size === 0) this.deletionOpIdsByTarget.delete(target);
  }

  private markDeletionTargetChanged(targetValue: string, transaction: Y.Transaction): void {
    const target = parseDeletionTarget(targetValue);
    if (!target) return;
    if (target.kind === "stroke") this.changedIdsFor(transaction).add(target.id);
    else if (target.kind === "scene") {
      this.changedSceneElementIdsFor(transaction).add(target.id);
    } else if (target.kind === "page") {
      this.changedPageIdsFor(transaction).add(target.id);
    } else {
      this.changedLayerGroupIdsFor(transaction).add(
        studioCrdtLayerGroupKey(target.pageId, target.id)
      );
    }
  }

  private activeDeletionOperationIds(target: string): string[] {
    const operationIds = this.deletionOpIdsByTarget.get(target);
    if (!operationIds) return [];
    const active: string[] = [];
    for (const operationId of operationIds) {
      if (
        this.deletionOps.get(operationId) === target &&
        this.deletionAcks.get(operationId) !== target
      ) active.push(operationId);
    }
    return active;
  }

  private hasActiveDeletionOperation(target: string): boolean {
    const operationIds = this.deletionOpIdsByTarget.get(target);
    if (!operationIds) return false;
    for (const operationId of operationIds) {
      if (
        this.deletionOps.get(operationId) === target &&
        this.deletionAcks.get(operationId) !== target
      ) return true;
    }
    return false;
  }

  private isDeleted(record: Y.Map<unknown>, target: string): boolean {
    return record.get("deleted") === true || this.hasActiveDeletionOperation(target);
  }

  private addDeletionOperation(target: string): void {
    if (!parseDeletionTarget(target)) throw new Error("삭제 대상 식별자가 올바르지 않습니다.");
    if (this.deletionOps.size >= STUDIO_CRDT_DELETION_OPERATION_MAX_ENTRIES) {
      throw new Error("삭제 작업 기록이 최대 한도를 초과했습니다. 문서를 압축해 주세요.");
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const operationId = createDeletionOperationId();
      if (this.deletionOps.has(operationId) || this.deletionAcks.has(operationId)) continue;
      this.deletionOps.set(operationId, target);
      return;
    }
    throw new Error("충돌 없는 삭제 작업 식별자를 생성하지 못했습니다.");
  }

  private acknowledgeCurrentDeletionOperations(record: Y.Map<unknown>, target: string): void {
    const activeOperationIds = this.activeDeletionOperationIds(target);
    let newAcknowledgementCount = 0;
    for (const operationId of activeOperationIds) {
      const current = this.deletionAcks.get(operationId);
      if (current === undefined) newAcknowledgementCount += 1;
      else if (current !== target) {
        throw new Error("삭제 복원 승인 기록이 손상되었습니다.");
      }
    }
    if (
      this.deletionAcks.size + newAcknowledgementCount >
      STUDIO_CRDT_DELETION_OPERATION_MAX_ENTRIES
    ) {
      throw new Error("삭제 복원 승인 기록이 최대 한도를 초과했습니다. 문서를 압축해 주세요.");
    }
    // `deleted` is a read-only legacy fallback for normal edits. Only an explicit restore may
    // clear it; new deletes and all ordinary writes live exclusively in the OR-set roots.
    if (record.get("deleted") === true) record.set("deleted", false);
    for (const operationId of activeOperationIds) {
      if (!this.deletionAcks.has(operationId)) this.deletionAcks.set(operationId, target);
    }
  }

  private restoreDeletedRecord(record: Y.Map<unknown>, target: string): boolean {
    if (!this.isDeleted(record, target)) return false;
    this.doc.transact(
      () => this.acknowledgeCurrentDeletionOperations(record, target),
      STUDIO_CRDT_ORIGIN_LOCAL
    );
    return true;
  }

  private observeSceneElementRoot(id: string): void {
    const rootName = sceneElementRootName(id);
    if (this.observedSceneElementRoots.has(rootName)) return;
    let value: Y.Map<unknown>;
    try {
      value = this.doc.getMap<unknown>(rootName);
    } catch {
      return;
    }
    const listener = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
      this.changedSceneElementIdsFor(transaction).add(id);
    };
    value.observe(listener);
    this.observedSceneElementRoots.add(rootName);
    const dispose = () => {
      value.unobserve(listener);
      this.observedSceneElementRoots.delete(rootName);
    };
    this.cleanup.add(dispose);
  }

  private observePageRoot(id: string): void {
    const rootName = pageRootName(id);
    if (this.observedPageRoots.has(rootName)) return;
    let value: Y.Map<unknown>;
    try {
      value = this.doc.getMap<unknown>(rootName);
    } catch {
      return;
    }
    const listener = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
      this.changedPageIdsFor(transaction).add(id);
    };
    value.observe(listener);
    this.observedPageRoots.add(rootName);
    const dispose = () => {
      value.unobserve(listener);
      this.observedPageRoots.delete(rootName);
    };
    this.cleanup.add(dispose);
  }

  private observeLayerGroupRoot(compositeKey: string): void {
    const rootName = layerGroupRootName(compositeKey);
    if (this.observedLayerGroupRoots.has(rootName)) return;
    let value: Y.Map<unknown>;
    try {
      value = this.doc.getMap<unknown>(rootName);
    } catch {
      return;
    }
    const listener = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
      this.changedLayerGroupIdsFor(transaction).add(compositeKey);
    };
    value.observe(listener);
    this.observedLayerGroupRoots.add(rootName);
    const dispose = () => {
      value.unobserve(listener);
      this.observedLayerGroupRoots.delete(rootName);
    };
    this.cleanup.add(dispose);
  }

  private sceneElementRecord(id: string, create = false): Y.Map<unknown> | null {
    if (!create && this.sceneElementIds.get(id) !== true) return null;
    const rootName = sceneElementRootName(id);
    let value: Y.Map<unknown>;
    try {
      value = this.doc.getMap<unknown>(rootName);
    } catch {
      return null;
    }
    this.observeSceneElementRoot(id);
    return value as Y.Map<unknown>;
  }

  private pageRecord(id: string, create = false): Y.Map<unknown> | null {
    if (!create && this.pageIds.get(id) !== true) return null;
    const rootName = pageRootName(id);
    let value: Y.Map<unknown>;
    try {
      value = this.doc.getMap<unknown>(rootName);
    } catch {
      return null;
    }
    this.observePageRoot(id);
    return value as Y.Map<unknown>;
  }

  private layerGroupRecord(compositeKey: string, create = false): Y.Map<unknown> | null {
    if (!create && this.layerGroupIds.get(compositeKey) !== true) return null;
    const rootName = layerGroupRootName(compositeKey);
    let value: Y.Map<unknown>;
    try {
      value = this.doc.getMap<unknown>(rootName);
    } catch {
      return null;
    }
    this.observeLayerGroupRoot(compositeKey);
    return value as Y.Map<unknown>;
  }

  private readSceneElementPayload(record: Y.Map<unknown>): StudioCrdtSceneElementPayload | null {
    const version = record.get("payloadVersion");
    const type = record.get("type");
    if (
      version !== STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION ||
      !isStudioCrdtSceneElementType(type)
    ) return null;
    try {
      return validateStudioCrdtSceneElementPayload({ version, type, props: readCrdtProperties(record) });
    } catch {
      return null;
    }
  }

  private readSceneElementRecord(
    id: string,
    record: Y.Map<unknown>,
    orderIndex: number
  ): StudioCrdtSceneElementRecord | null {
    const pageId = readString(record, "pageId");
    const layerId = readString(record, "layerId");
    const payload = this.readSceneElementPayload(record);
    if (readString(record, "id") !== id || !pageId || !layerId || !payload) return null;
    return {
      id,
      pageId,
      layerId,
      payload,
      deleted: this.isDeleted(record, sceneDeletionTarget(id)),
      orderIndex,
    };
  }

  private readPagePayload(record: Y.Map<unknown>): StudioCrdtPagePayload | null {
    const version = record.get("payloadVersion");
    if (version !== STUDIO_CRDT_PAGE_PAYLOAD_VERSION) return null;
    try {
      return validateStudioCrdtPagePayload({ version, props: readCrdtProperties(record) });
    } catch {
      return null;
    }
  }

  private readPageRecord(
    id: string,
    record: Y.Map<unknown>,
    orderIndex: number
  ): StudioCrdtPageRecord | null {
    const payload = this.readPagePayload(record);
    if (readString(record, "id") !== id || !payload) return null;
    return { id, payload, deleted: this.isDeleted(record, pageDeletionTarget(id)), orderIndex };
  }

  private readLayerGroupPayload(record: Y.Map<unknown>): StudioCrdtLayerGroupPayload | null {
    const version = record.get("payloadVersion");
    if (version !== STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION) return null;
    try {
      return validateStudioCrdtLayerGroupPayload({
        version,
        props: readCrdtProperties(record),
      });
    } catch {
      return null;
    }
  }

  private readLayerGroupRecord(
    compositeKey: string,
    record: Y.Map<unknown>
  ): StudioCrdtLayerGroupRecord | null {
    const id = readString(record, "id");
    const pageId = readString(record, "pageId");
    const payload = this.readLayerGroupPayload(record);
    if (!id || !pageId || !payload) return null;
    try {
      if (studioCrdtLayerGroupKey(pageId, id) !== compositeKey) return null;
    } catch {
      return null;
    }
    return {
      id,
      pageId,
      payload,
      deleted: this.isDeleted(record, layerGroupDeletionTarget(pageId, id)),
    };
  }

  private registerRecord(id: string, value: unknown): void {
    if (!(value instanceof Y.Map)) return;
    this.strokeIdByType.set(value, id);
    for (const key of SAMPLE_ARRAY_KEYS) {
      const samples = yArray(value, key);
      if (samples) this.strokeIdByType.set(samples, id);
    }
  }

  private registerOrderEntry(value: unknown): void {
    if (!(value instanceof Y.Map)) return;
    const id = orderEntryValue(value, "strokeId");
    if (id) this.strokeIdByType.set(value, id);
  }

  // strokeRecordCache/sceneElementRecordCache/pageRecordCache/layerGroupRecordCache 갱신 — 생성자
  // 부트스트랩과 reconcileRecordCaches(afterTransaction) 양쪽에서 호출된다. 디코딩 로직은 기존
  // readRecord/readSceneElementRecord/readPageRecord/readLayerGroupRecord 를 그대로 재사용하고
  // (orderIndex 는 자리값 0 — get*() 가 캐시에서 꺼낸 뒤 order 배열 기준으로 새로 채운다), 결과는
  // deepFreeze 로 얼려 여러 get*() 호출 사이에서 안전하게 공유한다.

  private refreshStrokeRecordCache(id: string): void {
    const record = this.strokes.get(id);
    this.strokeRecordCache.set(
      id,
      record instanceof Y.Map ? deepFreeze(this.readRecord(id, record, 0)) : null
    );
  }

  private refreshSceneElementRecordCache(id: string): void {
    if (!exactText(id, MAX_ID_LENGTH)) {
      this.sceneElementRecordCache.set(id, null);
      return;
    }
    const record = this.sceneElementRecord(id);
    this.sceneElementRecordCache.set(
      id,
      record ? deepFreeze(this.readSceneElementRecord(id, record, 0)) : null
    );
  }

  private refreshPageRecordCache(id: string): void {
    if (!exactText(id, MAX_ID_LENGTH)) {
      this.pageRecordCache.set(id, null);
      return;
    }
    const record = this.pageRecord(id);
    this.pageRecordCache.set(id, record ? deepFreeze(this.readPageRecord(id, record, 0)) : null);
  }

  private refreshLayerGroupRecordCache(compositeKey: string): void {
    if (!exactText(compositeKey, MAX_LAYER_GROUP_KEY_LENGTH)) {
      this.layerGroupRecordCache.set(compositeKey, null);
      return;
    }
    const record = this.layerGroupRecord(compositeKey);
    this.layerGroupRecordCache.set(
      compositeKey,
      record ? deepFreeze(this.readLayerGroupRecord(compositeKey, record)) : null
    );
  }

  // dirty*Ids 를 실제로 재디코딩해 캐시에 반영한다 — get*() 호출 맨 앞에서만 실행된다(지연 갱신).
  // 개별 id 하나의 디코딩 실패가 나머지 id 나 이 트랜잭션의 다른 subscribeChanges 구독자 통지를
  // 막지 않도록 각 항목을 개별적으로 try/catch 한다 — 이 파일의 다른 read* 헬퍼들이 신뢰할 수 없는
  // 원격 CRDT 콘텐츠에 조용히 null 로 실패하는 것과 동일한 방어. 실패한 항목은 캐시의 마지막으로
  // 성공한 값을 그대로 둔다(있다면) — 일시적 실패로 이전엔 유효했던 레코드를 사라지게 만들지 않는다.

  private drainDirtyStrokeIds(): void {
    if (this.dirtyStrokeIds.size === 0) return;
    for (const id of this.dirtyStrokeIds) {
      try {
        this.refreshStrokeRecordCache(id);
      } catch {
        // 마지막으로 성공한 캐시 값 유지 — 위 주석 참고.
      }
    }
    this.dirtyStrokeIds.clear();
  }

  private drainDirtySceneElementIds(): void {
    if (this.dirtySceneElementIds.size === 0) return;
    for (const id of this.dirtySceneElementIds) {
      try {
        this.refreshSceneElementRecordCache(id);
      } catch {
        // 마지막으로 성공한 캐시 값 유지 — 위 주석 참고.
      }
    }
    this.dirtySceneElementIds.clear();
  }

  private drainDirtyPageIds(): void {
    if (this.dirtyPageIds.size === 0) return;
    for (const id of this.dirtyPageIds) {
      try {
        this.refreshPageRecordCache(id);
      } catch {
        // 마지막으로 성공한 캐시 값 유지 — 위 주석 참고.
      }
    }
    this.dirtyPageIds.clear();
  }

  private drainDirtyLayerGroupIds(): void {
    if (this.dirtyLayerGroupIds.size === 0) return;
    for (const compositeKey of this.dirtyLayerGroupIds) {
      try {
        this.refreshLayerGroupRecordCache(compositeKey);
      } catch {
        // 마지막으로 성공한 캐시 값 유지 — 위 주석 참고.
      }
    }
    this.dirtyLayerGroupIds.clear();
  }

  private createRecord(
    input: StudioCrdtStrokeInput,
    status: StudioCrdtStrokeRecord["status"]
  ): Y.Map<unknown> {
    const record = new Y.Map<unknown>();
    record.set("id", input.id);
    record.set("pageId", input.pageId);
    record.set("layerId", input.layerId);
    record.set("status", status);
    setPayloadMetadata(record, input.payload);
    const samples = normalizedSamples(input.payload, true);
    for (const key of SAMPLE_ARRAY_KEYS) record.set(key, createSampleArray(samples[key]));
    this.registerRecord(input.id, record);
    return record;
  }

  private createOrderEntry(input: Pick<StudioCrdtStrokeInput, "id" | "pageId" | "layerId">) {
    const entry = new Y.Map<unknown>();
    entry.set("strokeId", input.id);
    entry.set("pageId", input.pageId);
    entry.set("layerId", input.layerId);
    entry.set("active", true);
    this.registerOrderEntry(entry);
    return entry;
  }

  private createSceneOrderEntry(
    input: Pick<StudioCrdtSceneElementInput, "id" | "pageId" | "layerId">
  ): Y.Map<unknown> {
    const entry = new Y.Map<unknown>();
    entry.set("elementId", input.id);
    entry.set("pageId", input.pageId);
    entry.set("layerId", input.layerId);
    entry.set("kind", "scene");
    entry.set("active", true);
    return entry;
  }

  private insertSceneOrderEntry(
    input: Pick<StudioCrdtSceneElementInput, "id" | "pageId" | "layerId">,
    beforeElementId: string | null
  ): void {
    const entry = this.createSceneOrderEntry(input);
    if (beforeElementId === null) {
      this.order.push([entry]);
      return;
    }
    assertId(beforeElementId, "대상 요소");
    let targetIndex = -1;
    this.order.forEach((candidate, index) => {
      if (
        candidate instanceof Y.Map && candidate.get("active") === true &&
        mixedOrderEntryId(candidate) === beforeElementId &&
        this.isLiveMixedOrderEntry(candidate, input.pageId)
      ) {
        targetIndex = index;
      }
    });
    if (targetIndex < 0) this.order.push([entry]);
    else this.order.insert(targetIndex, [entry]);
  }

  private isLiveMixedOrderEntry(entry: Y.Map<unknown>, expectedPageId: string): boolean {
    const pageId = orderEntryValue(entry, "pageId");
    const layerId = orderEntryValue(entry, "layerId");
    if (pageId !== expectedPageId || !layerId) return false;
    const strokeId = orderEntryValue(entry, "strokeId");
    if (strokeId) {
      const stroke = this.strokes.get(strokeId);
      return stroke instanceof Y.Map && !this.isDeleted(stroke, strokeDeletionTarget(strokeId)) &&
        readString(stroke, "pageId") === pageId && readString(stroke, "layerId") === layerId;
    }
    const elementId = sceneOrderEntryId(entry);
    if (!elementId) return false;
    const element = this.sceneElementRecord(elementId);
    return element !== null && !this.isDeleted(element, sceneDeletionTarget(elementId)) &&
      readString(element, "pageId") === pageId && readString(element, "layerId") === layerId;
  }

  private deactivateMixedOrderEntries(id: string, idKey: "strokeId" | "elementId"): void {
    for (const entry of this.order) {
      if (
        entry instanceof Y.Map && entry.get("active") === true &&
        orderEntryValue(entry, idKey) === id
      ) {
        entry.set("active", false);
      }
    }
  }

  private assertMixedOrderEditBound(id: string, idKey: "strokeId" | "elementId"): void {
    let activeCount = 0;
    for (const entry of this.order) {
      if (
        entry instanceof Y.Map && entry.get("active") === true &&
        orderEntryValue(entry, idKey) === id
      ) {
        activeCount += 1;
        if (activeCount >= MAX_ACTIVE_ORDER_ENTRIES_PER_STROKE) {
          throw new Error("요소 순서 충돌이 너무 많아 안전하게 이동할 수 없습니다. 먼저 다시 동기화해 주세요.");
        }
      }
    }
  }

  private lastActiveMixedOrderIndex(id: string, idKey: "strokeId" | "elementId"): number {
    let result = Number.MAX_SAFE_INTEGER;
    this.order.forEach((entry, index) => {
      if (
        entry instanceof Y.Map && entry.get("active") === true &&
        orderEntryValue(entry, idKey) === id
      ) {
        result = index;
      }
    });
    return result;
  }

  private createPageOrderEntry(id: string): Y.Map<unknown> {
    const entry = new Y.Map<unknown>();
    entry.set("pageId", id);
    entry.set("active", true);
    return entry;
  }

  private insertPageOrderEntry(id: string, beforePageId: string | null): void {
    const entry = this.createPageOrderEntry(id);
    if (beforePageId === null) {
      this.pageOrder.push([entry]);
      return;
    }
    assertId(beforePageId, "대상 페이지");
    const targetRecord = this.pageRecord(beforePageId);
    let targetIndex = -1;
    this.pageOrder.forEach((candidate, index) => {
      if (
        candidate instanceof Y.Map && candidate.get("active") === true &&
        pageOrderEntryId(candidate) === beforePageId &&
        targetRecord !== null && !this.isDeleted(targetRecord, pageDeletionTarget(beforePageId)) &&
        readString(targetRecord, "id") === beforePageId
      ) {
        targetIndex = index;
      }
    });
    if (targetIndex < 0) this.pageOrder.push([entry]);
    else this.pageOrder.insert(targetIndex, [entry]);
  }

  private deactivatePageOrderEntries(id: string): void {
    for (const entry of this.pageOrder) {
      if (
        entry instanceof Y.Map && entry.get("active") === true && pageOrderEntryId(entry) === id
      ) {
        entry.set("active", false);
      }
    }
  }

  private assertPageOrderEditBound(id: string): void {
    let activeCount = 0;
    for (const entry of this.pageOrder) {
      if (
        entry instanceof Y.Map && entry.get("active") === true && pageOrderEntryId(entry) === id
      ) {
        activeCount += 1;
        if (activeCount >= MAX_ACTIVE_ORDER_ENTRIES_PER_STROKE) {
          throw new Error("페이지 순서 충돌이 너무 많아 안전하게 이동할 수 없습니다. 먼저 다시 동기화해 주세요.");
        }
      }
    }
  }

  private lastActivePageOrderIndex(id: string): number {
    let result = Number.MAX_SAFE_INTEGER;
    this.pageOrder.forEach((entry, index) => {
      if (
        entry instanceof Y.Map && entry.get("active") === true && pageOrderEntryId(entry) === id
      ) {
        result = index;
      }
    });
    return result;
  }

  private insertOrderEntry(
    input: Pick<StudioCrdtStrokeInput, "id" | "pageId" | "layerId">,
    beforeStrokeId: string | null
  ): void {
    const entry = this.createOrderEntry(input);
    if (beforeStrokeId === null) {
      this.order.push([entry]);
      return;
    }
    assertId(beforeStrokeId, "대상 획");
    let targetIndex = -1;
    this.order.forEach((candidate, index) => {
      if (
        candidate instanceof Y.Map &&
        candidate.get("active") === true &&
        mixedOrderEntryId(candidate) === beforeStrokeId &&
        this.isLiveMixedOrderEntry(candidate, input.pageId)
      ) {
        targetIndex = index;
      }
    });
    if (targetIndex < 0) this.order.push([entry]);
    else this.order.insert(targetIndex, [entry]);
  }

  private deactivateOrderEntries(id: string): void {
    for (const entry of this.order) {
      if (
        entry instanceof Y.Map &&
        entry.get("active") === true &&
        orderEntryValue(entry, "strokeId") === id
      ) {
        entry.set("active", false);
      }
    }
  }

  private assertOrderEditBound(id: string): void {
    let activeCount = 0;
    for (const entry of this.order) {
      if (
        entry instanceof Y.Map &&
        entry.get("active") === true &&
        orderEntryValue(entry, "strokeId") === id
      ) {
        activeCount += 1;
        if (activeCount >= MAX_ACTIVE_ORDER_ENTRIES_PER_STROKE) {
          throw new Error("획 순서 충돌이 너무 많아 안전하게 이동할 수 없습니다. 먼저 다시 동기화해 주세요.");
        }
      }
    }
  }

  private lastActiveOrderIndex(id: string): number {
    let result = Number.MAX_SAFE_INTEGER;
    this.order.forEach((entry, index) => {
      if (
        entry instanceof Y.Map &&
        entry.get("active") === true &&
        orderEntryValue(entry, "strokeId") === id
      ) {
        result = index;
      }
    });
    return result;
  }

  private readRecord(
    id: string,
    record: Y.Map<unknown>,
    orderIndex: number
  ): StudioCrdtStrokeRecord | null {
    this.registerRecord(id, record);
    const storedId = readString(record, "id");
    const pageId = readString(record, "pageId");
    const layerId = readString(record, "layerId");
    const status = record.get("status");
    const payload = readPayload(record);
    if (
      storedId !== id ||
      !pageId ||
      !layerId ||
      (status !== "drawing" && status !== "finalized") ||
      !payload
    ) {
      return null;
    }
    return {
      id,
      pageId,
      layerId,
      payload,
      status,
      deleted: this.isDeleted(record, strokeDeletionTarget(id)),
      orderIndex,
    };
  }

  private requiredStroke(id: string): StudioCrdtStrokeRecord {
    const result = this.getStroke(id, true);
    if (!result) throw new Error("CRDT 획을 읽지 못했습니다.");
    return result;
  }

  private requiredSceneElement(id: string): StudioCrdtSceneElementRecord {
    const result = this.getSceneElement(id, true);
    if (!result) throw new Error("CRDT 장면 요소를 읽지 못했습니다.");
    return result;
  }

  private requiredPage(id: string): StudioCrdtPageRecord {
    const result = this.getPage(id, true);
    if (!result) throw new Error("CRDT 페이지를 읽지 못했습니다.");
    return result;
  }

  private requiredLayerGroup(pageId: string, id: string): StudioCrdtLayerGroupRecord {
    const result = this.getLayerGroup(pageId, id, true);
    if (!result) throw new Error("CRDT 레이어 그룹을 읽지 못했습니다.");
    return result;
  }
}
