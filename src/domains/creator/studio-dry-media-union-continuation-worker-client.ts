import {
  snapshotMemory64CrossRealmAllocationAck,
  snapshotMemory64CrossRealmReservationToken,
  type Memory64CrossRealmReservationToken,
} from "./kernel/Memory64CrossRealmProtocol";
import {
  STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
  STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION,
} from "./studio-brush-dynamics";
import {
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_MAX_INFLIGHT_BYTES,
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_MAX_PAGE_COUNT,
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION,
  packStudioDryMediaUnionContinuationPages,
  studioDryMediaUnionContinuationPageTransferables,
  type StudioDryMediaUnionContinuationAppendRequest,
  type StudioDryMediaUnionContinuationFrameReceipt,
  type StudioDryMediaUnionContinuationPage,
  type StudioDryMediaUnionContinuationRequest,
  type StudioDryMediaUnionPagedRootReceipt,
} from "./studio-dry-media-union-continuation-protocol";
import {
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_MAX_TILE_EDGE,
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_SLOT_COUNT,
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
} from "./studio-dry-media-union-continuation-scratch-arena";

import type { Memory64WorkloadCoordinator } from "./kernel/Memory64WorkloadCoordinator";
import type { WasmScratchRuntimeBudget } from "./kernel/WasmMemory64Capability";
import type { StudioDynamicBrushCoverageMark } from "./studio-dynamic-brush-coverage-renderer";

interface MessageEventLike {
  readonly data: unknown;
}

interface ErrorEventLike {
  readonly message?: string;
  preventDefault?(): void;
}

type MessageListener = (event: MessageEventLike) => void;
type ErrorListener = (event: ErrorEventLike) => void;

export interface StudioDryMediaUnionContinuationWorkerLike {
  postMessage(message: StudioDryMediaUnionContinuationRequest, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "error" | "messageerror", listener: ErrorListener): void;
  removeEventListener(type: "message", listener: MessageListener): void;
  removeEventListener(type: "error" | "messageerror", listener: ErrorListener): void;
  terminate(): void;
}

export type StudioDryMediaUnionContinuationMemory64Coordinator = Pick<
  Memory64WorkloadCoordinator,
  | "reserveCrossRealm"
  | "acknowledgeCrossRealmReservation"
  | "releaseCrossRealmReservation"
>;

export type StudioDryMediaUnionContinuationAppendAdmission =
  | Readonly<{
      ok: true;
      status: "accepted";
      sequence: number;
      firstGroupIndex: number;
      groupCount: number;
      pageCount: number;
      physicalPageByteLength: number;
      completion: Promise<void>;
    }>
  | Readonly<{
      ok: false;
      status: "rejected" | "backpressure";
      reason:
        | "not-ready"
        | "queue-full"
        | "physical-page-budget"
        | "append-window-exceeded"
        | "invalid-cursor"
        | "invalid-program"
        | "invalid-group"
        | "group-too-large"
        | "pack-failed";
    }>;

export interface StudioDryMediaUnionContinuationWorkerClient {
  readonly available: boolean;
  begin(input: Readonly<{
    strokeId: string;
    presentationGeneration: number;
    width: number;
    height: number;
    transform: readonly [number, number, number, number, number, number];
    color: string;
    scratchBudget: WasmScratchRuntimeBudget;
  }>): Promise<void>;
  /**
   * Synchronous ownership admission. A rejected call retains neither marks nor
   * packed pages and advances none of the four authority cursors.
   */
  tryAppend(
    marks: readonly StudioDynamicBrushCoverageMark[],
  ): StudioDryMediaUnionContinuationAppendAdmission;
  seal(): Promise<StudioDryMediaUnionPagedRootReceipt>;
  cancel(): Promise<void>;
  dispose(): void;
  stats(): Readonly<{
    generation: number;
    receivedSequence: number;
    plannedSequence: number;
    admittedSequence: number;
    presentedSequence: number;
    receivedGroupCount: number;
    plannedGroupCount: number;
    admittedGroupCount: number;
    presentedGroupCount: number;
    queueCount: number;
    queuePhysicalPageByteLength: number;
    inflightPhysicalPageByteLength: number;
    queuedPhysicalPageByteLength: number;
    maximumQueuePhysicalPageByteLength: number;
    transferCount: number;
    scratchReservationActive: boolean;
    scratchResidentByteLength: number;
    state:
      | "idle"
      | "beginning"
      | "ready"
      | "sealing"
      | "cancelling"
      | "sealed"
      | "cancelled"
      | "poisoned"
      | "disposed";
    disposed: boolean;
    terminalReason: string | null;
  }>;
}

export interface StudioDryMediaUnionContinuationWorkerClientOptions {
  readonly memory64Coordinator: StudioDryMediaUnionContinuationMemory64Coordinator;
  readonly workerFactory?: () => StudioDryMediaUnionContinuationWorkerLike | null;
  readonly timeoutMilliseconds?: number;
  /** Returning true transfers presentation ownership of every bitmap to the caller. */
  readonly onFrame: (frame: StudioDryMediaUnionContinuationFrameReceipt) => boolean;
}

