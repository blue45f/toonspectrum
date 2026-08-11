import { describe, expect, it, vi } from "vitest";

import {
  Memory64WorkloadCoordinator,
} from "./kernel/Memory64WorkloadCoordinator";
import {
  probeWasmMemory64Capability,
  type WasmMemory64CapabilityReceipt,
} from "./kernel/WasmMemory64Capability";
import {
  STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
  STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION,
} from "./studio-brush-dynamics";
import {
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_MAX_INFLIGHT_BYTES,
  type StudioDryMediaUnionContinuationRequest,
  type StudioDryMediaUnionContinuationResponse,
} from "./studio-dry-media-union-continuation-protocol";
import {
  STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
} from "./studio-dry-media-union-continuation-scratch-arena";
import {
  createStudioDryMediaUnionContinuationWorkerClient,
  type StudioDryMediaUnionContinuationWorkerLike,
} from "./studio-dry-media-union-continuation-worker-client";
import {
  STUDIO_DRY_MEDIA_UNION_RIBBON_CARRIER_VERSION,
} from "./studio-dry-media-union-ribbon-carrier";

import type { StudioDynamicBrushCoverageMark } from "./studio-dynamic-brush-coverage-renderer";

type BeginRequest = Extract<
  StudioDryMediaUnionContinuationRequest,
  { readonly type: "studio-dry-media-union/begin" }
>;
type AppendRequest = Extract<
  StudioDryMediaUnionContinuationRequest,
  { readonly type: "studio-dry-media-union/append" }
>;
type SealRequest = Extract<
  StudioDryMediaUnionContinuationRequest,
  { readonly type: "studio-dry-media-union/seal" }
>;
type CancelRequest = Extract<
  StudioDryMediaUnionContinuationRequest,
  { readonly type: "studio-dry-media-union/cancel" }
>;

interface MessageEventLike {
  readonly data: unknown;
}

interface ErrorEventLike {
  readonly message?: string;
  preventDefault?(): void;
}

type MessageListener = (event: MessageEventLike) => void;
type ErrorListener = (event: ErrorEventLike) => void;

class FakeWorker implements StudioDryMediaUnionContinuationWorkerLike {
  readonly requests: StudioDryMediaUnionContinuationRequest[] = [];
  readonly transfers: Transferable[][] = [];
  readonly terminate = vi.fn();
  onPost: ((request: StudioDryMediaUnionContinuationRequest) => void) | null = null;
  postError: Error | null = null;

  readonly #messageListeners = new Set<MessageListener>();
  readonly #errorListeners = new Set<ErrorListener>();
  readonly #messageErrorListeners = new Set<ErrorListener>();

  postMessage(
    request: StudioDryMediaUnionContinuationRequest,
    transfer: Transferable[] = [],
  ): void {
    if (this.postError) throw this.postError;
    this.requests.push(request);
    this.transfers.push(transfer);
    this.onPost?.(request);
  }

  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "error" | "messageerror", listener: ErrorListener): void;
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: MessageListener | ErrorListener,
  ): void {
    if (type === "message") this.#messageListeners.add(listener as MessageListener);
    else if (type === "error") this.#errorListeners.add(listener as ErrorListener);
    else this.#messageErrorListeners.add(listener as ErrorListener);
  }

  removeEventListener(type: "message", listener: MessageListener): void;
  removeEventListener(type: "error" | "messageerror", listener: ErrorListener): void;
  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: MessageListener | ErrorListener,
  ): void {
    if (type === "message") this.#messageListeners.delete(listener as MessageListener);
    else if (type === "error") this.#errorListeners.delete(listener as ErrorListener);
    else this.#messageErrorListeners.delete(listener as ErrorListener);
  }

  emit(data: unknown): void {
    for (const listener of this.#messageListeners) listener({ data });
  }

  emitError(type: "error" | "messageerror", message: string): void {
    const event = { message, preventDefault: vi.fn() };
    const listeners = type === "error" ? this.#errorListeners : this.#messageErrorListeners;
    for (const listener of listeners) listener(event);
  }
}

const BASE_CAPABILITY = probeWasmMemory64Capability({ webAssembly: null });

function memory32Capability(): WasmMemory64CapabilityReceipt {
  return Object.freeze({
    ...BASE_CAPABILITY,
    selectedRuntime: "memory32-fallback" as const,
    isMemory64Supported: false,
    isMemory32FallbackSupported: true,
  });
}

