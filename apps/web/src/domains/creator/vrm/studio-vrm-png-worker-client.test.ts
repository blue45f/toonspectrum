import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioVrmPngWorkerError,
  encodeStudioVrmPngInWorker,
  type StudioVrmPngWorkerLike,
} from "./studio-vrm-png-worker-client";
import {
  STUDIO_VRM_PNG_MAX_OUTPUT_BYTES,
  STUDIO_VRM_PNG_MAX_PIXELS,
  STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
  isStudioVrmPngWorkerRequest,
  isStudioVrmPngWorkerResponse,
  type StudioVrmPngWorkerRequest,
} from "./studio-vrm-png-worker-protocol";

import type { StudioBg3dLtRasterLayer } from "../bg3d/studio-bg3d-lt-render";

interface MessageEventLike { readonly data: unknown }
interface ErrorEventLike { preventDefault?(): void }

class FakeWorker implements StudioVrmPngWorkerLike {
  readonly requests: StudioVrmPngWorkerRequest[] = [];
  readonly transfers: Transferable[][] = [];
  readonly messages = new Set<(event: MessageEventLike) => void>();
  readonly errors = new Set<(event: ErrorEventLike) => void>();
  readonly messageErrors = new Set<(event: ErrorEventLike) => void>();
  terminateCalls = 0;
  throwOnPost = false;
  performTransfer = false;

  postMessage(message: StudioVrmPngWorkerRequest, transfer: Transferable[]): void {
    if (this.throwOnPost) throw new Error("structured clone failed");
    this.requests.push(this.performTransfer ? structuredClone(message, { transfer }) : message);
    this.transfers.push(transfer);
  }

  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: MessageEventLike) => void) | ((event: ErrorEventLike) => void),
  ): void {
    if (type === "message") this.messages.add(listener as (event: MessageEventLike) => void);
    else if (type === "error") this.errors.add(listener as (event: ErrorEventLike) => void);
    else this.messageErrors.add(listener as (event: ErrorEventLike) => void);
  }

  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: MessageEventLike) => void) | ((event: ErrorEventLike) => void),
  ): void {
    if (type === "message") this.messages.delete(listener as (event: MessageEventLike) => void);
    else if (type === "error") this.errors.delete(listener as (event: ErrorEventLike) => void);
    else this.messageErrors.delete(listener as (event: ErrorEventLike) => void);
  }

  terminate(): void {
    this.terminateCalls += 1;
  }

  emit(data: unknown): void {
    for (const listener of this.messages) listener({ data });
  }

  emitError(type: "error" | "messageerror" = "error"): void {
    const event = { preventDefault: vi.fn() };
    const listeners = type === "error" ? this.errors : this.messageErrors;
    for (const listener of listeners) listener(event);
  }
}

function emitReady(worker: FakeWorker): void {
  worker.emit({
    version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
    kind: "ready",
  });
}

function layer(
  role: StudioBg3dLtRasterLayer["role"] = "color",
  width = 2,
  height = 1,
  value = 40,
): StudioBg3dLtRasterLayer {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(value);
  return { role, width, height, data };
}

function png(width: number, height: number): Blob {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return new Blob([bytes], { type: "image/png" });
}