type ClientState = ReturnType<
  StudioDryMediaUnionContinuationWorkerClient["stats"]
>["state"];

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
  settled: boolean;
}

interface PendingControl<T> {
  readonly requestId: number;
  readonly deferred: Deferred<T>;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface AppendJob {
  readonly sequence: number;
  readonly firstGroupIndex: number;
  readonly groupCount: number;
  readonly physicalPageByteLength: number;
  readonly logicalByteLength: number;
  readonly pageCount: number;
  readonly completion: Deferred<void>;
  pages: readonly StudioDryMediaUnionContinuationPage[] | null;
  timer: ReturnType<typeof setTimeout> | null;
  requestId: number | null;
}

const MAX_OUTSTANDING_APPEND_REQUESTS = 2;
const RESPONSE_ACK_KEYS = Object.freeze([
  "kind",
  "version",
  "reservationId",
  "nonce",
  "runtime",
  "addressType",
  "residentBytes",
  "residentPages",
] as const);

function defaultWorkerFactory(): StudioDryMediaUnionContinuationWorkerLike | null {
  if (typeof globalThis.Worker !== "function") return null;
  return new globalThis.Worker(
    new URL("./studio-dry-media-union-continuation.worker.ts", import.meta.url),
    { type: "module", name: "studio-dry-media-union-continuation" },
  );
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;
  const result: Deferred<T> = {
    promise: new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    resolve(value) {
      if (result.settled) return;
      result.settled = true;
      resolvePromise(value);
    },
    reject(error) {
      if (result.settled) return;
      result.settled = true;
      rejectPromise(error);
    },
    settled: false,
  };
  return result;
}

function nextSafe(value: number): number {
  return value >= Number.MAX_SAFE_INTEGER ? 1 : value + 1;
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Object.getOwnPropertySymbols(value).length > 0
      || Object.values(descriptors).some((descriptor) => !("value" in descriptor))
    ) return null;
    return Object.fromEntries(
      Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]),
    );
  } catch {
    return null;
  }
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  const record = dataRecord(value);
  if (!record) return null;
  const actualKeys = Object.keys(record);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key))
    ? record
    : null;
}

function denseDataArray(value: unknown, maximumLength: number): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
  } catch {
    return null;
  }
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor)) return null;
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximumLength) return null;
  if (Object.keys(descriptors).length !== length + 1) return null;
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) return null;
    result.push(descriptor.value);
  }
  return result;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeBudgetByteCount(value: unknown): value is number | bigint {
  return typeof value === "bigint"
    ? value >= BigInt(0)
    : safeNonNegativeInteger(value);
}

function snapshotFrame(
  value: unknown,
  expected: Readonly<{
    strokeId: string;
    workerGeneration: number;
    sequence: number;
    presentationGeneration: number;
    width: number;
    height: number;
  }>,
): StudioDryMediaUnionContinuationFrameReceipt | null {
  const frame = exactDataRecord(value, [
    "contract",
    "version",
    "strokeId",
    "workerGeneration",
    "sequence",
    "presentationGeneration",
    "programDigest",
    "tiles",
  ]);
  if (
    !frame
    || frame.contract !== "studio-dry-media-union-frame-v1"
    || frame.version !== 1
    || frame.strokeId !== expected.strokeId
    || frame.workerGeneration !== expected.workerGeneration
    || frame.sequence !== expected.sequence
    || frame.presentationGeneration !== expected.presentationGeneration
    || frame.programDigest !== STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST
  ) return null;
  const rawTiles = denseDataArray(
    frame.tiles,
    STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_SLOT_COUNT,
  );
  if (!rawTiles) return null;
  const tiles: StudioDryMediaUnionContinuationFrameReceipt["tiles"][number][] = [];
  const tileKeys = new Set<string>();
  let pixelCount = 0;
  for (const rawTile of rawTiles) {
    const tile = exactDataRecord(rawTile, [
      "tileX",
      "tileY",
      "x",
      "y",
      "width",
      "height",
      "bitmap",
    ]);
    if (
      !tile
      || !safeNonNegativeInteger(tile.tileX)
      || !safeNonNegativeInteger(tile.tileY)
      || !safeNonNegativeInteger(tile.x)
      || !safeNonNegativeInteger(tile.y)
      || tile.x !== tile.tileX * STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_MAX_TILE_EDGE
      || tile.y !== tile.tileY * STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_MAX_TILE_EDGE
      || !safeNonNegativeInteger(tile.width)
      || !safeNonNegativeInteger(tile.height)
      || tile.width <= 0
      || tile.height <= 0
      || tile.width > STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_MAX_TILE_EDGE
      || tile.height > STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_MAX_TILE_EDGE
      || !safeNonNegativeInteger(tile.x + tile.width)
      || !safeNonNegativeInteger(tile.y + tile.height)
      || tile.x >= expected.width
      || tile.y >= expected.height
      || tile.x + tile.width > expected.width
      || tile.y + tile.height > expected.height
      || tile.bitmap === null
      || typeof tile.bitmap !== "object"
    ) return null;
    const tileKey = `${tile.tileX}:${tile.tileY}`;
    if (tileKeys.has(tileKey)) return null;
    tileKeys.add(tileKey);
    pixelCount += tile.width * tile.height;
    if (
      !Number.isSafeInteger(pixelCount)
      || pixelCount * 4 > STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH
    ) return null;
    tiles.push(tile as unknown as StudioDryMediaUnionContinuationFrameReceipt["tiles"][number]);
  }
  return Object.freeze({
    contract: "studio-dry-media-union-frame-v1",
    version: 1,
    strokeId: expected.strokeId,
    workerGeneration: expected.workerGeneration,
    sequence: expected.sequence,
    presentationGeneration: frame.presentationGeneration,
    programDigest: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
    tiles: Object.freeze(tiles),
  });
}