function createCoordinator(clock = { now: 1_000 }) {
  const coordinator = new Memory64WorkloadCoordinator({
    capabilityProbe: memory32Capability,
    crossRealmNonceFactory: () => "a".repeat(64),
    now: () => clock.now,
    crossRealmAcknowledgementTimeoutMs: 500,
  });
  const release = vi.spyOn(coordinator, "releaseCrossRealmReservation");
  return { coordinator, release, clock };
}

function readyFor(
  request: BeginRequest,
  overrides: Partial<Extract<
    StudioDryMediaUnionContinuationResponse,
    { readonly type: "studio-dry-media-union/ready" }
  >["scratchAllocationAck"]> = {},
): StudioDryMediaUnionContinuationResponse {
  const token = request.scratchReservation;
  return {
    type: "studio-dry-media-union/ready",
    version: 1,
    workerGeneration: request.workerGeneration,
    requestId: request.requestId,
    strokeId: request.strokeId,
    scratchAllocationAck: {
      kind: "epoch16-memory64/cross-realm-allocation-ack",
      version: 1,
      reservationId: token.reservationId,
      nonce: token.nonce,
      runtime: token.preferredRuntime,
      addressType: token.preferredRuntime === "memory64" ? "i64" : "i32",
      residentBytes: token.authorizedResidentBytes,
      residentPages: token.authorizedResidentPages,
      ...overrides,
    },
  };
}

function bitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

function appendedFor(
  request: AppendRequest,
  frameBitmap: ImageBitmap = bitmap(),
): Extract<
  StudioDryMediaUnionContinuationResponse,
  { readonly type: "studio-dry-media-union/appended" }
> {
  return {
    type: "studio-dry-media-union/appended",
    version: 1,
    workerGeneration: request.workerGeneration,
    requestId: request.requestId,
    strokeId: request.strokeId,
    sequence: request.sequence,
    logicalByteLength: request.pages.reduce((sum, page) => sum + page.byteLength, 0),
    residentByteLength: STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
    inflightByteLength: 0,
    frame: {
      contract: "studio-dry-media-union-frame-v1",
      version: 1,
      strokeId: request.strokeId,
      workerGeneration: request.workerGeneration,
      sequence: request.sequence,
      presentationGeneration: 9,
      programDigest: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
      tiles: [{
        tileX: 0,
        tileY: 0,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        bitmap: frameBitmap,
      }],
    },
  };
}

function sealedFor(
  request: SealRequest,
  groupCount: number,
  overrides: Record<string, unknown> = {},
): StudioDryMediaUnionContinuationResponse {
  return {
    type: "studio-dry-media-union/sealed",
    version: 1,
    workerGeneration: request.workerGeneration,
    requestId: request.requestId,
    strokeId: request.strokeId,
    receipt: {
      contract: "studio-dry-media-union-paged-root-v1",
      version: 1,
      strokeId: request.strokeId,
      generation: request.workerGeneration,
      sequence: request.sequence,
      programVersion: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION,
      programDigest: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
      rootDigest: "1".repeat(64),
      contentDigest: "2".repeat(64),
      metadataDigest: "3".repeat(64),
      pageCount: 1,
      indexPageCount: 1,
      bitmapPageCount: 1,
      groupCount,
      contourCount: groupCount,
      coordinateCount: groupCount * 6,
      logicalByteLength: 512,
      pagedByteLength: 512,
      residentByteLength: 0,
      hydratedByteLength: 0,
      inflightByteLength: 0,
      slabCapacityByteLength: 512,
      fragmentationByteLength: 0,
      presentationGeneration: 9,
      ...overrides,
    },
  };
}

function cancelledFor(request: CancelRequest): StudioDryMediaUnionContinuationResponse {
  return {
    type: "studio-dry-media-union/cancelled",
    version: 1,
    workerGeneration: request.workerGeneration,
    requestId: request.requestId,
    strokeId: request.strokeId,
  };
}

