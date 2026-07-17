import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import { fromUint8Array, toUint8Array } from "js-base64";
import * as Y from "yjs";

import {
  appendedStudioCrdtRasterAssetReferences,
  appendsStudioCrdtRasterCheckpoint,
  assertStudioCrdtRasterAppendedEventAdmission,
  conflictsWithStudioCrdtRasterRootSnapshot,
  hasValidStudioCrdtRasterDocument,
  preservesStudioCrdtRasterRoots,
  snapshotStudioCrdtRasterRoots,
} from "../../../../../lib/studio-crdt-raster-document-contract";
import {
  STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS,
  STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK,
  STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
  STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES,
  STUDIO_WORK_ASSET_TYPES,
  StudioWorkAssetElementSchema,
  studioWorkAssetReferenceKey,
} from "../../../../../lib/studio-work-asset-contract";

import {
  STUDIO_CRDT_REPOSITORY,
  STUDIO_CRDT_SNAPSHOT_MAX_BYTES,
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  studioCrdtPayloadHash,
} from "./studio-crdt.repository";
import { StudioRasterAssetService } from "./studio-raster-asset.service";
import { StudioWorkAssetService } from "./studio-work-asset.service";

import type {
  DrizzleStudioCrdtTransaction,
  StudioCrdtHydrationState,
  StudioCrdtRepository,
  StudioCrdtUpdateRecord,
} from "./studio-crdt.repository";
import type { StudioRasterAssetReference } from "../../../../../lib/studio-crdt-raster-ops";
import type { StudioWorkAssetReference } from "../../../../../lib/studio-work-asset-contract";

export interface StudioCrdtRasterAssetAdmission {
  assertReferencesStored(
    actorUserId: string,
    workId: string,
    references: readonly StudioRasterAssetReference[],
    transaction?: DrizzleStudioCrdtTransaction
  ): Promise<void>;
}

export interface StudioCrdtWorkAssetAdmission {
  assertReferencesStored(
    actorUserId: string,
    workId: string,
    references: readonly StudioWorkAssetReference[],
    transaction?: DrizzleStudioCrdtTransaction
  ): Promise<void>;
}

export const STUDIO_CRDT_SERVICE_OPTIONS = Symbol("STUDIO_CRDT_SERVICE_OPTIONS");
export const STUDIO_CRDT_STATE_VECTOR_MAX_BYTES = 256 * 1_024;
export const STUDIO_CRDT_SYNC_DIFF_MAX_BYTES = STUDIO_CRDT_SNAPSHOT_MAX_BYTES;
export const STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES = 40 * 1_024;
export const STUDIO_CRDT_ACTIVE_WORK_ASSET_REFERENCE_MAX_COUNT =
  STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK;

const DEFAULT_COMPACT_UPDATE_COUNT = 512;
const DEFAULT_COMPACT_UPDATE_BYTES = 2 * 1_024 * 1_024;
const DEFAULT_COMPACT_INTERVAL_MS = 5 * 60_000;
const DEFAULT_IDLE_EVICTION_MS = 5 * 60_000;
const DEFAULT_EVICTION_SWEEP_MS = 60_000;
// A queued sync can retain a decoded 256 KiB state vector, so these are intentionally much lower
// than the gateway's identity-bucket cardinality. The normal 40 Hz/batched drawing path stays well
// below the room limit while a stalled database cannot retain an unbounded heap of request bodies.
const DEFAULT_MAX_PENDING_OPERATIONS_PER_WORK = 128;
const DEFAULT_MAX_PENDING_OPERATIONS_TOTAL = 512;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
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
const STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS = ["fill", "brush", "blendMode"] as const;
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
const STUDIO_CRDT_DELETION_TARGET_MAX_LENGTH = 384;
const STUDIO_CRDT_TEXT_ENCODER = new TextEncoder();
const STUDIO_WORK_ASSET_TYPE_SET = new Set<string>(STUDIO_WORK_ASSET_TYPES);
const STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEY_SET = new Set<string>(
  STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS
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
]);