function closeFrame(frame: StudioDryMediaUnionContinuationFrameReceipt | null): void {
  if (!frame) return;
  for (const tile of frame.tiles) {
    try {
      tile.bitmap.close();
    } catch {
      // A rejected transferred bitmap has no remaining presentation authority.
    }
  }
}

function closePotentialFrame(value: unknown): void {
  const response = dataRecord(value);
  const rawFrame = response?.frame;
  const frameRecord = dataRecord(rawFrame);
  if (
    !frameRecord
    || typeof frameRecord.strokeId !== "string"
    || !safeNonNegativeInteger(frameRecord.workerGeneration)
    || !safeNonNegativeInteger(frameRecord.sequence)
  ) return;
  closeFrame(snapshotFrame(rawFrame, {
    strokeId: frameRecord.strokeId,
    workerGeneration: frameRecord.workerGeneration,
    sequence: frameRecord.sequence,
    presentationGeneration: safeNonNegativeInteger(frameRecord.presentationGeneration)
      ? frameRecord.presentationGeneration
      : 0,
    width: Number.MAX_SAFE_INTEGER,
    height: Number.MAX_SAFE_INTEGER,
  }));
}

function snapshotAllocationAck(value: unknown) {
  const record = exactDataRecord(value, RESPONSE_ACK_KEYS);
  return record ? snapshotMemory64CrossRealmAllocationAck(record) : null;
}

function snapshotRootReceipt(
  value: unknown,
  expected: Readonly<{
    strokeId: string;
    generation: number;
    sequence: number;
    groupCount: number;
    presentationGeneration: number;
  }>,
): StudioDryMediaUnionPagedRootReceipt | null {
  const keys = [
    "contract",
    "version",
    "strokeId",
    "generation",
    "sequence",
    "programVersion",
    "programDigest",
    "rootDigest",
    "contentDigest",
    "metadataDigest",
    "pageCount",
    "indexPageCount",
    "bitmapPageCount",
    "groupCount",
    "contourCount",
    "coordinateCount",
    "logicalByteLength",
    "pagedByteLength",
    "residentByteLength",
    "hydratedByteLength",
    "inflightByteLength",
    "slabCapacityByteLength",
    "fragmentationByteLength",
    "presentationGeneration",
  ] as const;
  const receipt = exactDataRecord(value, keys);
  const sha256 = /^[a-f0-9]{64}$/u;
  if (
    !receipt
    || receipt.contract !== "studio-dry-media-union-paged-root-v1"
    || receipt.version !== 1
    || receipt.strokeId !== expected.strokeId
    || receipt.generation !== expected.generation
    || receipt.sequence !== expected.sequence
    || receipt.programVersion !== STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION
    || receipt.programDigest !== STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST
    || receipt.groupCount !== expected.groupCount
    || receipt.presentationGeneration !== expected.presentationGeneration
    || typeof receipt.rootDigest !== "string"
    || !sha256.test(receipt.rootDigest)
    || typeof receipt.contentDigest !== "string"
    || !sha256.test(receipt.contentDigest)
    || typeof receipt.metadataDigest !== "string"
    || !sha256.test(receipt.metadataDigest)
    || !keys.slice(10).every((key) => safeNonNegativeInteger(receipt[key]))
  ) return null;
  return Object.freeze(receipt as unknown as StudioDryMediaUnionPagedRootReceipt);
}

