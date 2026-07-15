import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import { fromUint8Array, toUint8Array } from "js-base64";
import * as Y from "yjs";

import {
  STUDIO_CRDT_REPOSITORY,
  STUDIO_CRDT_SNAPSHOT_MAX_BYTES,
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  studioCrdtPayloadHash,
} from "./studio-crdt.repository";

import type {
  StudioCrdtHydrationState,
  StudioCrdtRepository,
  StudioCrdtUpdateRecord,
} from "./studio-crdt.repository";

export const STUDIO_CRDT_SERVICE_OPTIONS = Symbol("STUDIO_CRDT_SERVICE_OPTIONS");
export const STUDIO_CRDT_STATE_VECTOR_MAX_BYTES = 256 * 1_024;
export const STUDIO_CRDT_SYNC_DIFF_MAX_BYTES = STUDIO_CRDT_SNAPSHOT_MAX_BYTES;
export const STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES = 40 * 1_024;

const DEFAULT_COMPACT_UPDATE_COUNT = 512;
const DEFAULT_COMPACT_UPDATE_BYTES = 2 * 1_024 * 1_024;
const DEFAULT_COMPACT_INTERVAL_MS = 5 * 60_000;
const DEFAULT_IDLE_EVICTION_MS = 5 * 60_000;
const DEFAULT_EVICTION_SWEEP_MS = 60_000;
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