const STUDIO_CRDT_LAYER_GROUP_KEYS = new Set(["name", "hidden", "locked"]);

export interface StudioCrdtServiceOptions {
  now?: () => Date;
  stateVectorMaxBytes?: number;
  compactUpdateCount?: number;
  compactUpdateBytes?: number;
  compactIntervalMs?: number;
  idleEvictionMs?: number;
  evictionSweepMs?: number;
  maxPendingOperationsPerWork?: number;
  maxPendingOperationsTotal?: number;
  scheduleInterval?: (handler: () => void, delay: number) => ReturnType<typeof setInterval>;
  cancelInterval?: (handle: ReturnType<typeof setInterval>) => void;
}

export interface StudioCrdtSyncResult {
  chunks: string[];
  chunkCount: number;
  totalBytes: number;
  serverStateVector: string;
  serverSequence: string;
}

export interface StudioCrdtApplyUpdateInput {
  workId: string;
  updateId: string;
  actorUserId: string;
  data: string;
}

export interface StudioCrdtApplyUpdateResult {
  duplicate: boolean;
  updateId: string;
  update: string;
  serverStateVector: string;
  serverSequence: string;
}

export class StudioCrdtInvalidPayloadError extends Error {
  constructor(message = "Invalid CRDT payload") {
    super(message);
    this.name = "StudioCrdtInvalidPayloadError";
  }
}

export class StudioCrdtUpdateIdConflictError extends Error {
  constructor() {
    super("CRDT update id was already used for different content");
    this.name = "StudioCrdtUpdateIdConflictError";
  }
}

export class StudioCrdtDocumentTooLargeError extends Error {
  constructor() {
    super("CRDT document exceeds the server byte budget");
    this.name = "StudioCrdtDocumentTooLargeError";
  }
}

/**
 * The operation was rejected before execution because this API process already has the bounded
 * amount of CRDT work it can retain safely. Clients may retry the same idempotent request after
 * backoff; no durable mutation has started when this error is raised.
 */
export class StudioCrdtBackpressureError extends Error {
  constructor() {
    super("CRDT operation queue is saturated");
    this.name = "StudioCrdtBackpressureError";
  }
}

export class StudioCrdtStorageCorruptionError extends Error {
  constructor(message = "Stored CRDT state is invalid") {
    super(message);
    this.name = "StudioCrdtStorageCorruptionError";
  }
}

interface CachedStudioCrdtDocument {
  doc: Y.Doc;
  sequence: bigint;
  compactedSequence: bigint;
  uncompactedUpdateCount: number;
  uncompactedUpdateBytes: number;
  lastCompactedAt: number;
  lastAccessedAt: number;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

export function decodeStudioCrdtBase64(
  value: string,
  maximumDecodedBytes: number,
  label: string
): Uint8Array {
  const maximumEncodedLength = Math.ceil(maximumDecodedBytes / 3) * 4;
  if (
    value.length === 0 ||
    value.length > maximumEncodedLength ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new StudioCrdtInvalidPayloadError(`${label} is not canonical base64`);
  }
  let decoded: Uint8Array;
  try {
    decoded = toUint8Array(value);
  } catch {
    throw new StudioCrdtInvalidPayloadError(`${label} is not valid base64`);
  }
  if (
    decoded.byteLength === 0 ||
    decoded.byteLength > maximumDecodedBytes ||
    fromUint8Array(decoded) !== value
  ) {
    throw new StudioCrdtInvalidPayloadError(`${label} exceeds its decoded byte budget`);
  }
  return decoded;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function chunkStudioCrdtSyncDiff(diff: Uint8Array): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < diff.byteLength; offset += STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES) {
    chunks.push(fromUint8Array(diff.subarray(offset, offset + STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES)));
  }
  return chunks;
}

export function encodeStudioCrdtServerStateVector(
  doc: Y.Doc,
  maximumDecodedBytes = STUDIO_CRDT_STATE_VECTOR_MAX_BYTES
): string {
  const stateVector = Y.encodeStateVector(doc);
  if (stateVector.byteLength > maximumDecodedBytes) {
    throw new StudioCrdtStorageCorruptionError(
      "Stored CRDT state vector exceeds its byte budget"
    );
  }
  return fromUint8Array(stateVector);
}

