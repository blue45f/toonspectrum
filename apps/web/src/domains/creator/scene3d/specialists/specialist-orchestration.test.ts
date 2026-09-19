import { afterEach, describe, expect, it, vi } from "vitest";
import { SpecialistJobQueue } from "./specialist-job-queue";
import { runScene3dSpecialistInWorker } from "./specialist-client";
import { SPECIALIST_LIMITS } from "./specialist-contract";
import type { SpecialistRequest } from "./specialist-contract";
import type { SpecialistJobProgress } from "./specialist-job-progress";

class WorkerFixture {
  static all: WorkerFixture[] = [];
  onmessage: ((message: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    WorkerFixture.all.push(this);
  }
  send(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}
function setup(maxSnapshotBytes = 200, maxJobs = 5, maxWaitMs = 1000) {
  WorkerFixture.all = [];
  vi.stubGlobal("Worker", WorkerFixture);
  return new SpecialistJobQueue({ maxJobs, maxSnapshotBytes, maxWaitMs });
}
function request(id = 1): SpecialistRequest {
  return {
    version: 1,
    id,
    source: new ArrayBuffer(20),
    options: { kind: "lod", error: 0.01 },
  };
}
function result(id = 1) {
  return {
    ok: true,
    id,
    result: {
      version: 1,
      sourceSha256: "sha256:" + "a".repeat(64),
      operation: "lod",
      before: {
        vertices: 3,
        triangles: 1,
        nodes: 1,
        animations: 0,
        animationKeys: 0,
        tangentPrimitives: 0,
      },
      artifacts: [
        {
          name: "lod.glb",
          mime: "model/gltf-binary",
          bytes: new Uint8Array(4),
          sha256: "sha256:" + "b".repeat(64),
        },
      ],
      warnings: [],
      provenance: {},
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bounded specialist orchestration", () => {
  it("starts only one Worker, snapshots queued input and parameters, then drains FIFO", async () => {
    const queue = setup();
    const progress: SpecialistJobProgress[] = [];
    const first = runScene3dSpecialistInWorker(request(1), undefined, {
      queue,
    });
    const source = request(2);
    new Uint8Array(source.source)[0] = 42;
    const second = runScene3dSpecialistInWorker(source, undefined, {
      queue,
      onProgress: (event) => progress.push(event),
    });
    expect(WorkerFixture.all).toHaveLength(1);
    expect(progress).toEqual([{ phase: "queued", queuePosition: 1 }]);
    new Uint8Array(source.source)[0] = 99;
    (source.options as { error: number }).error = 0.09;
    WorkerFixture.all[0]!.send(result(1));
    await first;
    expect(WorkerFixture.all[0]!.terminate).toHaveBeenCalledOnce();
    expect(WorkerFixture.all).toHaveLength(2);
    const sent = WorkerFixture.all[1]!.postMessage.mock.calls[0]![0];
    expect(new Uint8Array(sent.source)[0]).toBe(42);
    expect(sent.options.error).toBe(0.01);
    expect(progress).toContainEqual({ phase: "starting" });
    WorkerFixture.all[1]!.send(result(2));
    await second;
    expect(queue.snapshot()).toEqual({
      active: 0,
      queued: 0,
      snapshotBytes: 0,
    });
  });
  it("cancels a queued job without creating a worker and updates the remaining position", async () => {
    const queue = setup();
    const abort = new AbortController();
    const progress: SpecialistJobProgress[] = [];
    const first = runScene3dSpecialistInWorker(request(1), undefined, {
      queue,
    });
    const second = runScene3dSpecialistInWorker(request(2), abort.signal, {
      queue,
    });
    const third = runScene3dSpecialistInWorker(request(3), undefined, {
      queue,
      onProgress: (event) => progress.push(event),
    });
    expect(progress.at(-1)).toEqual({ phase: "queued", queuePosition: 2 });
    const rejected = expect(second).rejects.toMatchObject({
      code: "cancelled",
    });
    abort.abort();
    await rejected;
    expect(progress.at(-1)).toEqual({ phase: "queued", queuePosition: 1 });
    expect(WorkerFixture.all).toHaveLength(1);
    WorkerFixture.all[0]!.send(result(1));
    await first;
    WorkerFixture.all[1]!.send(result(3));
    await third;
    expect(queue.snapshot().snapshotBytes).toBe(0);
  });
  it("rejects over-capacity work before making another snapshot or worker", async () => {
    const queue = setup(39);
    const first = runScene3dSpecialistInWorker(request(), undefined, { queue });
    const input = request(2);
    const copy = vi.spyOn(input.source, "slice");
    await expect(
      runScene3dSpecialistInWorker(input, undefined, { queue }),
    ).rejects.toMatchObject({ code: "budget" });
    expect(copy).not.toHaveBeenCalled();
    expect(WorkerFixture.all).toHaveLength(1);
    WorkerFixture.all[0]!.send(result());
    await first;
  });
  it("caps retained job count independently of input byte size", async () => {
    const queue = setup(200, 1);
    const first = runScene3dSpecialistInWorker(request(), undefined, { queue });
    await expect(
      runScene3dSpecialistInWorker(request(2), undefined, { queue }),
    ).rejects.toMatchObject({ code: "budget" });
    WorkerFixture.all[0]!.send(result());
    await first;
  });
  it("expires waiting work without starting it or killing the active job", async () => {
    vi.useFakeTimers();
    const queue = setup();
    const first = runScene3dSpecialistInWorker(request(), undefined, { queue });
    const second = runScene3dSpecialistInWorker(request(2), undefined, {
      queue,
    });
    const rejected = expect(second).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(WorkerFixture.all).toHaveLength(1);
    expect(WorkerFixture.all[0]!.terminate).not.toHaveBeenCalled();
    WorkerFixture.all[0]!.send(result());
    await first;
    expect(queue.snapshot().snapshotBytes).toBe(0);
  });
  it("releases reservations when copying or constructing a Worker fails", async () => {
    const queue = setup();
    const input = request();
    vi.spyOn(input.source, "slice").mockImplementation(() => {
      throw new Error("copy failed");
    });
    await expect(
      runScene3dSpecialistInWorker(input, undefined, { queue }),
    ).rejects.toThrow("copy failed");
    expect(queue.snapshot().snapshotBytes).toBe(0);
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("CSP unavailable");
        }
      },
    );
    await expect(
      runScene3dSpecialistInWorker(request(), undefined, { queue }),
    ).rejects.toThrow("CSP unavailable");
    expect(queue.snapshot()).toEqual({
      active: 0,
      queued: 0,
      snapshotBytes: 0,
    });
  });
  it("terminates a cancelled running Worker before starting the next queued job", async () => {
    const queue = setup();
    const abort = new AbortController();
    const first = runScene3dSpecialistInWorker(request(), abort.signal, {
      queue,
    });
    const second = runScene3dSpecialistInWorker(request(2), undefined, {
      queue,
    });
    const rejected = expect(first).rejects.toMatchObject({ code: "cancelled" });
    abort.abort();
    expect(WorkerFixture.all[0]!.terminate).toHaveBeenCalledOnce();
    await rejected;
    expect(WorkerFixture.all).toHaveLength(2);
    WorkerFixture.all[1]!.send(result(2));
    await second;
  });
  it("accepts only correlated sequential stages and isolates observer exceptions", async () => {
    const queue = setup();
    const stages: string[] = [];
    const job = runScene3dSpecialistInWorker(request(), undefined, {
      queue,
      onProgress: ({ phase }) => {
        stages.push(phase);
        if (phase === "decoding") throw new Error("UI fault");
      },
    });
    for (const [index, phase] of [
      "validating",
      "decoding",
      "processing",
      "verifying",
    ].entries()) {
      WorkerFixture.all[0]!.send({
        kind: "progress",
        version: 1,
        id: 1,
        sequence: index + 1,
        phase,
      });
    }
    WorkerFixture.all[0]!.send(result());
    await job;
    expect(stages).toEqual([
      "starting",
      "validating",
      "decoding",
      "processing",
      "verifying",
      "ready",
    ]);
  });
  it.each([
    { id: 9, sequence: 1, phase: "validating" },
    { id: 1, sequence: 2, phase: "processing" },
    { id: 1, sequence: 1, phase: "ready" },
    { id: 1, sequence: 1, phase: "validating", percent: 50 },
  ])("rejects untrusted progress and cleans up (%j)", async (payload) => {
    const queue = setup();
    const job = runScene3dSpecialistInWorker(request(), undefined, { queue });
    const rejected = expect(job).rejects.toMatchObject({ code: "runtime" });
    WorkerFixture.all[0]!.send({ kind: "progress", version: 1, ...payload });
    await rejected;
    expect(WorkerFixture.all[0]!.terminate).toHaveBeenCalledOnce();
    expect(queue.snapshot().snapshotBytes).toBe(0);
  });
  it("does not let progress messages extend the execution deadline", async () => {
    vi.useFakeTimers();
    const queue = setup();
    const job = runScene3dSpecialistInWorker(request(), undefined, { queue });
    const rejected = expect(job).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(SPECIALIST_LIMITS.timeoutMs - 1);
    WorkerFixture.all[0]!.send({
      kind: "progress",
      version: 1,
      id: 1,
      sequence: 1,
      phase: "validating",
    });
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(queue.snapshot().snapshotBytes).toBe(0);
  });
});

