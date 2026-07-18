import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  type StudioBg3dGlbValidationOptions,
} from "./studio-bg3d-glb-validation";
import {
  StudioBg3dValidationWorkerClient,
  StudioBg3dValidationWorkerPool,
  disposeSharedStudioBg3dValidationWorker,
  validateStudioBg3dGlbOffMainThread,
  type StudioBg3dValidationWorkerLike,
} from "./studio-bg3d-glb-validation-worker-client";
import {
  STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
  type StudioBg3dGlbWorkerRequest,
} from "./studio-bg3d-glb-validation-worker-protocol";

const OPTIONS: StudioBg3dGlbValidationOptions = {
  declared: {
    byteSize: 4,
    sha256: "0".repeat(64),
    mimeType: "model/gltf-binary",
  },
  cumulative: { usedBytes: 0, maximumBytes: 1024 },
  profile: "desktop",
  budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
};

class FakeWorker implements StudioBg3dValidationWorkerLike {
  readonly messages: { message: StudioBg3dGlbWorkerRequest; transfer?: Transferable[] }[] = [];
  readonly messageListeners = new Set<(event: { readonly data: unknown }) => void>();
  readonly errorListeners = new Set<(event: { preventDefault?(): void }) => void>();
  readonly messageErrorListeners = new Set<(event: { preventDefault?(): void }) => void>();
  terminated = false;

  postMessage(message: StudioBg3dGlbWorkerRequest, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer });
  }

  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: { readonly data: unknown }) => void) | ((event: { preventDefault?(): void }) => void),
  ): void {
    if (type === "message") this.messageListeners.add(listener as (event: { readonly data: unknown }) => void);
    if (type === "error") this.errorListeners.add(listener as (event: { preventDefault?(): void }) => void);
    if (type === "messageerror") this.messageErrorListeners.add(listener as (event: { preventDefault?(): void }) => void);
  }

  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: { readonly data: unknown }) => void) | ((event: { preventDefault?(): void }) => void),
  ): void {
    if (type === "message") this.messageListeners.delete(listener as (event: { readonly data: unknown }) => void);
    if (type === "error") this.errorListeners.delete(listener as (event: { preventDefault?(): void }) => void);
    if (type === "messageerror") this.messageErrorListeners.delete(listener as (event: { preventDefault?(): void }) => void);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(data: unknown): void {
    for (const listener of this.messageListeners) listener({ data });
  }

  emitError(): void {
    for (const listener of this.errorListeners) listener({ preventDefault: vi.fn() });
  }
}