function markWithGroups(groupCount: number): StudioDynamicBrushCoverageMark {
  const groups = Array.from({ length: groupCount }, (_, stationIndex) => Object.freeze({
    stationIndex,
    polygons: Object.freeze([
      Object.freeze([
        stationIndex * 0.001,
        0,
        stationIndex * 0.001 + 0.5,
        0,
        stationIndex * 0.001,
        0.5,
      ]),
    ]),
  }));
  return {
    x: 0,
    y: 0,
    radiusX: 1,
    radiusY: 1,
    angleRadians: 0,
    alpha: 1,
    color: "#332211",
    ribbon: {
      kind: "dry-media-union-ribbon-polygon",
      version: STUDIO_DRY_MEDIA_UNION_RIBBON_CARRIER_VERSION,
      role: "stroke-union",
      polygons: groups.flatMap((group) => group.polygons),
      compositing: {
        kind: "causal-group-alpha-max",
        version: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_VERSION,
        programDigest: STUDIO_DRY_MEDIA_UNION_COMPOSABLE_PROGRAM_DIGEST,
        groups,
      },
    },
  };
}

function beginInput() {
  return {
    strokeId: "stroke-a",
    presentationGeneration: 9,
    width: 512,
    height: 512,
    transform: [1, 0, 0, 1, 0, 0] as const,
    color: "#332211",
    scratchBudget: {
      availableBytes: STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
      availablePages:
        STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH / (64 * 1024),
    },
  };
}

function createHarness(
  setup: Readonly<{
    onFrame?: (frame: Parameters<
      ReturnType<typeof createStudioDryMediaUnionContinuationWorkerClient>["tryAppend"]
    >[0]) => boolean;
  }> = {},
) {
  const worker = new FakeWorker();
  const authority = createCoordinator();
  const onFrame = vi.fn((frame: unknown) => {
    if (setup.onFrame) {
      return setup.onFrame(frame as never);
    }
    return true;
  });
  const client = createStudioDryMediaUnionContinuationWorkerClient({
    memory64Coordinator: authority.coordinator,
    workerFactory: () => worker,
    onFrame,
    timeoutMilliseconds: 500,
  });
  return { worker, ...authority, client, onFrame };
}

async function beginReady(
  harness: ReturnType<typeof createHarness>,
): Promise<BeginRequest> {
  const pending = harness.client.begin(beginInput());
  const request = harness.worker.requests.at(-1);
  expect(request?.type).toBe("studio-dry-media-union/begin");
  const beginRequest = request as BeginRequest;
  harness.worker.emit(readyFor(beginRequest));
  await pending;
  return beginRequest;
}

function expectReleased(harness: ReturnType<typeof createHarness>): void {
  expect(harness.release).toHaveBeenCalledTimes(1);
  expect(harness.coordinator.activeResidentBytes).toBe(BigInt(0));
  expect(harness.coordinator.activeCrossRealmReservationCount).toBe(0);
  expect(harness.client.stats()).toMatchObject({
    scratchReservationActive: false,
    scratchResidentByteLength: 0,
    disposed: true,
  });
  expect(harness.worker.terminate).toHaveBeenCalledTimes(1);
}