function validateStoredUpdate(update: StudioCrdtUpdateRecord, workId: string): void {
  if (
    update.workId !== workId ||
    update.sequence <= 0n ||
    update.payload.byteLength === 0 ||
    update.payload.byteLength > STUDIO_CRDT_UPDATE_MAX_BYTES
  ) {
    throw new StudioCrdtStorageCorruptionError("Stored CRDT update violates its contract");
  }
}

function isBoundedStudioCrdtId(value: unknown): value is string {
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

interface StudioCrdtWorkAssetReferenceSnapshot {
  identities: ReadonlyMap<string, string>;
  admittedReferences: ReadonlyMap<string, StudioWorkAssetReference>;
  activeCount: number;
}

/** Returns every materialized identity plus the non-tombstoned count in a valid document. */
function snapshotStudioWorkAssetReferences(
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
      if (!UUID_PATTERN.test(operationId) || !target || !studioCrdtDeletionTargetExists(doc, target)) {
        return false;
      }
    }
  }
  if (acknowledgements) {
    for (const [operationId, encodedTarget] of acknowledgements) {
      if (
        !UUID_PATTERN.test(operationId) ||
        !parseStudioCrdtDeletionTarget(encodedTarget) ||
        !operations ||
        operations.get(operationId) !== encodedTarget
      ) return false;
    }
  }
  return true;
}

interface StudioCrdtDeletionRootSnapshot {
  operations: ReadonlyMap<string, unknown>;
  acknowledgements: ReadonlyMap<string, unknown>;
}

function snapshotStudioCrdtDeletionRoots(doc: Y.Doc): StudioCrdtDeletionRootSnapshot | null {
  const operations = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_OPS_ROOT);
  const acknowledgements = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_ACKS_ROOT);
  if (operations === null || acknowledgements === null) return null;
  return {
    operations: new Map(operations ?? []),
    acknowledgements: new Map(acknowledgements ?? []),
  };
}