function snapshotBeginInput(
  value: unknown,
): Parameters<StudioDryMediaUnionContinuationWorkerClient["begin"]>[0] | null {
  const input = exactDataRecord(value, [
    "strokeId",
    "presentationGeneration",
    "width",
    "height",
    "transform",
    "color",
    "scratchBudget",
  ]);
  const transform = input ? denseDataArray(input.transform, 6) : null;
  const budget = input ? dataRecord(input.scratchBudget) : null;
  if (
    !input
    || typeof input.strokeId !== "string"
    || input.strokeId.trim().length === 0
    || input.strokeId.length > 512
    || !safeNonNegativeInteger(input.presentationGeneration)
    || typeof input.width !== "number"
    || !Number.isSafeInteger(input.width)
    || input.width <= 0
    || typeof input.height !== "number"
    || !Number.isSafeInteger(input.height)
    || input.height <= 0
    || !transform
    || transform.length !== 6
    || !transform.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    || typeof input.color !== "string"
    || input.color.length === 0
    || input.color.length > 128
    || !budget
    || !["availableBytes", "availablePages", "reservedBytes"].every(
      (key) => budget[key] !== undefined || key === "reservedBytes",
    )
    || Object.keys(budget).some(
      (key) => !["availableBytes", "availablePages", "reservedBytes"].includes(key),
    )
    || !safeBudgetByteCount(budget.availableBytes)
    || !safeBudgetByteCount(budget.availablePages)
    || (budget.reservedBytes !== undefined && !safeBudgetByteCount(budget.reservedBytes))
  ) return null;
  return Object.freeze({
    strokeId: input.strokeId,
    presentationGeneration: input.presentationGeneration,
    width: input.width,
    height: input.height,
    transform: Object.freeze([...transform]) as unknown as readonly [
      number,
      number,
      number,
      number,
      number,
      number,
    ],
    color: input.color,
    scratchBudget: Object.freeze({
      availableBytes: budget.availableBytes,
      availablePages: budget.availablePages,
      ...(budget.reservedBytes === undefined
        ? {}
        : { reservedBytes: budget.reservedBytes }),
    }),
  });
}

