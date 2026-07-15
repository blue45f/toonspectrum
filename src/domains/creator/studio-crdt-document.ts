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
  STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  type StudioCrdtSyncResponse,
} from "./studio-crdt-protocol";

export {
  STUDIO_CRDT_ORIGIN_LOCAL,
  STUDIO_CRDT_ORIGIN_REMOTE,
  STUDIO_CRDT_ORIGIN_SYNC,
  STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
} from "./studio-crdt-protocol";
export const STUDIO_CRDT_STROKE_MAX_SAMPLES = 100_000;
export const STUDIO_CRDT_APPEND_MAX_SAMPLES = 4_096;
export const STUDIO_CRDT_REPLACE_CHUNK_SAMPLES = 256;
/** Inline CRDT metadata is intentionally small; large masks/assets must use an external reference. */
export const STUDIO_CRDT_METADATA_MAX_BYTES = 16 * 1024;

const MAX_ID_LENGTH = 160;
const MAX_TEXT_LENGTH = 512;
const MAX_COORDINATE = 10_000_000;
const MAX_STROKE_WIDTH = 8_192;
const MAX_JSON_DEPTH = 10;
const MAX_JSON_ENTRIES = 4_096;
const MAX_JSON_STRING_LENGTH = 64 * 1024;
const MAX_ACTIVE_ORDER_ENTRIES_PER_STROKE = 256;
const BATCH_MIN_DELAY_MS = 30;
const BATCH_MAX_DELAY_MS = 50;
const DEFAULT_BATCH_DELAY_MS = 40;
const DEFAULT_BATCH_MAX_BYTES = 32 * 1024;
const TEXT_ENCODER = new TextEncoder();

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

type StudioCrdtSampleArrayKey = (typeof SAMPLE_ARRAY_KEYS)[number];
type StudioCrdtStringPayloadKey = (typeof OPTIONAL_STRING_PAYLOAD_KEYS)[number];

export type StudioCrdtJsonValue =
  | null
  | boolean
  | number
  | string
  | StudioCrdtJsonValue[]
  | { [key: string]: StudioCrdtJsonValue };

export type StudioCrdtJsonObject = { [key: string]: StudioCrdtJsonValue };

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
  version: typeof STUDIO_CRDT_STROKE_PAYLOAD_VERSION;
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

export interface StudioCrdtChange {
  origin: unknown;
  local: boolean;
  /** Exact IDs touched by record/sample operations; order-only corruption may conservatively widen. */
  changedStrokeIds: ReadonlySet<string>;
  strokes: StudioCrdtStrokeRecord[];
}

export interface StudioCrdtChangeSubscriptionOptions {
  /** Filtering happens before materializing `strokes`, so callers can cheaply ignore local echoes. */
  includeOrigin?: (origin: unknown) => boolean;
}

export type StudioCrdtUpdateHandler = (update: Uint8Array, origin: unknown) => void;
export type StudioCrdtChangeHandler = (change: StudioCrdtChange) => void;

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

