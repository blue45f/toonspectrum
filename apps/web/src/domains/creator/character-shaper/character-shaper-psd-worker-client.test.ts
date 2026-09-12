import { initializeCanvas, readPsd } from "ag-psd";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCharacterSemanticPsd } from "./character-shaper-psd-assembly";
import { assembleCharacterPsdInWorker } from "./character-shaper-psd-worker-client";
import {
  CHARACTER_PSD_MAX_INPUT_BYTES, CHARACTER_PSD_MAX_OUTPUT_BYTES, CHARACTER_PSD_WORKER_VERSION,
  isCharacterPsdWorkerRequest, isCharacterPsdWorkerResponse, validateCharacterPsdPasses,
} from "./character-shaper-psd-worker-protocol";

import type { CharacterSemanticPass } from "./character-shaper-contract";
import type { CharacterPsdWorkerLike } from "./character-shaper-psd-worker-client";
import type { CharacterPsdWorkerRequest } from "./character-shaper-psd-worker-protocol";

initializeCanvas(() => { throw new Error("No DOM canvas in PSD assembly"); }, (width, height) => ({
  width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb",
}));
interface Message { readonly data: unknown }
interface Failure { preventDefault?(): void }
class FakeWorker implements CharacterPsdWorkerLike {
  readonly messages = new Set<(event: Message) => void>();
  readonly errors = new Set<(event: Failure) => void>();
  readonly messageErrors = new Set<(event: Failure) => void>();
  readonly requests: CharacterPsdWorkerRequest[] = [];
  terminateCalls = 0;
  throwOnPost = false;
  postMessage(request: CharacterPsdWorkerRequest, transfer: Transferable[]) {
    if (this.throwOnPost) throw new Error("post failed");
    this.requests.push(structuredClone(request, { transfer }));
  }
  addEventListener(type: "message" | "error" | "messageerror", listener: ((event: Message) => void) | ((event: Failure) => void)) {
    if (type === "message") this.messages.add(listener as (event: Message) => void);
    else (type === "error" ? this.errors : this.messageErrors).add(listener as (event: Failure) => void);
  }
  removeEventListener(type: "message" | "error" | "messageerror", listener: ((event: Message) => void) | ((event: Failure) => void)) {
    if (type === "message") this.messages.delete(listener as (event: Message) => void);
    else (type === "error" ? this.errors : this.messageErrors).delete(listener as (event: Failure) => void);
  }
  terminate() { this.terminateCalls += 1; }
  emit(data: unknown) { for (const listener of this.messages) listener({ data }); }
  ready() { this.emit({ version: CHARACTER_PSD_WORKER_VERSION, kind: "ready" }); }
  result() {
    const request = this.requests[0]!;
    return { version: CHARACTER_PSD_WORKER_VERSION, kind: "result", requestId: request.requestId,
      ...buildCharacterSemanticPsd(request.passes, request.skipped, { title: request.title }) };
  }
}
function pass(id: CharacterSemanticPass["id"] = "beauty"): CharacterSemanticPass {
  return { id, width: 2, height: 1, rgba: new Uint8ClampedArray([80, 120, 160, 255, 200, 80, 40, 128]) };
}
function start(worker: FakeWorker, options = {}) {
  return assembleCharacterPsdInWorker([pass()], [], { title: "test", workerFactory: () => worker, ...options });
}
function clean(worker: FakeWorker) {
  expect(worker.terminateCalls).toBe(1);
  expect(worker.messages.size + worker.errors.size + worker.messageErrors.size).toBe(0);
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("character PSD worker contract", () => {
  it.each(["beauty", "flat", "line"] as const)("writes actual %s RGB and alpha into the PSD merged preview", async (id) => {
    // ag-psd underallocates composite RLE scratch storage for a 2×1 RGBA image
    // (18 bytes versus 20 required), truncating alpha. The export UI uses a 1024px+ long edge;
    // use 4×1 here to exercise opaque, translucent and transparent pixels independently
    // without conflating that separate upstream limitation of extreme 1–2px inputs.
    const source = { ...pass(id), width: 4, rgba: new Uint8ClampedArray([
      80, 120, 160, 255, 200, 80, 40, 128, 20, 40, 60, 255, 0, 0, 0, 0,
    ]) };
    const original = source.rgba.slice();
    // A different editable flat must not replace the captured appearance in file previews.
    const passes = id === "beauty"
      ? [source, { ...source, id: "flat" as const, rgba: new Uint8ClampedArray(16).fill(255) }]
      : [source];
    const worker = new FakeWorker();
    const pending = assembleCharacterPsdInWorker(passes, [], { title: "merged preview", workerFactory: () => worker });
    worker.ready();
    worker.emit(worker.result());
    const { blob } = await pending;
    const parsed = readPsd(await blob.arrayBuffer(), { useImageData: true, skipLayerImageData: true });
    const pixels = parsed.imageData?.data;
    expect(pixels).toHaveLength(original.length);
    for (let index = 0; index < original.length; index += 1) {
      // PSD composite alpha is white-matted on disk; ag-psd's unmatting can round RGB by 1.
      expect(Math.abs(pixels![index]! - original[index]!)).toBeLessThanOrEqual(index % 4 === 3 ? 0 : 1);
    }
    expect(source.rgba).toEqual(original);
    clean(worker);
  });

  it("round-trips actual PSD layer masks, blend modes and pixels without a DOM canvas or detaching caller buffers", async () => {
    const worker = new FakeWorker();
    const flat = pass("flat");
    const skin = pass("mask-skin");
    skin.rgba.set([255, 255, 255, 128, 255, 255, 255, 0]);
    const source = flat.rgba.buffer;
    const pending = assembleCharacterPsdInWorker([flat, skin, pass("shadow")], [], { title: "캐릭터 & test", workerFactory: () => worker });
    worker.ready();
    const request = worker.requests[0]!;
    expect(isCharacterPsdWorkerRequest(request)).toBe(true);
    expect(request.passes[0]!.rgba.buffer).not.toBe(source);
    expect(flat.rgba.buffer).toBe(source);
    expect(flat.rgba.byteLength).toBe(8);
    flat.rgba[0] = 7;
    expect(request.passes[0]!.rgba[0]).toBe(80);
    worker.emit(worker.result());
    const { blob, receipt } = await pending;
    const psd = readPsd(await blob.arrayBuffer(), { useImageData: true, skipCompositeImageData: true });
    expect([psd.width, psd.height]).toEqual([2, 1]);
    expect(psd.children?.find((layer) => layer.name === "음영")?.blendMode).toBe("multiply");
    const pixels = psd.children?.find((layer) => layer.name === "밑색")?.children?.[0]?.imageData?.data;
    expect(Array.from(pixels ?? [])).toEqual([80, 120, 160, 128, 200, 80, 40, 0]);
    expect(receipt.layerNames).toContain("피부");
    expect(psd.imageResources?.xmpMetadata).toContain("캐릭터 &amp; test");
    clean(worker);
  });

  it("consumes explicitly owned buffers only when the ready Worker receives the transfer", async () => {
    const worker = new FakeWorker();
    const source = pass();
    const pending = assembleCharacterPsdInWorker([source], [], { title: "owned", ownership: "transfer", workerFactory: () => worker });
    expect(source.rgba.byteLength).toBe(8);
    worker.ready();
    expect(source.rgba.byteLength).toBe(0);
    expect(worker.requests[0]!.passes[0]!.rgba[0]).toBe(80);
    worker.emit(worker.result());
    await pending;
    clean(worker);
  });

  it("admits a real 2K pass and preserves the 14-pass, 224MiB input budget", () => {
    const rgba = new Uint8ClampedArray(2048 * 2048 * 4);
    expect(() => validateCharacterPsdPasses([{ id: "beauty", width: 2048, height: 2048, rgba }], [], "2K")).not.toThrow();
    expect(CHARACTER_PSD_MAX_INPUT_BYTES).toBe(234_881_024);
    expect(CHARACTER_PSD_MAX_OUTPUT_BYTES).toBe(268_435_456);
  });

  it("rejects malformed dimensions, duplicate IDs, extra fields, oversized titles, detached and shared storage before worker creation", async () => {
    const factory = vi.fn(() => new FakeWorker());
    const detached = pass();
    structuredClone(detached.rgba.buffer, { transfer: [detached.rgba.buffer] });
    const candidates = [[], [pass(), pass()], Array.from({ length: 15 }, () => pass()),
      ...[0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2049].map((width) => [{ ...pass(), width }]),
      [{ ...pass(), id: "other" }], [{ ...pass(), extra: true }], [detached],
      [{ ...pass(), rgba: new Uint8Array(8) }], [{ ...pass(), rgba: new Uint8ClampedArray(new SharedArrayBuffer(8)) }],
    ];
    for (const value of candidates) {
      await expect(assembleCharacterPsdInWorker(value as readonly CharacterSemanticPass[], [], { title: "test", workerFactory: factory })).rejects.toMatchObject({ code: "invalid-request" });
    }
    await expect(assembleCharacterPsdInWorker([pass()], [], { title: "x".repeat(513), workerFactory: factory })).rejects.toMatchObject({ code: "invalid-request" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects aliased or subarray storage for explicit transfer while copying valid public subarrays", async () => {
    const source = new Uint8ClampedArray(16);
    const sliced = { ...pass(), rgba: source.subarray(4, 12) };
    const factory = vi.fn(() => new FakeWorker());
    await expect(assembleCharacterPsdInWorker([sliced], [], { title: "test", ownership: "transfer", workerFactory: factory })).rejects.toMatchObject({ code: "invalid-request" });
    const shared = pass();
    await expect(assembleCharacterPsdInWorker([shared, { ...shared, id: "flat" }], [], { title: "test", ownership: "transfer", workerFactory: factory })).rejects.toMatchObject({ code: "invalid-request" });
    expect(factory).not.toHaveBeenCalled();
    const worker = new FakeWorker();
    const pending = assembleCharacterPsdInWorker([sliced], [], { title: "test", workerFactory: () => worker });
    worker.ready();
    expect(worker.requests[0]!.passes[0]!.rgba.buffer.byteLength).toBe(8);
    worker.emit(worker.result());
    await pending;
    expect(source.byteLength).toBe(16);
  });

  it("rejects wire versions, arbitrary pass properties and oversized output without huge allocation", () => {
    const request = { version: CHARACTER_PSD_WORKER_VERSION, kind: "assemble", requestId: 1, title: "test", passes: [pass()], skipped: [] };
    expect(isCharacterPsdWorkerRequest(request)).toBe(true);
    expect(isCharacterPsdWorkerRequest({ ...request, version: 2 })).toBe(false);
    expect(isCharacterPsdWorkerRequest({ ...request, passes: [{ ...pass(), width: 1 }] })).toBe(false);
    expect(isCharacterPsdWorkerRequest({ ...request, skipped: [{ pass: "flat", reason: "" }] })).toBe(false);
    class Oversized extends Blob { override get size() { return CHARACTER_PSD_MAX_OUTPUT_BYTES + 1; } }
    const result = buildCharacterSemanticPsd([pass()], [], { title: "test" });
    expect(isCharacterPsdWorkerResponse({ version: 1, kind: "result", requestId: 1,
      ...result, blob: new Oversized([], { type: "image/vnd.adobe.photoshop" }) })).toBe(false);
  });
});

describe("character PSD worker lifecycle", () => {
  it("pre-abort does not construct a worker or consume owned storage", async () => {
    const controller = new AbortController(); controller.abort();
    const factory = vi.fn(); const source = pass();
    await expect(assembleCharacterPsdInWorker([source], [], { title: "test", signal: controller.signal, ownership: "transfer", workerFactory: factory })).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled(); expect(source.rgba.byteLength).toBe(8);
  });
  it.each([false, true])("abort terminates before/after ready (%s)", async (ready) => {
    const controller = new AbortController(); const worker = new FakeWorker();
    const pending = start(worker, { signal: controller.signal });
    if (ready) worker.ready();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); clean(worker);
    worker.emit({ version: 1, kind: "ready" }); expect(worker.requests).toHaveLength(ready ? 1 : 0);
  });
  it.each([false, true])("timeout terminates startup/assembly (%s)", async (ready) => {
    vi.useFakeTimers(); const worker = new FakeWorker();
    const pending = start(worker, { timeoutMs: 100, startupTimeoutMs: 100 });
    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    if (ready) worker.ready();
    await vi.advanceTimersByTimeAsync(101); await assertion; clean(worker);
  });
  it.each(["error", "messageerror", "post"] as const)("cleans up on %s", async (kind) => {
    const worker = new FakeWorker(); const pending = start(worker);
    if (kind === "post") { worker.throwOnPost = true; worker.ready(); }
    else for (const listener of kind === "error" ? worker.errors : worker.messageErrors) listener({ preventDefault: vi.fn() });
    await expect(pending).rejects.toMatchObject({ code: "worker-failed" }); clean(worker);
  });
  it.each(["not-ready", "wrong-id", "duplicate-ready", "receipt-size", "header", "header-dimension", "assembly-error"] as const)("rejects %s responses", async (kind) => {
    const worker = new FakeWorker(); const pending = start(worker);
    if (kind === "not-ready") worker.emit({ version: 1, kind: "error", requestId: 1, code: "assembly-failed" });
    else {
      worker.ready();
      const result = worker.result();
      if (kind === "wrong-id") worker.emit({ ...result, requestId: result.requestId + 1 });
      if (kind === "duplicate-ready") worker.ready();
      if (kind === "receipt-size") worker.emit({ ...result, receipt: { ...result.receipt, width: 1 } });
      if (kind === "assembly-error") worker.emit({ version: 1, kind: "error", requestId: result.requestId, code: "assembly-failed" });
      if (kind === "header" || kind === "header-dimension") {
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        if (kind === "header") bytes[0] = 0;
        else new DataView(bytes.buffer).setUint32(18, 1);
        worker.emit({ ...result, blob: new Blob([bytes], { type: result.blob.type }) });
      }
    }
    await expect(pending).rejects.toMatchObject({ code: kind === "assembly-error" ? "assembly-failed" : "protocol" }); clean(worker);
  });
  it("fails without Worker and never invokes a synchronous assembly fallback", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(assembleCharacterPsdInWorker([pass()], [], { title: "test" })).rejects.toMatchObject({ code: "worker-unavailable" });
  });
});