it("handles cancellation re-entered by a starting observer without allocating a worker", async () => {
  const queue = setup();
  const abort = new AbortController();
  await expect(
    runScene3dSpecialistInWorker(request(), abort.signal, {
      queue,
      onProgress: ({ phase }) => {
        if (phase === "starting") abort.abort();
      },
    }),
  ).rejects.toMatchObject({ code: "cancelled" });
  expect(WorkerFixture.all).toHaveLength(0);
  expect(queue.snapshot()).toEqual({ active: 0, queued: 0, snapshotBytes: 0 });
});
it("does not let a queued-position observer cancel another job into concurrent execution", async () => {
  const queue = setup();
  const firstAbort = new AbortController();
  const secondAbort = new AbortController();
  const first = runScene3dSpecialistInWorker(request(), firstAbort.signal, {
    queue,
  });
  const second = runScene3dSpecialistInWorker(request(2), secondAbort.signal, {
    queue,
    onProgress: ({ phase }) => {
      if (phase === "queued") secondAbort.abort();
    },
  });
  await expect(second).rejects.toMatchObject({ code: "cancelled" });
  expect(WorkerFixture.all).toHaveLength(1);
  expect(queue.snapshot()).toEqual({ active: 1, queued: 0, snapshotBytes: 20 });
  WorkerFixture.all[0]!.send(result());
  await first;
});
it("rejects repeated progress instead of allowing a replay to keep an operation alive", async () => {
  const queue = setup();
  const job = runScene3dSpecialistInWorker(request(), undefined, { queue });
  const payload = {
    kind: "progress",
    version: 1,
    id: 1,
    sequence: 1,
    phase: "validating",
  };
  WorkerFixture.all[0]!.send(payload);
  const rejected = expect(job).rejects.toMatchObject({ code: "runtime" });
  WorkerFixture.all[0]!.send(payload);
  await rejected;
  expect(queue.snapshot().snapshotBytes).toBe(0);
});
it("classifies invalid options as rejection without reserving or allocating", async () => {
  const queue = setup();
  const phases: string[] = [];
  await expect(
    runScene3dSpecialistInWorker(
      {
        ...request(),
        options: { kind: "not-implemented" },
      } as unknown as SpecialistRequest,
      undefined,
      { queue, onProgress: ({ phase }) => phases.push(phase) },
    ),
  ).rejects.toMatchObject({ code: "invalid-input" });
  expect(phases).toEqual(["rejected"]);
  expect(WorkerFixture.all).toHaveLength(0);
});
