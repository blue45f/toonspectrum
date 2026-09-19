import { afterEach, describe, expect, it, vi } from "vitest";
import { runScene3dSpecialistInWorker } from "./specialist-client";
import { SPECIALIST_LIMITS } from "./specialist-contract";

class FakeWorker {
  static latest: FakeWorker;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    FakeWorker.latest = this;
  }
}
const request = () => ({
  version: 1 as const,
  id: 1,
  source: new ArrayBuffer(20),
  options: { kind: "compress" as const },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("specialist worker lifetime", () => {
  it("copies source buffers and terminates after success", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const input = request();
    const pending = runScene3dSpecialistInWorker(input);
    const worker = FakeWorker.latest;
    const sent = worker.postMessage.mock.calls[0]![0];
    expect(sent.source).not.toBe(input.source);
    expect(input.source.byteLength).toBe(20);
    const result = {
      version: 1,
      sourceSha256: "sha256:" + "a".repeat(64),
      operation: "compress",
      before: {
        triangles: 1,
        vertices: 3,
        nodes: 1,
        animations: 0,
        animationKeys: 0,
        tangentPrimitives: 0,
      },
      artifacts: [
        {
          name: "compress.glb",
          mime: "model/gltf-binary",
          bytes: new Uint8Array(20),
          sha256: "sha256:" + "b".repeat(64),
        },
      ],
      warnings: [],
      provenance: {},
    };
    worker.onmessage?.({ data: { ok: true, id: 1, result } } as MessageEvent);
    await expect(pending).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("terminates synchronous WASM work on cancellation and ignores late results", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const controller = new AbortController();
    const pending = runScene3dSpecialistInWorker(request(), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      code: "cancelled",
    });
    controller.abort();
    await rejected;
    FakeWorker.latest.onmessage?.({
      data: { ok: true, result: { version: 1 } },
    } as MessageEvent);
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
  it("rejects an already cancelled job without starting a worker", async () => {
    const ctor = vi.fn();
    vi.stubGlobal("Worker", ctor);
    const controller = new AbortController();
    controller.abort();
    await expect(
      runScene3dSpecialistInWorker(request(), controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(ctor).not.toHaveBeenCalled();
  });
  it("terminates a stalled worker instead of blocking the editor indefinitely", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const pending = runScene3dSpecialistInWorker(request());
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(SPECIALIST_LIMITS.timeoutMs);
    await rejected;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
  it.each(["onerror", "onmessageerror"] as const)(
    "cleans up after %s",
    async (event) => {
      vi.stubGlobal("Worker", FakeWorker);
      const pending = runScene3dSpecialistInWorker(request());
      const rejected = expect(pending).rejects.toMatchObject({
        code: "runtime",
      });
      FakeWorker.latest[event]?.();
      await rejected;
      expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
    },
  );
});

it.each([0, 99, 1])(
  "rejects mismatched identity or malformed result (id=%d)",
  async (id) => {
    vi.stubGlobal("Worker", FakeWorker);
    const pending = runScene3dSpecialistInWorker(request());
    const rejected = expect(pending).rejects.toMatchObject({ code: "runtime" });
    FakeWorker.latest.onmessage?.({
      data: { id, ok: true, result: { version: 1 } },
    } as MessageEvent);
    await rejected;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  },
);