function preservesStudioCrdtDeletionRoots(
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

function validateStrokeRoot(id: string, record: Y.Map<unknown>): boolean {
  const strokeWidth = record.get("strokeWidth");
  if (
    !hasOnlyKeys(record, STUDIO_CRDT_STROKE_RECORD_KEYS) ||
    record.get("id") !== id ||
    !isBoundedStudioCrdtId(record.get("pageId")) ||
    !isBoundedStudioCrdtId(record.get("layerId")) ||
    (record.get("status") !== "drawing" && record.get("status") !== "finalized") ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean") ||
    record.get("payloadVersion") !== 1 ||
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
    if (record.has(key) && !boundedExactText(value, 512)) return false;
  }
  for (const key of STUDIO_CRDT_STROKE_JSON_KEYS) {
    const value = record.get(key);
    if (
      record.has(key) &&
      (value === null || typeof value !== "object" || Array.isArray(value) ||
        !isBoundedJsonValue(value))
    ) return false;
  }
  const metadata: Record<string, unknown> = {
    version: 1,
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

@Injectable()
export class StudioCrdtService implements OnModuleDestroy {
  private readonly logger = new Logger(StudioCrdtService.name);
  private readonly documents = new Map<string, CachedStudioCrdtDocument>();
  private readonly workTails = new Map<string, Promise<void>>();
  private readonly now: () => Date;
  private readonly stateVectorMaxBytes: number;
  private readonly compactUpdateCount: number;
  private readonly compactUpdateBytes: number;
  private readonly compactIntervalMs: number;
  private readonly idleEvictionMs: number;
  private readonly maxPendingOperationsPerWork: number;
  private readonly maxPendingOperationsTotal: number;
  private readonly pendingOperationsByWork = new Map<string, number>();
  private pendingOperationCount = 0;
  private readonly cancelInterval: (handle: ReturnType<typeof setInterval>) => void;
  private readonly evictionTimer: ReturnType<typeof setInterval>;
  private destroyed = false;

  constructor(
    @Inject(STUDIO_CRDT_REPOSITORY)
    private readonly repository: StudioCrdtRepository,
    @Inject(StudioRasterAssetService)
    private readonly rasterAssetAdmission: StudioCrdtRasterAssetAdmission,
    @Inject(StudioWorkAssetService)
    private readonly workAssetAdmission: StudioCrdtWorkAssetAdmission,
    @Optional()
    @Inject(STUDIO_CRDT_SERVICE_OPTIONS)
    options: StudioCrdtServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.stateVectorMaxBytes = boundedInteger(
      options.stateVectorMaxBytes,
      STUDIO_CRDT_STATE_VECTOR_MAX_BYTES,
      1,
      STUDIO_CRDT_STATE_VECTOR_MAX_BYTES
    );
    this.compactUpdateCount = boundedInteger(
      options.compactUpdateCount,
      DEFAULT_COMPACT_UPDATE_COUNT,
      2,
      100_000
    );
    this.compactUpdateBytes = boundedInteger(
      options.compactUpdateBytes,
      DEFAULT_COMPACT_UPDATE_BYTES,
      STUDIO_CRDT_UPDATE_MAX_BYTES,
      STUDIO_CRDT_SNAPSHOT_MAX_BYTES
    );
    this.compactIntervalMs = boundedInteger(
      options.compactIntervalMs,
      DEFAULT_COMPACT_INTERVAL_MS,
      1_000,
      24 * 60 * 60_000
    );
    this.idleEvictionMs = boundedInteger(
      options.idleEvictionMs,
      DEFAULT_IDLE_EVICTION_MS,
      1_000,
      24 * 60 * 60_000
    );
    this.maxPendingOperationsPerWork = boundedInteger(
      options.maxPendingOperationsPerWork,
      DEFAULT_MAX_PENDING_OPERATIONS_PER_WORK,
      1,
      100_000
    );
    this.maxPendingOperationsTotal = boundedInteger(
      options.maxPendingOperationsTotal,
      DEFAULT_MAX_PENDING_OPERATIONS_TOTAL,
      1,
      1_000_000
    );
    this.cancelInterval = options.cancelInterval ?? clearInterval;
    const scheduleInterval = options.scheduleInterval ?? setInterval;
    this.evictionTimer = scheduleInterval(
      () => this.evictIdleDocuments(),
      boundedInteger(
        options.evictionSweepMs,
        DEFAULT_EVICTION_SWEEP_MS,
        1_000,
        60 * 60_000
      )
    );
    this.evictionTimer.unref?.();
  }

  get cachedDocumentCount(): number {
    return this.documents.size;
  }

  async sync(workId: string, stateVectorBase64?: string | null): Promise<StudioCrdtSyncResult> {
    const stateVector =
      stateVectorBase64 == null
        ? null
        : decodeStudioCrdtBase64(
            stateVectorBase64,
            STUDIO_CRDT_STATE_VECTOR_MAX_BYTES,
            "state vector"
          );
    return this.withWorkLock(workId, async () => {
      const entry = await this.getCaughtUpDocument(workId);
      let diff: Uint8Array;
      try {
        diff = stateVector
          ? Y.encodeStateAsUpdate(entry.doc, stateVector)
          : Y.encodeStateAsUpdate(entry.doc);
      } catch {
        throw new StudioCrdtInvalidPayloadError("state vector is not a valid Yjs state vector");
      }
      if (diff.byteLength > STUDIO_CRDT_SYNC_DIFF_MAX_BYTES) {
        throw new StudioCrdtDocumentTooLargeError();
      }
      entry.lastAccessedAt = this.now().getTime();
      const chunks = chunkStudioCrdtSyncDiff(diff);
      return {
        chunks,
        chunkCount: chunks.length,
        totalBytes: diff.byteLength,
        serverStateVector: encodeStudioCrdtServerStateVector(
          entry.doc,
          this.stateVectorMaxBytes
        ),
        serverSequence: entry.sequence.toString(),
      };
    });
  }

  async applyUpdate(input: StudioCrdtApplyUpdateInput): Promise<StudioCrdtApplyUpdateResult> {
    if (!UUID_PATTERN.test(input.updateId)) {
      throw new StudioCrdtInvalidPayloadError("update id must be a UUID");
    }
    const update = decodeStudioCrdtBase64(input.data, STUDIO_CRDT_UPDATE_MAX_BYTES, "update");
    return this.withWorkLock(input.workId, async () => {
      const entry = await this.getCaughtUpDocument(input.workId);
      const persisted = await this.repository.appendUpdate(
        {
          workId: input.workId,
          updateId: input.updateId,
          actorUserId: input.actorUserId,
          payload: update,
          createdAt: this.now(),
        },
        (current, transaction) => this.validateUpdateAgainstHydration(
          input.workId,
          current,
          update,
          input.actorUserId,
          transaction
        )
      );
      if (
        persisted.receipt.actorUserId !== input.actorUserId ||
        !bytesEqual(persisted.receipt.payloadHash, studioCrdtPayloadHash(update))
      ) {
        throw new StudioCrdtUpdateIdConflictError();
      }

      // A different API process can commit between the pre-validation catch-up and this insert.
      // Reload from the durable sequence boundary so the cached doc includes both commits.
      await this.catchUpDocument(input.workId, entry);
      entry.lastAccessedAt = this.now().getTime();
      await this.maybeCompact(input.workId, entry);
      return {
        duplicate: !persisted.inserted,
        updateId: persisted.receipt.updateId,
        update: fromUint8Array(update),
        serverStateVector: encodeStudioCrdtServerStateVector(
          entry.doc,
          this.stateVectorMaxBytes
        ),
        serverSequence: persisted.receipt.sequence.toString(),
      };
    });
  }

  evictIdleDocuments(now = this.now().getTime()): number {
    let evicted = 0;
    for (const [workId, entry] of this.documents) {
      if (
        this.workTails.has(workId) ||
        now - entry.lastAccessedAt < this.idleEvictionMs
      ) {
        continue;
      }
      entry.doc.destroy();
      this.documents.delete(workId);
      evicted += 1;
    }
    return evicted;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelInterval(this.evictionTimer);
    await Promise.allSettled([...this.workTails.values()]);
    for (const entry of this.documents.values()) entry.doc.destroy();
    this.documents.clear();
    this.workTails.clear();
    this.pendingOperationsByWork.clear();
    this.pendingOperationCount = 0;
  }

  private async getCaughtUpDocument(workId: string): Promise<CachedStudioCrdtDocument> {
    let entry = this.documents.get(workId);
    if (!entry) {
      entry = this.createCachedDocument(workId, await this.repository.loadDocument(workId));
      this.documents.set(workId, entry);
    } else {
      await this.catchUpDocument(workId, entry);
    }
    entry.lastAccessedAt = this.now().getTime();
    return entry;
  }

  private createCachedDocument(
    workId: string,
    state: StudioCrdtHydrationState
  ): CachedStudioCrdtDocument {
    const now = this.now().getTime();
    const entry: CachedStudioCrdtDocument = {
      doc: new Y.Doc(),
      sequence: 0n,
      compactedSequence: 0n,
      uncompactedUpdateCount: 0,
      uncompactedUpdateBytes: 0,
      lastCompactedAt: now,
      lastAccessedAt: now,
    };
    try {
      this.applyHydration(workId, entry, state);
      return entry;
    } catch (error) {
      entry.doc.destroy();
      throw error;
    }
  }

  private async catchUpDocument(
    workId: string,
    entry: CachedStudioCrdtDocument
  ): Promise<void> {
    const state = await this.repository.loadCatchUp(workId, entry.sequence);
    this.applyHydration(workId, entry, state);
  }

  private applyHydration(
    workId: string,
    entry: CachedStudioCrdtDocument,
    state: StudioCrdtHydrationState
  ): void {
    if (state.snapshot) {
      if (
        state.snapshot.workId !== workId ||
        state.snapshot.snapshot.byteLength === 0 ||
        state.snapshot.snapshot.byteLength > STUDIO_CRDT_SNAPSHOT_MAX_BYTES ||
        state.snapshot.compactedSequence <= entry.sequence
      ) {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT snapshot violates its contract");
      }
    }
    for (const update of state.updates) {
      validateStoredUpdate(update, workId);
    }
    const prospectiveSequence = state.snapshot?.compactedSequence ?? entry.sequence;
    if (
      !state.snapshot &&
      !state.updates.some((update) => update.sequence > prospectiveSequence)
    ) return;

    const staged = new Y.Doc();
    let ownsStagedDocument = true;
    let sequence = entry.sequence;
    let compactedSequence = entry.compactedSequence;
    let uncompactedUpdateCount = entry.uncompactedUpdateCount;
    let uncompactedUpdateBytes = entry.uncompactedUpdateBytes;
    let lastCompactedAt = entry.lastCompactedAt;
    try {
      try {
        Y.applyUpdate(staged, Y.encodeStateAsUpdate(entry.doc), "server-hydrate-base");
      } catch {
        throw new StudioCrdtStorageCorruptionError("Cached CRDT document cannot be staged");
      }
      if (state.snapshot) {
        const deletionRootsBefore = snapshotStudioCrdtDeletionRoots(staged);
        const rasterRootsBefore = snapshotStudioCrdtRasterRoots(staged);
        try {
          Y.applyUpdate(staged, state.snapshot.snapshot, "server-hydrate-snapshot");
        } catch {
          throw new StudioCrdtStorageCorruptionError("Stored CRDT snapshot cannot be decoded");
        }
        if (!preservesStudioCrdtDeletionRoots(deletionRootsBefore, staged)) {
          throw new StudioCrdtStorageCorruptionError(
            "Stored CRDT snapshot rewrites grow-only deletion history"
          );
        }
        if (!preservesStudioCrdtRasterRoots(rasterRootsBefore, staged)) {
          throw new StudioCrdtStorageCorruptionError(
            "Stored CRDT snapshot rewrites grow-only raster history"
          );
        }
        sequence = state.snapshot.compactedSequence;
        compactedSequence = state.snapshot.compactedSequence;
        uncompactedUpdateCount = 0;
        uncompactedUpdateBytes = 0;
        lastCompactedAt = state.snapshot.updatedAt.getTime();
      }
      for (const update of state.updates) {
        if (update.sequence <= sequence) continue;
        const deletionRootsBefore = snapshotStudioCrdtDeletionRoots(staged);
        const rasterRootsBefore = snapshotStudioCrdtRasterRoots(staged);
        try {
          Y.applyUpdate(staged, update.payload, "server-hydrate-update");
        } catch {
          throw new StudioCrdtStorageCorruptionError("Stored CRDT update cannot be decoded");
        }
        if (!preservesStudioCrdtDeletionRoots(deletionRootsBefore, staged)) {
          throw new StudioCrdtStorageCorruptionError(
            "Stored CRDT update rewrites grow-only deletion history"
          );
        }
        if (!preservesStudioCrdtRasterRoots(rasterRootsBefore, staged)) {
          throw new StudioCrdtStorageCorruptionError(
            "Stored CRDT update rewrites grow-only raster history"
          );
        }
        sequence = update.sequence;
        uncompactedUpdateCount += 1;
        uncompactedUpdateBytes += update.payload.byteLength;
      }
      if (!hasValidStudioCrdtRootSchema(staged)) {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT document violates its root schema");
      }
      if (Y.encodeStateAsUpdate(staged).byteLength > STUDIO_CRDT_SNAPSHOT_MAX_BYTES) {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT document exceeds its byte budget");
      }
      encodeStudioCrdtServerStateVector(staged, this.stateVectorMaxBytes);

      const previous = entry.doc;
      entry.doc = staged;
      entry.sequence = sequence;
      entry.compactedSequence = compactedSequence;
      entry.uncompactedUpdateCount = uncompactedUpdateCount;
      entry.uncompactedUpdateBytes = uncompactedUpdateBytes;
      entry.lastCompactedAt = lastCompactedAt;
      ownsStagedDocument = false;
      previous.destroy();
    } finally {
      if (ownsStagedDocument) staged.destroy();
    }
  }

  private async validateUpdateAgainstDocument(
    workId: string,
    doc: Y.Doc,
    update: Uint8Array,
    actorUserId: string,
    transaction?: DrizzleStudioCrdtTransaction
  ): Promise<void> {
    const probe = new Y.Doc();
    const candidate = new Y.Doc();
    const deletionRootsBefore = snapshotStudioCrdtDeletionRoots(doc);
    const rasterRootsBefore = snapshotStudioCrdtRasterRoots(doc);
    const workAssetReferencesBefore = snapshotStudioWorkAssetReferences(doc);
    try {
      Y.applyUpdate(candidate, update, "server-validation-candidate");
      if (conflictsWithStudioCrdtRasterRootSnapshot(rasterRootsBefore, candidate)) {
        throw new StudioCrdtInvalidPayloadError(
          "update reuses an immutable Studio raster identity with different content"
        );
      }
      Y.applyUpdate(probe, Y.encodeStateAsUpdate(doc), "server-validation-base");
      Y.applyUpdate(probe, update, "server-validation-update");
      if (!hasValidStudioCrdtRootSchema(probe)) {
        throw new StudioCrdtInvalidPayloadError("update violates the Studio CRDT root schema");
      }
      if (!preservesStudioCrdtDeletionRoots(deletionRootsBefore, probe)) {
        throw new StudioCrdtInvalidPayloadError(
          "update rewrites grow-only Studio deletion history"
        );
      }
      if (!preservesStudioCrdtRasterRoots(rasterRootsBefore, probe)) {
        throw new StudioCrdtInvalidPayloadError(
          "update rewrites grow-only Studio raster history"
        );
      }
      if (appendsStudioCrdtRasterCheckpoint(rasterRootsBefore, probe)) {
        throw new StudioCrdtInvalidPayloadError(
          "client updates cannot publish unverified Studio raster checkpoints"
        );
      }
      assertStudioCrdtRasterAppendedEventAdmission(rasterRootsBefore, probe, actorUserId);
      const workAssetReferences = snapshotStudioWorkAssetReferences(probe);
      for (const [id, elementType] of workAssetReferencesBefore.identities) {
        if (workAssetReferences.identities.get(id) !== elementType) {
          throw new StudioCrdtInvalidPayloadError(
            "update cannot replace a durable Studio reference identity"
          );
        }
      }
      for (const key of workAssetReferencesBefore.admittedReferences.keys()) {
        if (!workAssetReferences.admittedReferences.has(key)) {
          throw new StudioCrdtInvalidPayloadError(
            "update cannot downgrade a durable admitted Studio reference"
          );
        }
      }
      if (
        workAssetReferences.activeCount >
        STUDIO_CRDT_ACTIVE_WORK_ASSET_REFERENCE_MAX_COUNT
      ) {
        throw new StudioCrdtInvalidPayloadError(
          "update exceeds the active Studio work-asset reference limit"
        );
      }
      if (Y.encodeStateAsUpdate(probe).byteLength > STUDIO_CRDT_SNAPSHOT_MAX_BYTES) {
        throw new StudioCrdtDocumentTooLargeError();
      }
      if (Y.encodeStateVector(probe).byteLength > this.stateVectorMaxBytes) {
        throw new StudioCrdtDocumentTooLargeError();
      }
      const appendedAssetReferences = appendedStudioCrdtRasterAssetReferences(
        rasterRootsBefore,
        probe
      );
      if (appendedAssetReferences.length > 0) {
        try {
          await this.rasterAssetAdmission.assertReferencesStored(
            actorUserId,
            workId,
            appendedAssetReferences,
            transaction
          );
        } catch {
          throw new StudioCrdtInvalidPayloadError(
            "update references a missing or mismatched Studio raster asset"
          );
        }
      }
      const appendedWorkAssetReferences = [...workAssetReferences.admittedReferences]
        .filter(([key]) => !workAssetReferencesBefore.admittedReferences.has(key))
        .map(([, reference]) => reference);
      if (appendedWorkAssetReferences.length > 0) {
        try {
          await this.workAssetAdmission.assertReferencesStored(
            actorUserId,
            workId,
            appendedWorkAssetReferences,
            transaction
          );
        } catch {
          throw new StudioCrdtInvalidPayloadError(
            "update references a missing or mismatched Studio work asset"
          );
        }
      }
    } catch (error) {
      if (
        error instanceof StudioCrdtDocumentTooLargeError ||
        error instanceof StudioCrdtInvalidPayloadError
      ) throw error;
      throw new StudioCrdtInvalidPayloadError("update is not a valid Yjs update");
    } finally {
      candidate.destroy();
      probe.destroy();
    }
  }

  private async validateUpdateAgainstHydration(
    workId: string,
    current: StudioCrdtHydrationState,
    update: Uint8Array,
    actorUserId: string,
    transaction: DrizzleStudioCrdtTransaction
  ): Promise<void> {
    const durable = this.createCachedDocument(workId, current);
    try {
      await this.validateUpdateAgainstDocument(
        workId,
        durable.doc,
        update,
        actorUserId,
        transaction
      );
    } finally {
      durable.doc.destroy();
    }
  }

  private async maybeCompact(
    workId: string,
    entry: CachedStudioCrdtDocument
  ): Promise<void> {
    if (entry.sequence <= entry.compactedSequence || entry.uncompactedUpdateCount === 0) return;
    const now = this.now();
    if (
      entry.uncompactedUpdateCount < this.compactUpdateCount &&
      entry.uncompactedUpdateBytes < this.compactUpdateBytes &&
      now.getTime() - entry.lastCompactedAt < this.compactIntervalMs
    ) {
      return;
    }
    const snapshot = Y.encodeStateAsUpdate(entry.doc);
    if (snapshot.byteLength > STUDIO_CRDT_SNAPSHOT_MAX_BYTES) {
      throw new StudioCrdtDocumentTooLargeError();
    }
    try {
      const compacted = await this.repository.compact({
        workId,
        snapshot,
        throughSequence: entry.sequence,
        updatedAt: now,
      });
      if (!compacted) return;
      entry.compactedSequence = entry.sequence;
      entry.uncompactedUpdateCount = 0;
      entry.uncompactedUpdateBytes = 0;
      entry.lastCompactedAt = now.getTime();
    } catch (error) {
      this.logger.warn(
        { workId, error: error instanceof Error ? error.message : "unknown" },
        "studio CRDT compaction deferred"
      );
    }
  }

  private withWorkLock<T>(workId: string, operation: () => Promise<T>): Promise<T> {
    if (this.destroyed) return Promise.reject(new Error("Studio CRDT service is shutting down"));
    const pendingForWork = this.pendingOperationsByWork.get(workId) ?? 0;
    if (
      pendingForWork >= this.maxPendingOperationsPerWork ||
      this.pendingOperationCount >= this.maxPendingOperationsTotal
    ) {
      return Promise.reject(new StudioCrdtBackpressureError());
    }
    // Count both the active operation and waiters. This admission check occurs synchronously before
    // a closure is attached to the work tail, so a stalled database call cannot grow an unbounded
    // promise/payload backlog through many authenticated editors or rooms in this API process.
    this.pendingOperationsByWork.set(workId, pendingForWork + 1);
    this.pendingOperationCount += 1;
    const previous = this.workTails.get(workId) ?? Promise.resolve();
    const run = previous.then(() => {
      if (this.destroyed) throw new Error("Studio CRDT service is shutting down");
      return operation();
    });
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.workTails.set(workId, tail);
    void tail.then(() => {
      const remainingForWork = (this.pendingOperationsByWork.get(workId) ?? 1) - 1;
      if (remainingForWork > 0) this.pendingOperationsByWork.set(workId, remainingForWork);
      else this.pendingOperationsByWork.delete(workId);
      this.pendingOperationCount = Math.max(0, this.pendingOperationCount - 1);
      if (this.workTails.get(workId) === tail) this.workTails.delete(workId);
    });
    return run;
  }
}
