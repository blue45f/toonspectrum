import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runScene3dSpecialistInWorker } from "./specialist-client";
import { SpecialistJobQueue } from "./specialist-job-queue";
import { SpecialistRecipeReuseCache } from "./specialist-recipe-reuse";
import type { SpecialistRequest } from "./specialist-contract";
import type { SpecialistJobProgress } from "./specialist-job-progress";

class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((message: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    FakeWorker.all.push(this);
  }
  complete() {
    const request = this.postMessage.mock.calls[0]![0] as SpecialistRequest;
    const digest = (bytes: Uint8Array) =>
      "sha256:" + createHash("sha256").update(bytes).digest("hex");
    const bytes = new Uint8Array(8);
    bytes[0] = 14;
    this.onmessage?.({
      data: {
        ok: true,
        id: request.id,
        result: {
          version: 1,
          operation: request.options.kind,
          sourceSha256: digest(new Uint8Array(request.source)),
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
              name: "output.glb",
              mime: "model/gltf-binary",
              bytes,
              sha256: digest(bytes),
            },
          ],
          warnings: [],
          provenance: {},
        },
      },
    } as MessageEvent);
  }
}
function request(id: number): SpecialistRequest {
  return {
    version: 1,
    id,
    source: new ArrayBuffer(24),
    options: { kind: "compress" },
  };
}
function setup() {
  FakeWorker.all = [];
  vi.stubGlobal("Worker", FakeWorker);
  return {
    queue: new SpecialistJobQueue(),
    reuseCache: new SpecialistRecipeReuseCache(),
    reuse: "memory" as const,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("recipe reuse through the real queue/Worker client", () => {
  it("queues identical jobs but starts only one Worker and marks the second outcome as reused", async () => {
    const options = setup();
    const phases: SpecialistJobProgress[] = [];
    const first = runScene3dSpecialistInWorker(request(1), undefined, options);
    const second = runScene3dSpecialistInWorker(request(2), undefined, {
      ...options,
      onProgress: (phase) => phases.push(phase),
    });
    await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(1));
    FakeWorker.all[0]!.complete();
    const [one, two] = await Promise.all([first, second]);
    expect(FakeWorker.all).toHaveLength(1);
    expect(one.artifacts[0]!.bytes).toEqual(two.artifacts[0]!.bytes);
    expect(one.artifacts[0]!.bytes.buffer).not.toBe(
      two.artifacts[0]!.bytes.buffer,
    );
    expect(phases.map(({ phase }) => phase)).toEqual([
      "queued",
      "starting",
      "reuse-check",
      "reused",
    ]);
    expect(options.queue.snapshot()).toEqual({
      active: 0,
      queued: 0,
      snapshotBytes: 0,
    });
    expect(FakeWorker.all[0]!.terminate).toHaveBeenCalledOnce();
  });
  it("never reuses a failed operation and lets its next queued job execute normally", async () => {
    const options = setup();
    const first = runScene3dSpecialistInWorker(request(1), undefined, options);
    const second = runScene3dSpecialistInWorker(request(2), undefined, options);
    const rejected = expect(first).rejects.toMatchObject({ code: "runtime" });
    await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(1));
    FakeWorker.all[0]!.onerror?.();
    await rejected;
    await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(2));
    FakeWorker.all[1]!.complete();
    await second;
    expect(options.queue.snapshot().snapshotBytes).toBe(0);
    expect(options.reuseCache.snapshot().entries).toBe(1);
  });
  it("cancels waiting duplicate work without reading or applying a cached result", async () => {
    const options = setup();
    const abort = new AbortController();
    const first = runScene3dSpecialistInWorker(request(1), undefined, options);
    const phases: SpecialistJobProgress[] = [];
    const second = runScene3dSpecialistInWorker(request(2), abort.signal, {
      ...options,
      onProgress: (phase) => phases.push(phase),
    });
    const rejected = expect(second).rejects.toMatchObject({
      code: "cancelled",
    });
    abort.abort();
    await rejected;
    await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(1));
    FakeWorker.all[0]!.complete();
    await first;
    expect(phases.map(({ phase }) => phase)).toEqual(["queued", "cancelled"]);
    expect(options.reuseCache.snapshot().hits).toBe(0);
  });
  it("still supports explicit uncached execution after a memory result exists", async () => {
    const options = setup();
    const first = runScene3dSpecialistInWorker(request(1), undefined, options);
    await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(1));
    FakeWorker.all[0]!.complete();
    await first;
    const second = runScene3dSpecialistInWorker(request(2), undefined, {
      ...options,
      reuse: "none",
    });
    expect(FakeWorker.all).toHaveLength(2);
    FakeWorker.all[1]!.complete();
    await second;
    expect(options.reuseCache.snapshot().hits).toBe(0);
  });
});

it("freezes reuse policy at submission even when a queued caller later mutates its options object", async () => {
  const options = setup();
  const first = runScene3dSpecialistInWorker(request(1), undefined, options);
  const mutable = { ...options, reuse: "memory" as "memory" | "none" };
  const second = runScene3dSpecialistInWorker(request(2), undefined, mutable);
  mutable.reuse = "none";
  await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(1));
  FakeWorker.all[0]!.complete();
  await Promise.all([first, second]);
  expect(FakeWorker.all).toHaveLength(1);
  expect(options.reuseCache.snapshot().hits).toBe(1);
});
