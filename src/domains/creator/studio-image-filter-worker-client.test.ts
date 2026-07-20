import { describe, expect, it, vi } from "vitest";

import {
  runStudioImageFilterWorker,
  type StudioImageFilterWorkerLike,
} from "./studio-image-filter-worker-client";
import {
  studioImageFilterSuccessTransfers,
  type StudioImageFilterWorkerResponseMessage,
  type StudioImageFilterWorkerRunMessage,
  type StudioImageFilterWorkerRunRequest,
  type StudioImageFilterWorkerSuccessMessage,
} from "./studio-image-filter-worker-protocol";
import { applyImageFilters, buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "./studio-konva-filters";

import type { ImageFilterFields } from "./studio-konva-filter-fields";

function makeImageData(width: number, height: number): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 40;
    data[i + 1] = 80;
    data[i + 2] = 120;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function requestFixture(el: ImageFilterFields = { brightness: 0.3, contrast: 20 }): StudioImageFilterWorkerRunRequest {
  return { imageData: makeImageData(3, 2), el };
}

const testRegistry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(testRegistry);

function expectedPixels(el: ImageFilterFields): Uint8ClampedArray {
  const image = makeImageData(3, 2);
  const { filters, attrs } = buildImageFilters(el, testRegistry);
  applyImageFilters(image, filters, attrs);
  return image.data;
}

class ApplyingWorker implements StudioImageFilterWorkerLike {
  onmessage: StudioImageFilterWorkerLike["onmessage"] = null;
  onerror: StudioImageFilterWorkerLike["onerror"] = null;
  terminateCount = 0;
  requestTransferCount = 0;

  constructor() {
    queueMicrotask(() => {
      this.onmessage?.({
        data: { type: "studio-image-filter/ready", version: 1 },
      } as MessageEvent<StudioImageFilterWorkerResponseMessage>);
    });
  }

  postMessage(message: StudioImageFilterWorkerRunMessage, transfer: Transferable[]): void {
    this.requestTransferCount = transfer.length;
    const received = structuredClone(message, { transfer });
    queueMicrotask(() => {
      if (this.terminateCount > 0) return;
      const { filters, attrs } = buildImageFilters(received.request.el, testRegistry);
      applyImageFilters(received.request.imageData, filters, attrs);
      const response: StudioImageFilterWorkerSuccessMessage = {
        type: "studio-image-filter/success",
        version: received.version,
        imageData: received.request.imageData,
      };
      const returned = structuredClone(response, { transfer: studioImageFilterSuccessTransfers(response) });
      this.onmessage?.({ data: returned } as MessageEvent<StudioImageFilterWorkerResponseMessage>);
    });
  }

  terminate(): void {
    this.terminateCount++;
  }
}

class CapturingApplyingWorker extends ApplyingWorker {
  postedEl: ImageFilterFields | null = null;

  override postMessage(message: StudioImageFilterWorkerRunMessage, transfer: Transferable[]): void {
    this.postedEl = message.request.el;
    super.postMessage(message, transfer);
  }
}

class HangingWorker implements StudioImageFilterWorkerLike {
  onmessage: StudioImageFilterWorkerLike["onmessage"] = null;
  onerror: StudioImageFilterWorkerLike["onerror"] = null;
  terminateCount = 0;

  constructor(emitReady = true) {
    if (emitReady) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { type: "studio-image-filter/ready", version: 1 },
        } as MessageEvent<StudioImageFilterWorkerResponseMessage>);
      });
    }
  }

  postMessage(_message: StudioImageFilterWorkerRunMessage, _transfer: Transferable[]): void {}

  terminate(): void {
    this.terminateCount++;
  }
}

class ThrowingPostWorker extends HangingWorker {
  override postMessage(): void {
    throw new DOMException("blocked", "DataCloneError");
  }
}

class FailingWorker extends HangingWorker {
  override postMessage(): void {
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: "studio-image-filter/failure",
          version: 1,
          error: { name: "RangeError", message: "boom" },
        },
      } as MessageEvent<StudioImageFilterWorkerResponseMessage>);
    });
  }
}

class LoadErrorWorker extends HangingWorker {
  constructor() {
    super(false);
    queueMicrotask(() => {
      this.onerror?.({ message: "worker chunk failed to load" });
    });
  }
}

class ImmediateApplyingWorker extends HangingWorker {
  override postMessage(message: StudioImageFilterWorkerRunMessage, transfer: Transferable[]): void {
    const received = structuredClone(message, { transfer });
    const { filters, attrs } = buildImageFilters(received.request.el, testRegistry);
    applyImageFilters(received.request.imageData, filters, attrs);
    this.onmessage?.({
      data: {
        type: "studio-image-filter/success",
        version: 1,
        imageData: received.request.imageData,
      },
    } as MessageEvent<StudioImageFilterWorkerResponseMessage>);
  }
}