describe("dry-media continuation Worker client", () => {
  it("reserves exact brush scratch before BEGIN and acknowledges READY before becoming ready", async () => {
    const harness = createHarness();
    const pending = harness.client.begin(beginInput());
    const request = harness.worker.requests[0] as BeginRequest;

    expect(request.type).toBe("studio-dry-media-union/begin");
    expect(request.scratchReservation.workload).toBe("brush");
    expect(request.scratchReservation.authorizedResidentBytes).toBe(
      String(STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH),
    );
    expect(harness.coordinator.activeResidentBytes).toBe(
      BigInt(STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH),
    );
    expect(harness.client.stats()).toMatchObject({
      state: "beginning",
      scratchReservationActive: true,
    });

    harness.worker.emit(readyFor(request));
    await pending;
    expect(harness.client.stats()).toMatchObject({
      state: "ready",
      scratchReservationActive: true,
      scratchResidentByteLength:
        STUDIO_DRY_MEDIA_UNION_CONTINUATION_SCRATCH_WINDOW_BYTE_LENGTH,
    });
    expect(harness.release).not.toHaveBeenCalled();
    harness.client.dispose();
    expectReleased(harness);
  });

  it("holds one in-flight and one queued request, then pumps request two after ACK one", async () => {
    const harness = createHarness();
    await beginReady(harness);
    const first = harness.client.tryAppend([markWithGroups(2)]);
    const second = harness.client.tryAppend([markWithGroups(3)]);
    const beforeThird = harness.client.stats();
    const third = harness.client.tryAppend([markWithGroups(1)]);

    expect(first).toMatchObject({ ok: true, sequence: 1, groupCount: 2 });
    expect(second).toMatchObject({ ok: true, sequence: 2, groupCount: 3 });
    expect(third).toEqual({ ok: false, status: "backpressure", reason: "queue-full" });
    expect(harness.client.stats()).toMatchObject({
      receivedSequence: 2,
      plannedSequence: 2,
      admittedSequence: 0,
      presentedSequence: 0,
      receivedGroupCount: 5,
      plannedGroupCount: 5,
      admittedGroupCount: 0,
      presentedGroupCount: 0,
      queueCount: 2,
    });
    expect(harness.client.stats().queuePhysicalPageByteLength).toBeLessThanOrEqual(
      STUDIO_DRY_MEDIA_UNION_CONTINUATION_MAX_INFLIGHT_BYTES,
    );
    expect(harness.client.stats()).toMatchObject({
      receivedSequence: beforeThird.receivedSequence,
      receivedGroupCount: beforeThird.receivedGroupCount,
      transferCount: beforeThird.transferCount,
    });

    const appendRequests = () => harness.worker.requests.filter(
      (request): request is AppendRequest => request.type === "studio-dry-media-union/append",
    );
    expect(appendRequests()).toHaveLength(1);
    harness.worker.emit(appendedFor(appendRequests()[0]!));
    await expect(first.ok ? first.completion : Promise.reject()).resolves.toBeUndefined();
    expect(appendRequests()).toHaveLength(2);
    expect(harness.client.stats()).toMatchObject({
      admittedSequence: 1,
      presentedSequence: 1,
      admittedGroupCount: 2,
      presentedGroupCount: 2,
      queueCount: 1,
    });

    harness.worker.emit(appendedFor(appendRequests()[1]!));
    await expect(second.ok ? second.completion : Promise.reject()).resolves.toBeUndefined();
    expect(harness.client.stats()).toMatchObject({
      receivedSequence: 2,
      plannedSequence: 2,
      admittedSequence: 2,
      presentedSequence: 2,
      receivedGroupCount: 5,
      plannedGroupCount: 5,
      admittedGroupCount: 5,
      presentedGroupCount: 5,
      queueCount: 0,
      queuePhysicalPageByteLength: 0,
    });
    harness.client.dispose();
    expectReleased(harness);
  });

  it("rejects an incomplete bounded pack without advancing any cursor or transfer", async () => {
    const harness = createHarness();
    await beginReady(harness);
    const before = harness.client.stats();
    const result = harness.client.tryAppend([markWithGroups(4_097)]);

    expect(result).toEqual({
      ok: false,
      status: "backpressure",
      reason: "append-window-exceeded",
    });
    expect(harness.client.stats()).toEqual(before);
    expect(harness.worker.requests.filter((request) => (
      request.type === "studio-dry-media-union/append"
    ))).toHaveLength(0);
    harness.client.dispose();
    expectReleased(harness);
  });

  it("advances admitted on ACK but requires onFrame true before presented", async () => {
    const frameBitmap = bitmap();
    const harness = createHarness({ onFrame: () => false });
    await beginReady(harness);
    const append = harness.client.tryAppend([markWithGroups(4)]);
    expect(append.ok).toBe(true);
    const request = harness.worker.requests.at(-1) as AppendRequest;
    harness.worker.emit(appendedFor(request, frameBitmap));

    await expect(append.ok ? append.completion : Promise.reject()).rejects.toThrow(
      "frame-not-presented",
    );
    expect(frameBitmap.close).toHaveBeenCalledTimes(1);
    expect(harness.client.stats()).toMatchObject({
      admittedSequence: 1,
      admittedGroupCount: 4,
      presentedSequence: 0,
      presentedGroupCount: 0,
      state: "poisoned",
    });
    expectReleased(harness);
  });

  it("rejects a mismatched logical page receipt before admitting the sequence", async () => {
    const frameBitmap = bitmap();
    const harness = createHarness();
    await beginReady(harness);
    const append = harness.client.tryAppend([markWithGroups(2)]);
    const request = harness.worker.requests.at(-1) as AppendRequest;
    const response = appendedFor(request, frameBitmap);
    harness.worker.emit({
      ...response,
      logicalByteLength: response.logicalByteLength + 1,
    });

    await expect(append.ok ? append.completion : Promise.reject()).rejects.toThrow(
      "append-mismatch",
    );
    expect(frameBitmap.close).toHaveBeenCalledTimes(1);
    expect(harness.client.stats()).toMatchObject({
      admittedSequence: 0,
      presentedSequence: 0,
      state: "poisoned",
    });
    expectReleased(harness);
  });

  it.each([
    ["presentation generation", { presentationGeneration: 10 }],
    [
      "surface bounds",
      {
        tiles: [{
          tileX: 4,
          tileY: 0,
          x: 512,
          y: 0,
          width: 128,
          height: 128,
          bitmap: bitmap(),
        }],
      },
    ],
  ] as const)("rejects a frame outside the pinned %s", async (_, framePatch) => {
    const frameBitmap = "tiles" in framePatch
      ? framePatch.tiles[0].bitmap
      : bitmap();
    const harness = createHarness();
    await beginReady(harness);
    const append = harness.client.tryAppend([markWithGroups(1)]);
    const request = harness.worker.requests.at(-1) as AppendRequest;
    const response = appendedFor(request, frameBitmap);
    harness.worker.emit({
      ...response,
      frame: { ...response.frame, ...framePatch },
    });

    await expect(append.ok ? append.completion : Promise.reject()).rejects.toThrow(
      "frame-mismatch",
    );
    expect(frameBitmap.close).toHaveBeenCalledTimes(1);
    expectReleased(harness);
  });

  it("closes the frame and poisons when the presentation observer throws", async () => {
    const frameBitmap = bitmap();
    const harness = createHarness({
      onFrame: () => {
        throw new Error("present-failed");
      },
    });
    await beginReady(harness);
    const append = harness.client.tryAppend([markWithGroups(1)]);
    const request = harness.worker.requests.at(-1) as AppendRequest;
    harness.worker.emit(appendedFor(request, frameBitmap));

    await expect(append.ok ? append.completion : Promise.reject()).rejects.toThrow(
      "present-failed",
    );
    expect(frameBitmap.close).toHaveBeenCalledTimes(1);
    expectReleased(harness);
  });

  it("never promotes a stale frame and closes its bitmap", async () => {
    const staleBitmap = bitmap();
    const harness = createHarness();
    await beginReady(harness);
    const append = harness.client.tryAppend([markWithGroups(1)]);
    const request = harness.worker.requests.at(-1) as AppendRequest;
    const stale = appendedFor(request, staleBitmap);
    harness.worker.emit({ ...stale, requestId: request.requestId + 1 });

    await expect(append.ok ? append.completion : Promise.reject()).rejects.toThrow(
      "append-mismatch",
    );
    expect(staleBitmap.close).toHaveBeenCalledTimes(1);
    expect(harness.onFrame).not.toHaveBeenCalled();
    expectReleased(harness);
  });

  it("seals only at equal cursors and returns one immutable validated root receipt", async () => {
    const harness = createHarness();
    await beginReady(harness);
    const append = harness.client.tryAppend([markWithGroups(2)]);
    await expect(harness.client.seal()).rejects.toThrow("not-quiescent");
    const appendRequest = harness.worker.requests.at(-1) as AppendRequest;
    harness.worker.emit(appendedFor(appendRequest));
    await (append.ok ? append.completion : Promise.reject());

    const sealPromise = harness.client.seal();
    const sealRequest = harness.worker.requests.at(-1) as SealRequest;
    harness.worker.emit(sealedFor(sealRequest, 2));
    const receipt = await sealPromise;
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(receipt).toMatchObject({
      strokeId: "stroke-a",
      sequence: 1,
      groupCount: 2,
      rootDigest: "1".repeat(64),
    });
    expect(harness.client.stats().state).toBe("sealed");
    expectReleased(harness);
  });

  it.each([
    ["non-SHA digest", { metadataDigest: "NOT-SHA" }],
    ["stale presentation generation", { presentationGeneration: 10 }],
  ] as const)("fails closed on a %s root receipt", async (_, override) => {
    const harness = createHarness();
    await beginReady(harness);
    const sealPromise = harness.client.seal();
    const request = harness.worker.requests.at(-1) as SealRequest;
    harness.worker.emit(sealedFor(request, 0, override));

    await expect(sealPromise).rejects.toThrow("seal-mismatch");
    expectReleased(harness);
  });

  it.each([
    ["forged", { nonce: "b".repeat(64) }],
    ["malformed", { residentBytes: "not-decimal" }],
  ] as const)("rejects a %s allocation ACK and releases the reservation once", async (_, patch) => {
    const harness = createHarness();
    const pending = harness.client.begin(beginInput());
    const request = harness.worker.requests.at(-1) as BeginRequest;
    harness.worker.emit(readyFor(request, patch));

    await expect(pending).rejects.toThrow("allocation-ack");
    expectReleased(harness);
  });

  it("rejects an expired allocation ACK with one coordinator release", async () => {
    const harness = createHarness();
    const pending = harness.client.begin(beginInput());
    const request = harness.worker.requests.at(-1) as BeginRequest;
    harness.clock.now = request.scratchReservation.acknowledgementDeadlineMilliseconds + 1;
    harness.worker.emit(readyFor(request));

    await expect(pending).rejects.toThrow("acknowledgement-expired");
    expectReleased(harness);
  });

  it("treats a duplicate READY ACK as a terminal protocol violation", async () => {
    const harness = createHarness();
    const request = await beginReady(harness);
    harness.worker.emit(readyFor(request));

    expect(harness.client.stats()).toMatchObject({ state: "poisoned" });
    expectReleased(harness);
  });

  it("does not execute accessors in options, begin input, or READY ACK", async () => {
    let getterCalls = 0;
    const hostileOptions = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostileOptions, "memory64Coordinator", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return createCoordinator().coordinator;
      },
    });
    expect(() => createStudioDryMediaUnionContinuationWorkerClient(
      hostileOptions as never,
    )).toThrow("Invalid dry-media");
    expect(getterCalls).toBe(0);

    const harness = createHarness();
    const hostileInput = { ...beginInput() } as Record<string, unknown>;
    Object.defineProperty(hostileInput, "strokeId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "stroke-hostile";
      },
    });
    await expect(harness.client.begin(hostileInput as never)).rejects.toThrow("invalid-begin");
    expect(getterCalls).toBe(0);
    expect(harness.worker.requests).toHaveLength(0);
    expect(harness.worker.terminate).toHaveBeenCalledTimes(1);

    const readyHarness = createHarness();
    const pending = readyHarness.client.begin(beginInput());
    const request = readyHarness.worker.requests.at(-1) as BeginRequest;
    const response = readyFor(request) as Record<string, unknown>;
    const hostileAck = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostileAck, "nonce", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return request.scratchReservation.nonce;
      },
    });
    response.scratchAllocationAck = hostileAck;
    readyHarness.worker.emit(response);
    await expect(pending).rejects.toThrow("invalid-allocation-ack");
    expect(getterCalls).toBe(0);
    expectReleased(readyHarness);
  });

  it("times out BEGIN and releases exactly one reservation", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const pending = harness.client.begin(beginInput());
      const rejection = expect(pending).rejects.toThrow("begin-timeout");
      await vi.advanceTimersByTimeAsync(501);
      await rejection;
      expectReleased(harness);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["error", "messageerror"] as const)(
    "poisons on Worker %s and returns resident bytes to zero",
    async (type) => {
      const harness = createHarness();
      const pending = harness.client.begin(beginInput());
      harness.worker.emitError(type, `${type}-failed`);
      await expect(pending).rejects.toThrow(`${type}-failed`);
      expectReleased(harness);
    },
  );

  it("poisons and releases when postMessage throws", async () => {
    const harness = createHarness();
    harness.worker.postError = new Error("post-failed");
    await expect(harness.client.begin(beginInput())).rejects.toThrow("post-failed");
    expectReleased(harness);
  });

  it("dispose rejects a pending begin and releases exactly once", async () => {
    const harness = createHarness();
    const pending = harness.client.begin(beginInput());
    harness.client.dispose();
    harness.client.dispose();

    await expect(pending).rejects.toThrow("disposed");
    expectReleased(harness);
  });

  it("terminates an idle client and completes a ready cancel with one release", async () => {
    const idle = createHarness();
    await idle.client.cancel();
    expect(idle.client.stats()).toMatchObject({ state: "cancelled", disposed: true });
    expect(idle.worker.terminate).toHaveBeenCalledTimes(1);
    expect(idle.release).not.toHaveBeenCalled();

    const ready = createHarness();
    await beginReady(ready);
    const cancellation = ready.client.cancel();
    const request = ready.worker.requests.at(-1) as CancelRequest;
    ready.worker.emit(cancelledFor(request));
    await cancellation;
    expectReleased(ready);
  });
});