afterEach(() => {
  disposeSharedStudioBg3dValidationWorker();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StudioBg3dValidationWorkerClient", () => {
  it("transfers an owned byte snapshot and resolves a correlated validation result", async () => {
    const worker = new FakeWorker();
    const client = new StudioBg3dValidationWorkerClient({ workerFactory: () => worker });
    const source = new Uint8Array([1, 2, 3, 4]);
    const pending = client.validate(source, OPTIONS);
    const request = worker.messages[0];

    expect(request.message).toMatchObject({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "validate",
      requestId: 1,
    });
    expect(request.transfer).toEqual([
      (request.message as Extract<StudioBg3dGlbWorkerRequest, { readonly kind: "validate" }>).bytes,
    ]);
    expect(
      new Uint8Array(
        (request.message as Extract<StudioBg3dGlbWorkerRequest, { readonly kind: "validate" }>).bytes,
      ),
    ).toEqual(source);

    worker.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 1,
      result: { ok: false, code: "invalid-magic", message: "sanitized" },
    });

    await expect(pending).resolves.toEqual({
      execution: "worker",
      result: { ok: false, code: "invalid-magic", message: "sanitized" },
    });
    expect(source).toEqual(new Uint8Array([1, 2, 3, 4]));
    client.dispose();
  });

  it("cancels only the aborted request and ignores a late worker response", async () => {
    const worker = new FakeWorker();
    const client = new StudioBg3dValidationWorkerClient({ workerFactory: () => worker });
    const controller = new AbortController();
    const pending = client.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: "aborted",
    });
    expect(worker.messages.map(({ message }) => message.kind)).toEqual(["validate", "cancel"]);

    worker.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 1,
      result: { ok: false, code: "invalid-input", message: "late" },
    });
    client.dispose();
  });

  it("closes the abort race before posting validation bytes", async () => {
    const worker = new FakeWorker();
    const client = new StudioBg3dValidationWorkerClient({ workerFactory: () => worker });
    let abortedReads = 0;
    const signal = {
      get aborted() {
        abortedReads += 1;
        return abortedReads > 1;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;

    await expect(client.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS, signal)).rejects.toMatchObject({
      code: "aborted",
    });
    expect(worker.messages).toEqual([]);
    client.dispose();
  });

  it("rejects all pending work on a worker failure and disposal is idempotent", async () => {
    const workers: FakeWorker[] = [];
    const client = new StudioBg3dValidationWorkerClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    const first = client.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS);
    const second = client.validate(new Uint8Array([5, 6, 7, 8]), OPTIONS);
    workers[0]?.emitError();

    await expect(first).rejects.toMatchObject({
      code: "worker-failed",
    });
    await expect(second).rejects.toMatchObject({
      code: "worker-failed",
    });

    const recovered = client.validate(new Uint8Array([9, 10, 11, 12]), OPTIONS);
    expect(workers).toHaveLength(2);
    workers[1]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 3,
      result: { ok: false, code: "invalid-magic", message: "recovered" },
    });
    await expect(recovered).resolves.toMatchObject({ execution: "worker" });

    client.dispose();
    client.dispose();
    expect(workers.every((worker) => worker.terminated)).toBe(true);
    await expect(client.validate(new Uint8Array(), OPTIONS)).rejects.toMatchObject({ code: "disposed" });
  });

  it("fails closed when a worker sends an invalid protocol payload", async () => {
    const worker = new FakeWorker();
    const client = new StudioBg3dValidationWorkerClient({ workerFactory: () => worker });
    const pending = client.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS);
    worker.emitMessage({ requestId: 1, kind: "result" });

    await expect(pending).rejects.toMatchObject({
      code: "protocol",
    });
    client.dispose();
  });

  it("terminates a timed-out worker, rejects its peers, and creates a clean worker for new work", async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const client = new StudioBg3dValidationWorkerClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      timeoutMs: 1_000,
    });
    const timedOut = client.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS);
    const peer = client.validate(new Uint8Array([5, 6, 7, 8]), OPTIONS);
    const timedOutResult = timedOut.catch((error: unknown) => error);
    const peerResult = peer.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(await timedOutResult).toMatchObject({ code: "timeout" });
    expect(await peerResult).toMatchObject({ code: "worker-failed" });
    expect(workers[0]?.terminated).toBe(true);

    const recovered = client.validate(new Uint8Array([9, 10, 11, 12]), OPTIONS);
    expect(workers).toHaveLength(2);
    workers[1]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 3,
      result: { ok: false, code: "invalid-magic", message: "recovered" },
    });
    await expect(recovered).resolves.toMatchObject({ execution: "worker" });
    client.dispose();
  });

  it("creates a fresh worker after a protocol failure", async () => {
    const workers: FakeWorker[] = [];
    const client = new StudioBg3dValidationWorkerClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    const failed = client.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS);
    workers[0]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 1,
      result: { ok: false, code: "not-a-validator-code", message: "corrupt" },
    });
    await expect(failed).rejects.toMatchObject({ code: "protocol" });
    expect(workers[0]?.terminated).toBe(true);

    const recovered = client.validate(new Uint8Array([5, 6, 7, 8]), OPTIONS);
    expect(workers).toHaveLength(2);
    workers[1]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 2,
      result: { ok: false, code: "invalid-magic", message: "recovered" },
    });
    await expect(recovered).resolves.toMatchObject({ execution: "worker" });
    client.dispose();
  });

  it("honors AbortSignal while the main-thread digest fallback is in flight", async () => {
    const controller = new AbortController();
    let releaseDigest: ((value: Uint8Array) => void) | undefined;
    const digest = vi.fn(() => new Promise<Uint8Array>((resolve) => {
      releaseDigest = resolve;
    }));
    const pending = validateStudioBg3dGlbOffMainThread(
      new Uint8Array([1, 2, 3, 4]),
      { ...OPTIONS, digest },
      controller.signal,
    );
    await vi.waitFor(() => expect(digest).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    releaseDigest?.(new Uint8Array(32));
  });

  it("recreates the shared browser worker after a protocol failure", async () => {
    const workers: FakeWorker[] = [];
    class BrowserWorkerFake extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    }
    vi.stubGlobal("Worker", BrowserWorkerFake);

    const failed = validateStudioBg3dGlbOffMainThread(new Uint8Array([1, 2, 3, 4]), OPTIONS);
    expect(workers).toHaveLength(1);
    workers[0]?.emitMessage({ requestId: 1, kind: "result" });
    await expect(failed).rejects.toMatchObject({ code: "protocol" });

    const recovered = validateStudioBg3dGlbOffMainThread(new Uint8Array([5, 6, 7, 8]), OPTIONS);
    expect(workers).toHaveLength(2);
    workers[1]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 1,
      result: { ok: false, code: "invalid-magic", message: "recovered" },
    });
    await expect(recovered).resolves.toMatchObject({ execution: "worker" });
  });
});

describe("StudioBg3dValidationWorkerPool", () => {
  it("starts one worker lazily, expands only under contention, and reuses the idle slot", async () => {
    const workers: FakeWorker[] = [];
    const pool = new StudioBg3dValidationWorkerPool({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      maximumWorkers: 2,
    });

    expect(workers).toHaveLength(0);
    const first = pool.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS);
    expect(workers).toHaveLength(1);
    const second = pool.validate(new Uint8Array([5, 6, 7, 8]), OPTIONS);
    expect(workers).toHaveLength(2);
    workers[1]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 1,
      result: { ok: false, code: "invalid-magic", message: "second" },
    });
    await expect(second).resolves.toMatchObject({ execution: "worker" });

    const third = pool.validate(new Uint8Array([9, 10, 11, 12]), OPTIONS);
    expect(workers).toHaveLength(2);
    expect(workers[1]?.messages).toHaveLength(2);
    workers[1]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 2,
      result: { ok: false, code: "invalid-magic", message: "third" },
    });
    await expect(third).resolves.toMatchObject({ execution: "worker" });
    workers[0]?.emitMessage({
      version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: 1,
      result: { ok: false, code: "invalid-magic", message: "first" },
    });
    await expect(first).resolves.toMatchObject({ execution: "worker" });

    pool.dispose();
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });

  it("caps invalid maximums to one worker", () => {
    const workers: FakeWorker[] = [];
    const pool = new StudioBg3dValidationWorkerPool({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      maximumWorkers: Number.POSITIVE_INFINITY,
    });
    void pool.validate(new Uint8Array([1, 2, 3, 4]), OPTIONS).catch(() => undefined);
    void pool.validate(new Uint8Array([5, 6, 7, 8]), OPTIONS).catch(() => undefined);
    expect(workers).toHaveLength(1);
    pool.dispose();
  });
});