class InvalidSuccessWorker extends HangingWorker {
  override postMessage(): void {
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: "studio-image-filter/success",
          version: 1,
          imageData: { data: new Uint8ClampedArray(4), width: 2, height: 2 },
        },
      } as MessageEvent<StudioImageFilterWorkerResponseMessage>);
    });
  }
}

describe("runStudioImageFilterWorker", () => {
  it("falls back directly without a worker and matches buildImageFilters output", async () => {
    const request = requestFixture();
    const expected = expectedPixels(request.el);

    const output = await runStudioImageFilterWorker(request, { workerFactory: null });

    expect(output.execution).toBe("direct");
    expect(Array.from(output.imageData.data)).toEqual(Array.from(expected));
  });

  it("projects an element-shaped source before direct execution and reads each filter field once", async () => {
    const el = {} as ImageFilterFields;
    let brightnessReads = 0;
    const unrelatedGetter = vi.fn(() => {
      throw new Error("unrelated metadata must not be read");
    });
    Object.defineProperties(el, {
      brightness: {
        enumerable: true,
        get: () => {
          brightnessReads++;
          return 0.3;
        },
      },
      provenance: { enumerable: true, get: unrelatedGetter },
    });
    const request = requestFixture(el);
    const expected = expectedPixels({ brightness: 0.3 });

    const output = await runStudioImageFilterWorker(request, { workerFactory: null });

    expect(output.execution).toBe("direct");
    expect(brightnessReads).toBe(1);
    expect(unrelatedGetter).not.toHaveBeenCalled();
    expect(Array.from(output.imageData.data)).toEqual(Array.from(expected));
  });

  it("skips over Konva-native filters (Blur/HSL) too via the direct path", async () => {
    const el: ImageFilterFields = { blur: 4, saturation: 0.5, hue: 90 };
    const request = requestFixture(el);
    const expected = expectedPixels(el);

    const output = await runStudioImageFilterWorker(request, { workerFactory: null });

    expect(Array.from(output.imageData.data)).toEqual(Array.from(expected));
  });

  it("transfers imageData ownership and returns worker-computed pixels matching the direct path", async () => {
    const request = requestFixture({ screentone: true, chromatic: 3 });
    const expected = expectedPixels(request.el);
    const worker = new ApplyingWorker();

    const pending = runStudioImageFilterWorker(request, { workerFactory: () => worker });
    await Promise.resolve();
    expect(request.imageData.data.byteLength).toBe(0);

    const output = await pending;
    expect(output.execution).toBe("worker");
    expect(worker.requestTransferCount).toBe(1);
    expect(worker.terminateCount).toBe(1);
    expect(Array.from(output.imageData.data)).toEqual(Array.from(expected));
  });

  it("copies a partial ArrayBuffer view so unrelated caller bytes and sibling views are not detached", async () => {
    const backing = new ArrayBuffer(40);
    const pixels = new Uint8ClampedArray(backing, 8, 24);
    pixels.set(makeImageData(3, 2).data);
    const sibling = new Uint8Array(backing, 0, 4);
    sibling.set([9, 8, 7, 6]);
    const worker = new ApplyingWorker();

    const output = await runStudioImageFilterWorker(
      { imageData: { data: pixels, width: 3, height: 2 }, el: { brightness: 0.3 } },
      { workerFactory: () => worker },
    );

    expect(output.execution).toBe("worker");
    expect(backing.byteLength).toBe(40);
    expect(Array.from(sibling)).toEqual([9, 8, 7, 6]);
    expect(worker.requestTransferCount).toBe(1);
  });

  it("accepts a synchronous worker result without misclassifying it as a pre-ready race", async () => {
    const output = await runStudioImageFilterWorker(requestFixture(), {
      workerFactory: () => new ImmediateApplyingWorker(),
    });

    expect(output.execution).toBe("worker");
  });

  it("strips browser lifecycle helpers instead of falling back from DataCloneError", async () => {
    const request = requestFixture();
    Object.assign(request.imageData, { release() {} });
    const worker = new ApplyingWorker();

    const output = await runStudioImageFilterWorker(request, { workerFactory: () => worker });

    expect(output.execution).toBe("worker");
    expect(worker.requestTransferCount).toBe(1);
  });

  it("posts only ImageFilterFields when the caller passes a full Studio element", async () => {
    const unrelatedGetter = vi.fn(() => {
      throw new Error("unrelated metadata must not be cloned");
    });
    const el = {
      brightness: 0.3,
      contrast: 20,
      src: "blob:large-source",
      frames: [{ src: "blob:animation-frame" }],
      scene3d: { render() {} },
      vrm: { dispose() {} },
      provenance: new WeakMap<object, unknown>(),
    } as unknown as ImageFilterFields;
    Object.defineProperty(el, "runtimeGraph", {
      enumerable: true,
      get: unrelatedGetter,
    });
    const worker = new CapturingApplyingWorker();

    const output = await runStudioImageFilterWorker(requestFixture(el), {
      workerFactory: () => worker,
    });

    expect(output.execution).toBe("worker");
    expect(unrelatedGetter).not.toHaveBeenCalled();
    expect(Object.is(worker.postedEl, el)).toBe(false);
    for (const key of ["src", "frames", "scene3d", "vrm", "provenance", "runtimeGraph"]) {
      expect(worker.postedEl).not.toHaveProperty(key);
    }
    expect(worker.postedEl).toMatchObject({ brightness: 0.3, contrast: 20 });
  });

  it("falls back to direct execution when postMessage throws synchronously", async () => {
    const request = requestFixture();
    const expected = expectedPixels(request.el);
    const worker = new ThrowingPostWorker();

    const output = await runStudioImageFilterWorker(request, { workerFactory: () => worker });

    expect(output.execution).toBe("direct");
    expect(Array.from(output.imageData.data)).toEqual(Array.from(expected));
  });

  it("rejects with the worker's reported error", async () => {
    const request = requestFixture();
    const worker = new FailingWorker();

    await expect(
      runStudioImageFilterWorker(request, { workerFactory: () => worker }),
    ).rejects.toThrow("boom");
  });

  it("falls back to direct execution on a worker load error before any request is posted", async () => {
    const request = requestFixture();
    const expected = expectedPixels(request.el);
    const worker = new LoadErrorWorker();

    const output = await runStudioImageFilterWorker(request, { workerFactory: () => worker });

    expect(output.execution).toBe("direct");
    expect(Array.from(output.imageData.data)).toEqual(Array.from(expected));
  });

  it("falls back and terminates when a worker never announces readiness", async () => {
    vi.useFakeTimers();
    try {
      const request = requestFixture();
      const expected = expectedPixels(request.el);
      const worker = new HangingWorker(false);
      const pending = runStudioImageFilterWorker(request, { workerFactory: () => worker });

      await vi.advanceTimersByTimeAsync(3_000);

      const output = await pending;
      expect(output.execution).toBe("direct");
      expect(Array.from(output.imageData.data)).toEqual(Array.from(expected));
      expect(worker.terminateCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed dimensions and oversized requests before constructing a worker", async () => {
    const constructed = vi.fn(() => new HangingWorker());
    await expect(runStudioImageFilterWorker({
      imageData: { data: new Uint8ClampedArray(4), width: 2, height: 2 },
      el: {},
    }, { workerFactory: constructed })).rejects.toThrow(/버퍼 길이/);
    await expect(runStudioImageFilterWorker({
      imageData: { data: new Uint8ClampedArray(4), width: 8193, height: 8193 },
      el: {},
    }, { workerFactory: constructed })).rejects.toThrow(/안전 한도/);
    expect(constructed).not.toHaveBeenCalled();
  });

  it("treats non-finite scalar filter values as no-ops instead of blackening pixels", async () => {
    const request = requestFixture({ brightness: Number.NaN, contrast: Number.POSITIVE_INFINITY });
    const original = Array.from(request.imageData.data);

    const output = await runStudioImageFilterWorker(request, { workerFactory: null });

    expect(Array.from(output.imageData.data)).toEqual(original);
  });

  it("rejects an invalid success payload and terminates the worker", async () => {
    const worker = new InvalidSuccessWorker();

    await expect(runStudioImageFilterWorker(requestFixture(), {
      workerFactory: () => worker,
    })).rejects.toThrow(/버퍼 길이/);
    expect(worker.terminateCount).toBe(1);
  });

  it("terminates an in-flight worker and rejects with AbortError when the signal aborts", async () => {
    const worker = new HangingWorker();
    const controller = new AbortController();
    const request = requestFixture();

    const pending = runStudioImageFilterWorker(request, {
      workerFactory: () => worker,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toThrow(/취소/);
    expect(worker.terminateCount).toBe(1);
  });

  it("rejects immediately for an already-aborted signal without constructing a worker", async () => {
    const controller = new AbortController();
    controller.abort();
    let constructed = false;

    await expect(
      runStudioImageFilterWorker(requestFixture(), {
        workerFactory: () => {
          constructed = true;
          return new HangingWorker();
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow(/취소/);
    expect(constructed).toBe(false);
  });
});
