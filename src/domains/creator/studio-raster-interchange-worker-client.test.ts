import { describe, expect, it, vi } from "vitest";

import { decodeStudioRasterInterchange, encodeStudioRasterInterchange } from "./studio-raster-interchange";
import {
  STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_BYTES,
  STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_PIXELS,
  decodeStudioRasterInterchangeAsync,
  encodeStudioRasterInterchangeAsync,
  type StudioRasterInterchangeWorkerLike,
} from "./studio-raster-interchange-worker-client";
import {
  STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
  type StudioRasterInterchangeWorkerRequest,
} from "./studio-raster-interchange-worker-protocol";

const bitmap = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([10, 20, 30, 255]),
};

function oversizedQoiHeader(): Uint8Array {
  const bytes = new Uint8Array(22);
  bytes.set([0x71, 0x6f, 0x69, 0x66]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 1_025);
  view.setUint32(8, 1_024);
  bytes[12] = 4;
  bytes[21] = 1;
  return bytes;
}

class FakeWorker implements StudioRasterInterchangeWorkerLike {
  onmessage: StudioRasterInterchangeWorkerLike["onmessage"] = null;
  onerror: StudioRasterInterchangeWorkerLike["onerror"] = null;
  terminate = vi.fn();

  constructor(private readonly respond = true) {}

  postMessage = vi.fn((request: StudioRasterInterchangeWorkerRequest) => {
    if (!this.respond) return;
    if (request.type === "studio-raster-interchange/encode") {
      const encoded = encodeStudioRasterInterchange(request.format, {
        width: request.width,
        height: request.height,
        data: request.data,
      });
      queueMicrotask(() => this.onmessage?.({ data: {
        type: "studio-raster-interchange/encode-success",
        version: STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
        requestId: request.requestId,
        result: encoded,
      } } as MessageEvent));
      return;
    }
    const decoded = decodeStudioRasterInterchange(request.bytes, request.expectedFormat);
    queueMicrotask(() => this.onmessage?.({ data: {
      type: "studio-raster-interchange/decode-success",
      version: STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
      requestId: request.requestId,
      result: decoded,
    } } as MessageEvent));
  });

  ready(): void {
    this.onmessage?.({ data: {
      type: "studio-raster-interchange/ready",
      version: STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
    } } as MessageEvent);
  }
}