function resultFor(request: StudioVrmPngWorkerRequest, value = png(request.width, request.height)) {
  return {
    version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
    kind: "result" as const,
    requestId: request.requestId,
    width: request.width,
    height: request.height,
    png: value,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Studio VRM single-image PNG Worker boundary", () => {
  it("admits a real 4096 square buffer and transfers only its copy without detaching caller storage", async () => {
    const color = layer("color", 4_096, 4_096, 41);
    color.data[color.data.length - 1] = 213;
    const original = color.data.buffer;
    const worker = new FakeWorker();
    worker.performTransfer = true;
    const pending = encodeStudioVrmPngInWorker([color], { workerFactory: () => worker });
    emitReady(worker);
    const request = worker.requests[0]!;
    expect(isStudioVrmPngWorkerRequest(request)).toBe(true);
    expect(request.layers).toHaveLength(1);
    expect(request.layers[0]!.dataBuffer.byteLength).toBe(STUDIO_VRM_PNG_MAX_PIXELS * 4);
    expect(request.layers[0]!.dataBuffer).not.toBe(original);
    const pixels = new Uint8ClampedArray(request.layers[0]!.dataBuffer);
    expect(pixels[0]).toBe(41);
    expect(pixels[pixels.length - 1]).toBe(213);
    expect((worker.transfers[0]![0] as ArrayBuffer).byteLength).toBe(0);
    expect(color.data.buffer).toBe(original);
    expect(color.data.byteLength).toBe(67_108_864);
    expect(color.data[0]).toBe(41);
    worker.emit(resultFor(request));
    await expect(pending).resolves.toBeInstanceOf(Blob);
    expect(worker.terminateCalls).toBe(1);
  });

  it("rejects a second layer, invalid roles and dimensions before copying or allocating a worker", async () => {
    const workerFactory = vi.fn(() => new FakeWorker());
    const first = layer();
    const candidates: readonly StudioBg3dLtRasterLayer[][] = [
      [first, layer("main-line")],
      [],
      ...[0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 4_097].map((width) => [{ ...first, width }]),
      [{ ...first, height: 4_097 }],
      [{ ...first, role: "constructor" as StudioBg3dLtRasterLayer["role"] }],
    ];
    for (const layers of candidates) {
      await expect(encodeStudioVrmPngInWorker(layers, { workerFactory })).rejects.toMatchObject({ code: "invalid-request" });
    }
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it("bounds encoded output without allocating a maximum-size PNG in the test", () => {
    class SizedPng extends Blob {
      constructor(private readonly reportedSize: number) { super([], { type: "image/png" }); }
      override get size() { return this.reportedSize; }
    }
    const result = { version: 1, kind: "result", requestId: 1, width: 4_096, height: 4_096 };
    expect(STUDIO_VRM_PNG_MAX_PIXELS).toBe(16_777_216);
    expect(STUDIO_VRM_PNG_MAX_OUTPUT_BYTES).toBe(68_157_440);
    expect(isStudioVrmPngWorkerResponse({ ...result, png: new SizedPng(STUDIO_VRM_PNG_MAX_OUTPUT_BYTES) })).toBe(true);
    expect(isStudioVrmPngWorkerResponse({ ...result, png: new SizedPng(STUDIO_VRM_PNG_MAX_OUTPUT_BYTES + 1) })).toBe(false);
  });
  it("waits for capability readiness, transfers snapshots, and preserves caller-owned pixels", async () => {
    const color = layer("color", 2, 1, 30);
    const originalColorBuffer = color.data.buffer;
    const expectedColor = color.data.slice();
    const worker = new FakeWorker();
    const pending = encodeStudioVrmPngInWorker([color], {
      workerFactory: () => worker,
    });

    expect(worker.requests).toHaveLength(0);
    color.data.fill(0);
    emitReady(worker);
    const request = worker.requests[0];
    if (!request) throw new Error("missing request");

    expect(isStudioVrmPngWorkerRequest(request)).toBe(true);
    expect(worker.transfers[0]).toEqual(request.layers.map((entry) => entry.dataBuffer));
    expect(request.layers[0]?.dataBuffer).not.toBe(originalColorBuffer);
    expect(new Uint8ClampedArray(request.layers[0]!.dataBuffer)).toEqual(expectedColor);
    expect(color.data.buffer).toBe(originalColorBuffer);

    const encoded = png(2, 1);
    worker.emit(resultFor(request, encoded));
    await expect(pending).resolves.toBe(encoded);
    expect(worker.terminateCalls).toBe(1);
    expect(worker.messages.size).toBe(0);
    expect(worker.errors.size).toBe(0);
    expect(worker.messageErrors.size).toBe(0);
  });

  it("rejects malformed and unowned inputs before allocating a Worker", async () => {
    const workerFactory = vi.fn(() => new FakeWorker());
    await expect(encodeStudioVrmPngInWorker([{
      ...layer(),
      data: new Uint8ClampedArray(7),
    }], { workerFactory })).rejects.toMatchObject({ code: "invalid-request" });
    await expect(encodeStudioVrmPngInWorker([{
      ...layer(),
      extra: true,
    } as StudioBg3dLtRasterLayer], { workerFactory })).rejects.toMatchObject({ code: "invalid-request" });
    await expect(encodeStudioVrmPngInWorker([
      layer("color"), layer("main-line"), layer("texture-line"), layer("tone"),
    ], { workerFactory })).rejects.toMatchObject({ code: "invalid-request" });

    if (typeof SharedArrayBuffer === "function") {
      await expect(encodeStudioVrmPngInWorker([{
        role: "color",
        width: 1,
        height: 1,
        data: new Uint8ClampedArray(new SharedArrayBuffer(4)),
      }], { workerFactory })).rejects.toMatchObject({ code: "invalid-request" });
    }
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it("enforces exact versioned request and response shapes", () => {
    const request = {
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "encode",
      requestId: 1,
      width: 1,
      height: 1,
      layers: [{ role: "color", width: 1, height: 1, dataBuffer: new ArrayBuffer(4) }],
    };
    expect(isStudioVrmPngWorkerRequest(request)).toBe(true);
    expect(isStudioVrmPngWorkerRequest({ ...request, version: 2 })).toBe(false);
    expect(isStudioVrmPngWorkerRequest({ ...request, extra: true })).toBe(false);
    expect(isStudioVrmPngWorkerRequest({
      ...request,
      layers: [{ ...request.layers[0], dataBuffer: new ArrayBuffer(3) }],
    })).toBe(false);
    expect(isStudioVrmPngWorkerRequest({
      ...request,
      layers: [
        { role: "main-line", width: 1, height: 1, dataBuffer: new ArrayBuffer(4) },
        { role: "color", width: 1, height: 1, dataBuffer: new ArrayBuffer(4) },
      ],
    })).toBe(false);
    expect(isStudioVrmPngWorkerResponse({
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "ready",
    })).toBe(true);
    expect(isStudioVrmPngWorkerResponse({
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "unavailable",
      code: "offscreen-canvas",
    })).toBe(true);
    expect(isStudioVrmPngWorkerResponse({
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 1,
      width: 1,
      height: 1,
      png: png(1, 1),
      extra: true,
    })).toBe(false);
  });

  it("reports Worker construction and OffscreenCanvas capability failures without substitution", async () => {
    const construction = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => { throw new Error("CSP"); },
    });
    const constructionError = await construction.catch((error: unknown) => error);
    expect(constructionError).toMatchObject({ code: "worker-unavailable" });

    const unsupportedWorker = new FakeWorker();
    const unsupported = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => unsupportedWorker,
    });
    unsupportedWorker.emit({
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "unavailable",
      code: "offscreen-canvas",
    });
    const unsupportedError = await unsupported.catch((error: unknown) => error);
    expect(unsupportedError).toMatchObject({ code: "offscreen-unavailable" });
    expect(unsupportedWorker.terminateCalls).toBe(1);

    const preReadyWorker = new FakeWorker();
    const preReady = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => preReadyWorker,
    });
    preReadyWorker.emitError();
    const preReadyError = await preReady.catch((error: unknown) => error);
    expect(preReadyError).toMatchObject({ code: "worker-failed" });
  });

  it("keeps post-ready protocol, encode, runtime, and transfer failures terminal", async () => {
    const malformedWorker = new FakeWorker();
    const malformed = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => malformedWorker,
    });
    emitReady(malformedWorker);
    malformedWorker.emit({ kind: "result" });
    await expect(malformed).rejects.toMatchObject({ code: "protocol" });

    const encodeWorker = new FakeWorker();
    const encodeFailure = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => encodeWorker,
    });
    emitReady(encodeWorker);
    encodeWorker.emit({
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "error",
      requestId: encodeWorker.requests[0]?.requestId,
      code: "encode-failed",
    });
    await expect(encodeFailure).rejects.toMatchObject({ code: "encode-failed" });

    const runtimeWorker = new FakeWorker();
    const runtimeFailure = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => runtimeWorker,
    });
    emitReady(runtimeWorker);
    runtimeWorker.emitError("messageerror");
    await expect(runtimeFailure).rejects.toMatchObject({ code: "worker-failed" });

    const transferWorker = new FakeWorker();
    transferWorker.throwOnPost = true;
    const transferFailure = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => transferWorker,
    });
    emitReady(transferWorker);
    await expect(transferFailure).rejects.toMatchObject({ code: "worker-failed" });

  });

  it("rejects forged PNG headers and dimensions after terminating the Worker", async () => {
    const worker = new FakeWorker();
    const pending = encodeStudioVrmPngInWorker([layer("color", 2, 1)], {
      workerFactory: () => worker,
    });
    emitReady(worker);
    const request = worker.requests[0];
    if (!request) throw new Error("missing request");
    worker.emit(resultFor(request, png(1, 1)));

    await expect(pending).rejects.toMatchObject({ code: "protocol" });
    expect(worker.terminateCalls).toBe(1);
  });

  it("rejects a PNG MIME label with a forged signature", async () => {
    const worker = new FakeWorker();
    const pending = encodeStudioVrmPngInWorker([layer()], { workerFactory: () => worker });
    emitReady(worker);
    worker.emit(resultFor(worker.requests[0]!, new Blob([new Uint8Array(33)], { type: "image/png" })));
    await expect(pending).rejects.toMatchObject({ code: "protocol" });
    expect(worker.terminateCalls).toBe(1);
  });

  it("cancels while PNG header verification is pending, after the worker has already terminated", async () => {
    let release!: (value: ArrayBuffer) => void;
    const bytes = new Promise<ArrayBuffer>((resolve) => { release = resolve; });
    const encoded = png(2, 1);
    vi.spyOn(encoded, "slice").mockReturnValue({ arrayBuffer: () => bytes } as Blob);
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = encodeStudioVrmPngInWorker([layer()], { workerFactory: () => worker, signal: controller.signal });
    emitReady(worker);
    worker.emit(resultFor(worker.requests[0]!, encoded));
    expect(worker.terminateCalls).toBe(1);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    release(await png(2, 1).arrayBuffer());
    await Promise.resolve();
    expect(worker.terminateCalls).toBe(1);
    expect(worker.messages.size).toBe(0);
  });

  it("terminates on cancellation and treats startup and encode timeouts as terminal", async () => {
    const controller = new AbortController();
    const abortedWorker = new FakeWorker();
    const aborted = encodeStudioVrmPngInWorker([layer()], {
      signal: controller.signal,
      workerFactory: () => abortedWorker,
    });
    controller.abort();
    const abortError = await aborted.catch((error: unknown) => error);
    expect(abortError).toMatchObject({ code: "aborted", name: "AbortError" });
    expect(abortedWorker.terminateCalls).toBe(1);

    vi.useFakeTimers();
    const startupWorker = new FakeWorker();
    const startup = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => startupWorker,
      startupTimeoutMs: 100,
    });
    const startupOutcome = startup.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    const startupError = await startupOutcome;
    expect(startupError).toMatchObject({ code: "timeout", name: "TimeoutError" });

    const encodeWorker = new FakeWorker();
    const timed = encodeStudioVrmPngInWorker([layer()], {
      workerFactory: () => encodeWorker,
      timeoutMs: 100,
    });
    emitReady(encodeWorker);
    const timedOutcome = timed.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    const timedError = await timedOutcome;
    expect(timedError).toMatchObject({ code: "timeout", name: "TimeoutError" });
    expect(encodeWorker.terminateCalls).toBe(1);
  });

  it("does not allocate a Worker for an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const workerFactory = vi.fn(() => new FakeWorker());
    await expect(encodeStudioVrmPngInWorker([layer()], {
      signal: controller.signal,
      workerFactory,
    })).rejects.toEqual(new StudioVrmPngWorkerError("aborted"));
    expect(workerFactory).not.toHaveBeenCalled();
  });
});