export function createStudioDryMediaUnionContinuationWorkerClient(
  options: StudioDryMediaUnionContinuationWorkerClientOptions,
): StudioDryMediaUnionContinuationWorkerClient {
  const optionRecord = dataRecord(options);
  if (
    !optionRecord
    || Object.keys(optionRecord).some((key) => ![
      "memory64Coordinator",
      "workerFactory",
      "timeoutMilliseconds",
      "onFrame",
    ].includes(key))
    || optionRecord.memory64Coordinator === null
    || typeof optionRecord.memory64Coordinator !== "object"
    || (optionRecord.workerFactory !== undefined
      && typeof optionRecord.workerFactory !== "function")
    || typeof optionRecord.onFrame !== "function"
  ) throw new TypeError("Invalid dry-media continuation Worker client options.");
  const memory64Coordinator = optionRecord.memory64Coordinator as
    StudioDryMediaUnionContinuationMemory64Coordinator;
  const workerFactory = optionRecord.workerFactory as
    (() => StudioDryMediaUnionContinuationWorkerLike | null) | undefined;
  const onFrame = optionRecord.onFrame as
    StudioDryMediaUnionContinuationWorkerClientOptions["onFrame"];
  const timeoutMilliseconds = optionRecord.timeoutMilliseconds ?? 30_000;
  if (
    typeof timeoutMilliseconds !== "number"
    || !Number.isSafeInteger(timeoutMilliseconds)
    || timeoutMilliseconds < 100
    || timeoutMilliseconds > 120_000
  ) throw new TypeError("Invalid dry-media continuation Worker timeout.");
  const safeTimeoutMilliseconds = timeoutMilliseconds as number;

  let worker = (workerFactory ?? defaultWorkerFactory)();
  let state: ClientState = "idle";
  let generation = 1;
  let requestId = 0;
  let strokeId: string | null = null;
  let presentationGeneration = 0;
  let surfaceWidth = 0;
  let surfaceHeight = 0;
  let reservationToken: Memory64CrossRealmReservationToken | null = null;
  let reservationReleaseAttempted = false;
  let scratchResidentByteLength = 0;
  let terminalReason: string | null = null;
  let transportClosed = false;

  let receivedSequence = 0;
  let plannedSequence = 0;
  let admittedSequence = 0;
  let presentedSequence = 0;
  let receivedGroupCount = 0;
  let plannedGroupCount = 0;
  let admittedGroupCount = 0;
  let presentedGroupCount = 0;
  let queuePhysicalPageByteLength = 0;
  let maximumQueuePhysicalPageByteLength = 0;
  let transferCount = 0;

  let beginning: PendingControl<void> | null = null;
  let sealing: PendingControl<StudioDryMediaUnionPagedRootReceipt> | null = null;
  let cancelling: PendingControl<void> | null = null;
  let inflight: AppendJob | null = null;
  let queued: AppendJob | null = null;

  const releaseReservation = (): void => {
    if (!reservationToken || reservationReleaseAttempted) return;
    reservationReleaseAttempted = true;
    try {
      memory64Coordinator.releaseCrossRealmReservation(reservationToken);
    } finally {
      reservationToken = null;
      scratchResidentByteLength = 0;
    }
  };

  const markReservationReleasedByAcknowledgement = (): void => {
    reservationReleaseAttempted = true;
    reservationToken = null;
    scratchResidentByteLength = 0;
  };

  const detachTransport = (): void => {
    if (transportClosed) return;
    transportClosed = true;
    if (worker) {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onError);
      try {
        worker.terminate();
      } catch {
        // The Worker is still treated as terminal when host termination throws.
      }
    }
    worker = null;
    releaseReservation();
  };

  const rejectAppend = (job: AppendJob | null, error: Error): void => {
    if (!job) return;
    if (job.timer) clearTimeout(job.timer);
    job.timer = null;
    job.pages = null;
    job.completion.reject(error);
  };

  const poison = (message: string): void => {
    if (["sealed", "cancelled", "poisoned", "disposed"].includes(state)) return;
    const error = new Error(message);
    terminalReason = message;
    state = "poisoned";
    if (beginning) {
      clearTimeout(beginning.timer);
      beginning.deferred.reject(error);
      beginning = null;
    }
    if (sealing) {
      clearTimeout(sealing.timer);
      sealing.deferred.reject(error);
      sealing = null;
    }
    if (cancelling) {
      clearTimeout(cancelling.timer);
      cancelling.deferred.reject(error);
      cancelling = null;
    }
    rejectAppend(inflight, error);
    rejectAppend(queued, error);
    inflight = null;
    queued = null;
    queuePhysicalPageByteLength = 0;
    detachTransport();
  };

  const timeout = (message: string): ReturnType<typeof setTimeout> => setTimeout(() => {
    poison(message);
  }, safeTimeoutMilliseconds);

  const post = (
    request: StudioDryMediaUnionContinuationRequest,
    transfer: Transferable[] = [],
  ): boolean => {
    if (!worker || transportClosed) return false;
    try {
      worker.postMessage(request, transfer);
      return true;
    } catch (error) {
      poison(error instanceof Error
        ? error.message
        : "studio-dry-media-continuation-post-failed");
      return false;
    }
  };

  const pump = (): void => {
    if (state !== "ready" || inflight || !queued || !worker) return;
    const job = queued;
    queued = null;
    inflight = job;
    requestId = nextSafe(requestId);
    job.requestId = requestId;
    const pages = job.pages;
    if (!pages) {
      poison("studio-dry-media-continuation-missing-pages");
      return;
    }
    const request: StudioDryMediaUnionContinuationAppendRequest = {
      type: "studio-dry-media-union/append",
      version: STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION,
      workerGeneration: generation,
      requestId,
      strokeId: strokeId!,
      sequence: job.sequence,
      pages,
    };
    const transfer = pages.flatMap((page) => [
      ...studioDryMediaUnionContinuationPageTransferables(page),
    ]);
    transferCount += transfer.length;
    job.timer = timeout("studio-dry-media-continuation-append-timeout");
    if (post(request, transfer)) job.pages = null;
  };

  const handleReady = (response: Record<string, unknown>): void => {
    const pending = beginning;
    const exact = exactDataRecord(response, [
      "type",
      "version",
      "workerGeneration",
      "requestId",
      "strokeId",
      "scratchAllocationAck",
    ]);
    if (
      !pending
      || state !== "beginning"
      || !exact
      || exact.version !== STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION
      || exact.workerGeneration !== generation
      || exact.requestId !== pending.requestId
      || exact.strokeId !== strokeId
    ) {
      poison("studio-dry-media-continuation-ready-mismatch");
      return;
    }
    const acknowledgement = snapshotAllocationAck(exact.scratchAllocationAck);
    if (!acknowledgement || !reservationToken) {
      poison("studio-dry-media-continuation-invalid-allocation-ack");
      return;
    }
    let acknowledgementReceipt;
    try {
      acknowledgementReceipt = memory64Coordinator
        .acknowledgeCrossRealmReservation(reservationToken, acknowledgement);
    } catch (error) {
      poison(error instanceof Error
        ? error.message
        : "studio-dry-media-continuation-allocation-ack-failed");
      return;
    }
    if (!acknowledgementReceipt.ok) {
      // The coordinator's rejection contract releases the pending reservation.
      markReservationReleasedByAcknowledgement();
      poison(`studio-dry-media-continuation-allocation-ack-${acknowledgementReceipt.reason}`);
      return;
    }
    scratchResidentByteLength = Number(acknowledgementReceipt.residentBytes);
    clearTimeout(pending.timer);
    beginning = null;
    state = "ready";
    pending.deferred.resolve(undefined);
  };

  const handleAppended = (response: Record<string, unknown>): void => {
    const job = inflight;
    const exact = exactDataRecord(response, [
      "type",
      "version",
      "workerGeneration",
      "requestId",
      "strokeId",
      "sequence",
      "logicalByteLength",
      "residentByteLength",
      "inflightByteLength",
      "frame",
    ]);
    if (
      !job
      || state !== "ready"
      || !exact
      || exact.version !== STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION
      || exact.workerGeneration !== generation
      || exact.requestId !== job.requestId
      || exact.strokeId !== strokeId
      || exact.sequence !== job.sequence
      || !safeNonNegativeInteger(exact.logicalByteLength)
      || exact.logicalByteLength !== job.logicalByteLength
      || !safeNonNegativeInteger(exact.residentByteLength)
      || exact.inflightByteLength !== 0
    ) {
      closePotentialFrame(response);
      poison("studio-dry-media-continuation-append-mismatch");
      return;
    }
    const frame = snapshotFrame(exact.frame, {
      strokeId: strokeId!,
      workerGeneration: generation,
      sequence: job.sequence,
      presentationGeneration,
      width: surfaceWidth,
      height: surfaceHeight,
    });
    if (!frame) {
      closePotentialFrame(response);
      poison("studio-dry-media-continuation-frame-mismatch");
      return;
    }
    if (job.timer) clearTimeout(job.timer);
    job.timer = null;
    admittedSequence = job.sequence;
    admittedGroupCount = job.firstGroupIndex + job.groupCount;
    let presented: boolean;
    try {
      presented = onFrame(frame) === true;
    } catch (error) {
      closeFrame(frame);
      poison(error instanceof Error
        ? error.message
        : "studio-dry-media-continuation-frame-observer-failed");
      return;
    }
    if (!presented) {
      closeFrame(frame);
      poison("studio-dry-media-continuation-frame-not-presented");
      return;
    }
    presentedSequence = job.sequence;
    presentedGroupCount = admittedGroupCount;
    queuePhysicalPageByteLength = Math.max(
      0,
      queuePhysicalPageByteLength - job.physicalPageByteLength,
    );
    inflight = null;
    job.completion.resolve(undefined);
    pump();
  };

  const handleSealed = (response: Record<string, unknown>): void => {
    const pending = sealing;
    const exact = exactDataRecord(response, [
      "type",
      "version",
      "workerGeneration",
      "requestId",
      "strokeId",
      "receipt",
    ]);
    const receipt = pending && exact
      ? snapshotRootReceipt(exact.receipt, {
          strokeId: strokeId!,
          generation,
          sequence: presentedSequence,
          groupCount: presentedGroupCount,
          presentationGeneration,
        })
      : null;
    if (
      !pending
      || state !== "sealing"
      || !exact
      || exact.version !== STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION
      || exact.workerGeneration !== generation
      || exact.requestId !== pending.requestId
      || exact.strokeId !== strokeId
      || !receipt
    ) {
      poison("studio-dry-media-continuation-seal-mismatch");
      return;
    }
    clearTimeout(pending.timer);
    sealing = null;
    state = "sealed";
    terminalReason = "studio-dry-media-continuation-sealed";
    detachTransport();
    pending.deferred.resolve(receipt);
  };

  const handleCancelled = (response: Record<string, unknown>): void => {
    const pending = cancelling;
    const exact = exactDataRecord(response, [
      "type",
      "version",
      "workerGeneration",
      "requestId",
      "strokeId",
    ]);
    if (
      !pending
      || state !== "cancelling"
      || !exact
      || exact.version !== STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION
      || exact.workerGeneration !== generation
      || exact.requestId !== pending.requestId
      || exact.strokeId !== strokeId
    ) {
      poison("studio-dry-media-continuation-cancel-mismatch");
      return;
    }
    clearTimeout(pending.timer);
    cancelling = null;
    state = "cancelled";
    terminalReason = "studio-dry-media-continuation-cancelled";
    detachTransport();
    pending.deferred.resolve(undefined);
  };

  const handleFailure = (response: Record<string, unknown>): void => {
    const exact = exactDataRecord(response, [
      "type",
      "version",
      "workerGeneration",
      "requestId",
      "strokeId",
      "reason",
      "detail",
    ]);
    if (!exact || typeof exact.detail !== "string") {
      poison("studio-dry-media-continuation-invalid-failure");
      return;
    }
    poison(exact.detail.slice(0, 512) || "studio-dry-media-continuation-worker-failure");
  };

  function onMessage(event: MessageEventLike): void {
    if (["sealed", "cancelled", "poisoned", "disposed"].includes(state)) {
      closePotentialFrame(event.data);
      return;
    }
    const response = dataRecord(event.data);
    if (!response || typeof response.type !== "string") {
      closePotentialFrame(event.data);
      poison("studio-dry-media-continuation-invalid-response");
      return;
    }
    switch (response.type) {
      case "studio-dry-media-union/ready":
        handleReady(response);
        break;
      case "studio-dry-media-union/appended":
        handleAppended(response);
        break;
      case "studio-dry-media-union/sealed":
        handleSealed(response);
        break;
      case "studio-dry-media-union/cancelled":
        handleCancelled(response);
        break;
      case "studio-dry-media-union/failure":
        handleFailure(response);
        break;
      default:
        closePotentialFrame(event.data);
        poison("studio-dry-media-continuation-unexpected-response");
    }
  }

  function onError(event: ErrorEventLike): void {
    event.preventDefault?.();
    poison(event.message?.slice(0, 512) || "studio-dry-media-continuation-worker-error");
  }

  worker?.addEventListener("message", onMessage);
  worker?.addEventListener("error", onError);
  worker?.addEventListener("messageerror", onError);

  const client: StudioDryMediaUnionContinuationWorkerClient = {
    get available() {
      return worker !== null && !transportClosed;
    },
    begin(inputCandidate) {
      if (state !== "idle" || !worker || transportClosed) {
        return Promise.reject(new Error("studio-dry-media-continuation-unavailable"));
      }
      const input = snapshotBeginInput(inputCandidate);
      if (!input) {
        poison("studio-dry-media-continuation-invalid-begin");
        return Promise.reject(new Error("studio-dry-media-continuation-invalid-begin"));
      }
      let reservation;
      try {
        reservation = memory64Coordinator.reserveCrossRealm({
          workload: "brush",
          logicalByteLength:
            STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
          preferredChunkBytes:
            STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
          minimumChunkBytes:
            STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
          budget: input.scratchBudget,
          source: {
            authority: "opfs-cas-paging",
            access: "paged-range-only",
          },
        });
      } catch (error) {
        poison(error instanceof Error
          ? error.message
          : "studio-dry-media-continuation-reservation-failed");
        return Promise.reject(error instanceof Error
          ? error
          : new Error("studio-dry-media-continuation-reservation-failed"));
      }
      if (!reservation.ok) {
        const error = new Error(
          `studio-dry-media-continuation-reservation-${reservation.terminal.reason}`,
        );
        poison(error.message);
        return Promise.reject(error);
      }
      const token = snapshotMemory64CrossRealmReservationToken(reservation.token);
      if (!token) {
        try {
          reservation.release();
        } finally {
          poison("studio-dry-media-continuation-invalid-reservation");
        }
        return Promise.reject(new Error("studio-dry-media-continuation-invalid-reservation"));
      }
      reservationToken = token;
      reservationReleaseAttempted = false;
      scratchResidentByteLength = Number(reservation.plan.workingSetBytes);
      generation = nextSafe(generation);
      requestId = nextSafe(requestId);
      strokeId = input.strokeId;
      presentationGeneration = input.presentationGeneration;
      surfaceWidth = input.width;
      surfaceHeight = input.height;
      state = "beginning";
      const pending = deferred<void>();
      beginning = {
        requestId,
        deferred: pending,
        timer: timeout("studio-dry-media-continuation-begin-timeout"),
      };
      const request: StudioDryMediaUnionContinuationRequest = {
        type: "studio-dry-media-union/begin",
        version: STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION,
        workerGeneration: generation,
        requestId,
        strokeId: input.strokeId,
        presentationGeneration: input.presentationGeneration,
        programVersion: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION,
        programDigest: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
        width: input.width,
        height: input.height,
        transform: input.transform,
        color: input.color,
        scratchReservation: token,
      };
      post(request);
      return pending.promise;
    },
    tryAppend(marks) {
      if (state !== "ready") {
        return Object.freeze({ ok: false, status: "rejected", reason: "not-ready" });
      }
      const outstandingCount = Number(inflight !== null) + Number(queued !== null);
      if (outstandingCount >= MAX_OUTSTANDING_APPEND_REQUESTS) {
        return Object.freeze({ ok: false, status: "backpressure", reason: "queue-full" });
      }
      let packed: ReturnType<typeof packStudioDryMediaUnionContinuationPages>;
      try {
        packed = packStudioDryMediaUnionContinuationPages(marks, plannedGroupCount);
      } catch {
        return Object.freeze({ ok: false, status: "rejected", reason: "pack-failed" });
      }
      if (packed.status !== "packed") {
        return Object.freeze({ ok: false, status: "rejected", reason: packed.reason });
      }
      if (!packed.inputComplete || packed.nextCursor !== null) {
        return Object.freeze({
          ok: false,
          status: "backpressure",
          reason: "append-window-exceeded",
        });
      }
      const physicalPageByteLength = packed.pages.reduce(
        (sum, page) => sum + page.buffer.byteLength,
        0,
      );
      if (
        !Number.isSafeInteger(physicalPageByteLength)
        || physicalPageByteLength <= 0
        || physicalPageByteLength !== packed.physicalBufferByteLength
        || packed.pages.length > STUDIO_DRY_MEDIA_UNION_CONTINUATION_MAX_PAGE_COUNT
        || physicalPageByteLength > STUDIO_DRY_MEDIA_UNION_CONTINUATION_MAX_INFLIGHT_BYTES
        || queuePhysicalPageByteLength + physicalPageByteLength
          > STUDIO_DRY_MEDIA_UNION_CONTINUATION_MAX_INFLIGHT_BYTES
      ) {
        return Object.freeze({
          ok: false,
          status: "backpressure",
          reason: "physical-page-budget",
        });
      }
      const sequence = nextSafe(plannedSequence);
      const completion = deferred<void>();
      const job: AppendJob = {
        sequence,
        firstGroupIndex: plannedGroupCount,
        groupCount: packed.groupCount,
        physicalPageByteLength,
        logicalByteLength: packed.logicalByteLength,
        pageCount: packed.pages.length,
        completion,
        pages: packed.pages,
        timer: null,
        requestId: null,
      };
      receivedSequence = sequence;
      plannedSequence = sequence;
      receivedGroupCount += packed.groupCount;
      plannedGroupCount += packed.groupCount;
      queuePhysicalPageByteLength += physicalPageByteLength;
      maximumQueuePhysicalPageByteLength = Math.max(
        maximumQueuePhysicalPageByteLength,
        queuePhysicalPageByteLength,
      );
      queued = job;
      pump();
      return Object.freeze({
        ok: true,
        status: "accepted",
        sequence,
        firstGroupIndex: job.firstGroupIndex,
        groupCount: job.groupCount,
        pageCount: job.pageCount,
        physicalPageByteLength,
        completion: completion.promise,
      });
    },
    seal() {
      if (
        state !== "ready"
        || inflight !== null
        || queued !== null
        || queuePhysicalPageByteLength !== 0
        || receivedSequence !== plannedSequence
        || plannedSequence !== admittedSequence
        || admittedSequence !== presentedSequence
        || receivedGroupCount !== plannedGroupCount
        || plannedGroupCount !== admittedGroupCount
        || admittedGroupCount !== presentedGroupCount
      ) {
        return Promise.reject(new Error("studio-dry-media-continuation-not-quiescent"));
      }
      state = "sealing";
      requestId = nextSafe(requestId);
      const pending = deferred<StudioDryMediaUnionPagedRootReceipt>();
      sealing = {
        requestId,
        deferred: pending,
        timer: timeout("studio-dry-media-continuation-seal-timeout"),
      };
      post({
        type: "studio-dry-media-union/seal",
        version: STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION,
        workerGeneration: generation,
        requestId,
        strokeId: strokeId!,
        sequence: presentedSequence,
      });
      return pending.promise;
    },
    cancel() {
      if (["sealed", "cancelled", "disposed"].includes(state)) return Promise.resolve();
      if (state === "poisoned") {
        return Promise.reject(new Error(terminalReason ?? "studio-dry-media-continuation-poisoned"));
      }
      if (state === "beginning" || inflight || queued) {
        const result = Promise.resolve();
        terminalReason = "studio-dry-media-continuation-cancelled";
        if (beginning) {
          clearTimeout(beginning.timer);
          beginning.deferred.reject(new Error(terminalReason));
          beginning = null;
        }
        rejectAppend(inflight, new Error(terminalReason));
        rejectAppend(queued, new Error(terminalReason));
        inflight = null;
        queued = null;
        queuePhysicalPageByteLength = 0;
        state = "cancelled";
        detachTransport();
        return result;
      }
      if (state === "idle") {
        terminalReason = "studio-dry-media-continuation-cancelled";
        state = "cancelled";
        detachTransport();
        return Promise.resolve();
      }
      if (state !== "ready") return Promise.resolve();
      state = "cancelling";
      requestId = nextSafe(requestId);
      const pending = deferred<void>();
      cancelling = {
        requestId,
        deferred: pending,
        timer: timeout("studio-dry-media-continuation-cancel-timeout"),
      };
      post({
        type: "studio-dry-media-union/cancel",
        version: STUDIO_DRY_MEDIA_UNION_CONTINUATION_PROTOCOL_VERSION,
        workerGeneration: generation,
        requestId,
        strokeId: strokeId!,
      });
      return pending.promise;
    },
    dispose() {
      if (["sealed", "cancelled", "disposed"].includes(state)) return;
      const error = new Error("studio-dry-media-continuation-disposed");
      terminalReason = error.message;
      if (beginning) {
        clearTimeout(beginning.timer);
        beginning.deferred.reject(error);
        beginning = null;
      }
      if (sealing) {
        clearTimeout(sealing.timer);
        sealing.deferred.reject(error);
        sealing = null;
      }
      if (cancelling) {
        clearTimeout(cancelling.timer);
        cancelling.deferred.reject(error);
        cancelling = null;
      }
      rejectAppend(inflight, error);
      rejectAppend(queued, error);
      inflight = null;
      queued = null;
      queuePhysicalPageByteLength = 0;
      state = "disposed";
      detachTransport();
    },
    stats() {
      const queueCount = Number(inflight !== null) + Number(queued !== null);
      return Object.freeze({
        generation,
        receivedSequence,
        plannedSequence,
        admittedSequence,
        presentedSequence,
        receivedGroupCount,
        plannedGroupCount,
        admittedGroupCount,
        presentedGroupCount,
        queueCount,
        queuePhysicalPageByteLength,
        inflightPhysicalPageByteLength: inflight?.physicalPageByteLength ?? 0,
        queuedPhysicalPageByteLength: queued?.physicalPageByteLength ?? 0,
        maximumQueuePhysicalPageByteLength,
        transferCount,
        scratchReservationActive:
          reservationToken !== null && !reservationReleaseAttempted,
        scratchResidentByteLength,
        state,
        disposed: ["sealed", "cancelled", "poisoned", "disposed"].includes(state),
        terminalReason,
      });
    },
  };
  return client;
}