export interface StudioCrdtServiceOptions {
  now?: () => Date;
  stateVectorMaxBytes?: number;
  compactUpdateCount?: number;
  compactUpdateBytes?: number;
  compactIntervalMs?: number;
  idleEvictionMs?: number;
  evictionSweepMs?: number;
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
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

/** Rejects valid Yjs syntax that would poison the Studio document's runtime collection contract. */
export function hasValidStudioCrdtRootSchema(doc: Y.Doc): boolean {
  const strokesRoot = doc.share.get("strokes");
  if (strokesRoot !== undefined) {
    if (!(strokesRoot instanceof Y.Map)) return false;
    for (const [id, value] of strokesRoot) {
      if (!isBoundedStudioCrdtId(id) || !(value instanceof Y.Map)) return false;
      const strokeWidth = value.get("strokeWidth");
      if (
        value.get("id") !== id ||
        !isBoundedStudioCrdtId(value.get("pageId")) ||
        !isBoundedStudioCrdtId(value.get("layerId")) ||
        (value.get("status") !== "drawing" && value.get("status") !== "finalized") ||
        typeof value.get("deleted") !== "boolean" ||
        value.get("payloadVersion") !== 1 ||
        value.get("type") !== "draw" ||
        (value.get("mode") !== "pen" && value.get("mode") !== "eraser") ||
        typeof value.get("kind") !== "string" ||
        typeof value.get("stroke") !== "string" ||
        typeof strokeWidth !== "number" ||
        !Number.isFinite(strokeWidth)
      ) {
        return false;
      }
      const arrays = STUDIO_CRDT_STROKE_SAMPLE_KEYS.map((key) => value.get(key));
      if (arrays.some((samples) => !(samples instanceof Y.Array))) return false;
      const pointsLength = (arrays[0] as Y.Array<unknown>).length;
      const sampleCount = pointsLength / 2;
      if (
        pointsLength % 2 !== 0 ||
        sampleCount > STUDIO_CRDT_STROKE_SAMPLE_MAX_COUNT ||
        arrays.slice(1).some((samples) => (samples as Y.Array<unknown>).length !== sampleCount)
      ) {
        return false;
      }
    }
  }

  const orderRoot = doc.share.get("stroke-order");
  if (orderRoot !== undefined) {
    if (!(orderRoot instanceof Y.Array)) return false;
    for (const value of orderRoot) {
      if (
        !(value instanceof Y.Map) ||
        !isBoundedStudioCrdtId(value.get("strokeId")) ||
        !isBoundedStudioCrdtId(value.get("pageId")) ||
        !isBoundedStudioCrdtId(value.get("layerId")) ||
        typeof value.get("active") !== "boolean"
      ) {
        return false;
      }
    }
  }
  return true;
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
  private readonly cancelInterval: (handle: ReturnType<typeof setInterval>) => void;
  private readonly evictionTimer: ReturnType<typeof setInterval>;
  private destroyed = false;

  constructor(
    @Inject(STUDIO_CRDT_REPOSITORY)
    private readonly repository: StudioCrdtRepository,
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
      this.validateUpdateAgainstDocument(entry.doc, update);
      const persisted = await this.repository.appendUpdate({
        workId: input.workId,
        updateId: input.updateId,
        actorUserId: input.actorUserId,
        payload: update,
        createdAt: this.now(),
      });
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
    let changed = false;
    if (state.snapshot) {
      if (
        state.snapshot.workId !== workId ||
        state.snapshot.snapshot.byteLength === 0 ||
        state.snapshot.snapshot.byteLength > STUDIO_CRDT_SNAPSHOT_MAX_BYTES ||
        state.snapshot.compactedSequence <= entry.sequence
      ) {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT snapshot violates its contract");
      }
      try {
        Y.applyUpdate(entry.doc, state.snapshot.snapshot, "server-hydrate");
      } catch {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT snapshot cannot be decoded");
      }
      entry.sequence = state.snapshot.compactedSequence;
      entry.compactedSequence = state.snapshot.compactedSequence;
      entry.uncompactedUpdateCount = 0;
      entry.uncompactedUpdateBytes = 0;
      entry.lastCompactedAt = state.snapshot.updatedAt.getTime();
      changed = true;
    }
    for (const update of state.updates) {
      validateStoredUpdate(update, workId);
      if (update.sequence <= entry.sequence) continue;
      try {
        Y.applyUpdate(entry.doc, update.payload, "server-hydrate");
      } catch {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT update cannot be decoded");
      }
      entry.sequence = update.sequence;
      entry.uncompactedUpdateCount += 1;
      entry.uncompactedUpdateBytes += update.payload.byteLength;
      changed = true;
    }
    if (changed) {
      if (!hasValidStudioCrdtRootSchema(entry.doc)) {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT document violates its root schema");
      }
      if (Y.encodeStateAsUpdate(entry.doc).byteLength > STUDIO_CRDT_SNAPSHOT_MAX_BYTES) {
        throw new StudioCrdtStorageCorruptionError("Stored CRDT document exceeds its byte budget");
      }
      encodeStudioCrdtServerStateVector(entry.doc, this.stateVectorMaxBytes);
    }
  }

  private validateUpdateAgainstDocument(doc: Y.Doc, update: Uint8Array): void {
    const probe = new Y.Doc();
    try {
      Y.applyUpdate(probe, Y.encodeStateAsUpdate(doc), "server-validation-base");
      Y.applyUpdate(probe, update, "server-validation-update");
      if (!hasValidStudioCrdtRootSchema(probe)) {
        throw new StudioCrdtInvalidPayloadError("update violates the Studio CRDT root schema");
      }
      if (Y.encodeStateAsUpdate(probe).byteLength > STUDIO_CRDT_SNAPSHOT_MAX_BYTES) {
        throw new StudioCrdtDocumentTooLargeError();
      }
      if (Y.encodeStateVector(probe).byteLength > this.stateVectorMaxBytes) {
        throw new StudioCrdtDocumentTooLargeError();
      }
    } catch (error) {
      if (
        error instanceof StudioCrdtDocumentTooLargeError ||
        error instanceof StudioCrdtInvalidPayloadError
      ) throw error;
      throw new StudioCrdtInvalidPayloadError("update is not a valid Yjs update");
    } finally {
      probe.destroy();
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
      if (this.workTails.get(workId) === tail) this.workTails.delete(workId);
    });
    return run;
  }
}