describe("studio raster interchange worker client", () => {
  it("copies caller pixels, transfers them after ready and returns worker output", async () => {
    const worker = new FakeWorker();
    const promise = encodeStudioRasterInterchangeAsync("qoi", bitmap, { workerFactory: () => worker });
    worker.ready();
    const result = await promise;
    expect(result.execution).toBe("worker");
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    const request = worker.postMessage.mock.calls[0]?.[0];
    expect(request?.type).toBe("studio-raster-interchange/encode");
    if (request?.type !== "studio-raster-interchange/encode") throw new Error("encode request expected");
    expect(request.data).not.toBe(bitmap.data);
    expect([...bitmap.data]).toEqual([10, 20, 30, 255]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("decodes in the Worker without detaching a caller-owned subarray", async () => {
    const encoded = encodeStudioRasterInterchange("qoi", bitmap).bytes;
    const owner = new Uint8Array(encoded.byteLength + 4);
    owner.set(encoded, 2);
    const source = owner.subarray(2, 2 + encoded.byteLength);
    const before = [...owner];
    const worker = new FakeWorker();
    const promise = decodeStudioRasterInterchangeAsync(source, "qoi", { workerFactory: () => worker });
    worker.ready();

    const result = await promise;
    expect(result.execution).toBe("worker");
    expect([...result.decoded.bitmap.data]).toEqual([...bitmap.data]);
    const request = worker.postMessage.mock.calls[0]?.[0];
    expect(request?.type).toBe("studio-raster-interchange/decode");
    if (request?.type !== "studio-raster-interchange/decode") throw new Error("decode request expected");
    expect(request.bytes).not.toBe(source);
    expect(request.bytes.byteOffset).toBe(0);
    expect([...owner]).toEqual(before);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("uses the direct codecs for small work when Worker is unavailable", async () => {
    const encoded = await encodeStudioRasterInterchangeAsync("pam", bitmap, { workerFactory: null });
    expect(encoded.execution).toBe("direct");
    expect(encoded.encoded.extension).toBe(".pam");

    const decoded = await decodeStudioRasterInterchangeAsync(encoded.encoded.bytes, "pam", { workerFactory: null });
    expect(decoded.execution).toBe("direct");
    expect([...decoded.decoded.bitmap.data]).toEqual([...bitmap.data]);
  });

  it("fails closed instead of directly encoding over-budget RGBA", async () => {
    const width = 1_025;
    const height = 1_024;
    const large = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    expect(large.data.byteLength).toBeGreaterThan(STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_BYTES);
    expect(width * height).toBeGreaterThan(STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_PIXELS);

    await expect(encodeStudioRasterInterchangeAsync("qoi", large, { workerFactory: null })).rejects.toMatchObject({
      code: "WORKER_REQUIRED",
      message: expect.stringMatching(/Web Worker/u),
    });
  });

  it("fails closed before directly decoding over-budget input or pixel dimensions", async () => {
    await expect(decodeStudioRasterInterchangeAsync(
      new Uint8Array(STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_BYTES + 1),
      undefined,
      { workerFactory: null }
    )).rejects.toMatchObject({ code: "WORKER_REQUIRED" });

    await expect(decodeStudioRasterInterchangeAsync(
      oversizedQoiHeader(),
      "qoi",
      { workerFactory: null }
    )).rejects.toMatchObject({
      code: "WORKER_REQUIRED",
      message: expect.stringMatching(/1,048,576픽셀/u),
    });
  });

  it("aborts before allocating or posting work", async () => {
    const controller = new AbortController();
    controller.abort();
    const factory = vi.fn(() => new FakeWorker());
    await expect(encodeStudioRasterInterchangeAsync("qoi", bitmap, {
      signal: controller.signal,
      workerFactory: factory,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("aborts a pending decode and cleans up the Worker", async () => {
    const controller = new AbortController();
    const worker = new FakeWorker(false);
    const pending = decodeStudioRasterInterchangeAsync(new Uint8Array([1]), undefined, {
      signal: controller.signal,
      workerFactory: () => worker,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });

  it("falls back for small work if a Worker never becomes ready", async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker(false);
      const promise = encodeStudioRasterInterchangeAsync("tga", bitmap, {
        workerFactory: () => worker,
        readyTimeoutMs: 100,
      });
      await vi.advanceTimersByTimeAsync(100);
      expect((await promise).execution).toBe("direct");
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects over-budget fallback and a posted request timeout without sync work", async () => {
    vi.useFakeTimers();
    try {
      const unavailable = new FakeWorker(false);
      const unavailablePromise = decodeStudioRasterInterchangeAsync(oversizedQoiHeader(), "qoi", {
        workerFactory: () => unavailable,
        readyTimeoutMs: 100,
      });
      const unavailableAssertion = expect(unavailablePromise).rejects.toMatchObject({ code: "WORKER_REQUIRED" });
      await vi.advanceTimersByTimeAsync(100);
      await unavailableAssertion;

      const stalled = new FakeWorker(false);
      const stalledPromise = decodeStudioRasterInterchangeAsync(new Uint8Array([1]), undefined, {
        workerFactory: () => stalled,
        readyTimeoutMs: 100,
      });
      stalled.ready();
      const stalledAssertion = expect(stalledPromise).rejects.toThrow(/시간이 초과/u);
      await vi.advanceTimersByTimeAsync(100);
      await stalledAssertion;
      expect(stalled.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