function normalizedSamples(samples: StudioCrdtStrokeSamples, allowEmpty: boolean) {
  const count = sampleCount(samples, allowEmpty);
  return {
    points: [...samples.points],
    pressures: [...(samples.pressures ?? Array<number>(count).fill(0.5))],
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
  if (payload.version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION || payload.type !== "draw") {
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
    assertFiniteRange(payload.sampleSpacing, 0.01, MAX_STROKE_WIDTH, "샘플 간격");
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
    version !== STUDIO_CRDT_STROKE_PAYLOAD_VERSION ||
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

function orderEntryValue(entry: unknown, key: string): string | null {
  if (!(entry instanceof Y.Map)) return null;
  const value = entry.get(key);
  return typeof value === "string" ? value : null;
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
  private readonly order: Y.Array<Y.Map<unknown>>;
  private readonly cleanup = new Set<() => void>();
  private readonly strokeIdByType = new WeakMap<object, string>();
  private readonly changedStrokeIdsByTransaction = new WeakMap<Y.Transaction, Set<string>>();
  private destroyed = false;

  constructor(initialUpdate?: Uint8Array | string) {
    this.doc = new Y.Doc();
    this.strokes = this.doc.getMap<Y.Map<unknown>>("strokes");
    this.order = this.doc.getArray<Y.Map<unknown>>("stroke-order");
    if (initialUpdate !== undefined) {
      const decoded =
        typeof initialUpdate === "string" ? decodeStudioCrdtUpdate(initialUpdate) : initialUpdate;
      Y.applyUpdate(this.doc, decoded, STUDIO_CRDT_ORIGIN_SYNC);
    }
    for (const [id, value] of this.strokes) this.registerRecord(id, value);
    for (const value of this.order) this.registerOrderEntry(value);

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
      const changedIds = this.changedIdsFor(transaction);
      for (const event of events) {
        const knownId = this.strokeIdByType.get(event.target);
        if (knownId) changedIds.add(knownId);
        if (event.target instanceof Y.Map) {
          const id = orderEntryValue(event.target, "strokeId");
          if (id) {
            changedIds.add(id);
            this.registerOrderEntry(event.target);
          }
        }
        if (event.target !== this.order || !(event instanceof Y.YArrayEvent)) continue;
        let deletedUnknownEntry = false;
        for (const delta of event.changes.delta) {
          if (delta.delete) deletedUnknownEntry = true;
          if (!Array.isArray(delta.insert)) continue;
          for (const value of delta.insert) {
            const id = orderEntryValue(value, "strokeId");
            if (id) changedIds.add(id);
            this.registerOrderEntry(value);
          }
        }
        if (deletedUnknownEntry) {
          // Production operations tombstone entries instead of deleting them. For an untrusted
          // structural delete, all surviving indices may have shifted, so widening is safest.
          for (const value of this.order) {
            const id = orderEntryValue(value, "strokeId");
            if (id) changedIds.add(id);
          }
        }
      }
    };
    this.strokes.observeDeep(observeStrokes);
    this.order.observeDeep(observeOrder);
    this.cleanup.add(() => this.strokes.unobserveDeep(observeStrokes));
    this.cleanup.add(() => this.order.unobserveDeep(observeOrder));
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

  subscribeChanges(
    handler: StudioCrdtChangeHandler,
    options: StudioCrdtChangeSubscriptionOptions = {}
  ): () => void {
    this.assertAlive();
    const listener = (transaction: Y.Transaction) => {
      if (options.includeOrigin && !options.includeOrigin(transaction.origin)) return;
      handler({
        origin: transaction.origin,
        local: transaction.local || transaction.origin === STUDIO_CRDT_ORIGIN_LOCAL,
        changedStrokeIds: new Set(this.changedStrokeIdsByTransaction.get(transaction) ?? []),
        strokes: this.getStrokes({ includeDeleted: true }),
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
      const record = this.createRecord(emptyInput, "drawing", false);
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
    const normalized = normalizedSamples(samples, false);
    const appendedCount = normalized.points.length / 2;
    if (appendedCount > STUDIO_CRDT_APPEND_MAX_SAMPLES) {
      throw new Error("한 번에 추가할 수 있는 획 샘플 수를 초과했습니다.");
    }
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map) || record.get("deleted") === true) {
      throw new Error("추가할 획을 찾을 수 없습니다.");
    }
    if (record.get("status") !== "drawing") throw new Error("완료된 획에는 샘플을 추가할 수 없습니다.");
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
    if (!(record instanceof Y.Map) || record.get("deleted") === true) {
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

    const deleted = existing.get("deleted") === true;
    if (deleted && !options.resurrect) throw new Error("삭제된 획은 명시적으로 복원해야 합니다.");
    const normalized = normalizedSamples(input.payload, true);
    const previousPageId = readString(existing, "pageId");
    const previousLayerId = readString(existing, "layerId");
    const requiresReorder = previousPageId !== input.pageId ||
      previousLayerId !== input.layerId ||
      options.beforeStrokeId !== undefined;
    if (requiresReorder) this.assertOrderEditBound(input.id);
    this.doc.transact(() => {
      existing.set("pageId", input.pageId);
      existing.set("layerId", input.layerId);
      existing.set("deleted", false);
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

  deleteStroke(id: string): boolean {
    this.assertAlive();
    assertId(id, "획");
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map) || record.get("deleted") === true) return false;
    this.doc.transact(() => record.set("deleted", true), STUDIO_CRDT_ORIGIN_LOCAL);
    return true;
  }

  restoreStroke(id: string): boolean {
    this.assertAlive();
    assertId(id, "획");
    const record = this.strokes.get(id);
    if (!(record instanceof Y.Map) || record.get("deleted") !== true) return false;
    this.doc.transact(() => record.set("deleted", false), STUDIO_CRDT_ORIGIN_LOCAL);
    return true;
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
    const latestOrder = new Map<string, number>();
    this.order.forEach((entry, index) => {
      if (!(entry instanceof Y.Map)) return;
      if (entry.get("active") !== true) return;
      const id = orderEntryValue(entry, "strokeId");
      if (id) latestOrder.set(id, index);
    });
    const records: StudioCrdtStrokeRecord[] = [];
    for (const [id, record] of this.strokes) {
      if (!(record instanceof Y.Map)) continue;
      const result = this.readRecord(id, record, latestOrder.get(id) ?? Number.MAX_SAFE_INTEGER);
      if (!result || (!query.includeDeleted && result.deleted)) continue;
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

  private assertStrokeInput(input: StudioCrdtStrokeInput, allowEmpty: boolean): void {
    assertId(input.id, "획");
    assertId(input.pageId, "페이지");
    assertId(input.layerId, "레이어");
    validatePayload(input.payload, allowEmpty);
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

  private createRecord(
    input: StudioCrdtStrokeInput,
    status: StudioCrdtStrokeRecord["status"],
    deleted: boolean
  ): Y.Map<unknown> {
    const record = new Y.Map<unknown>();
    record.set("id", input.id);
    record.set("pageId", input.pageId);
    record.set("layerId", input.layerId);
    record.set("status", status);
    record.set("deleted", deleted);
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
        targetIndex < 0 &&
        candidate instanceof Y.Map &&
        candidate.get("active") === true &&
        orderEntryValue(candidate, "strokeId") === beforeStrokeId &&
        orderEntryValue(candidate, "pageId") === input.pageId
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
        if (activeCount > MAX_ACTIVE_ORDER_ENTRIES_PER_STROKE) {
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
      deleted: record.get("deleted") === true,
      orderIndex,
    };
  }

  private requiredStroke(id: string): StudioCrdtStrokeRecord {
    const result = this.getStroke(id, true);
    if (!result) throw new Error("CRDT 획을 읽지 못했습니다.");
    return result;
  }
}
