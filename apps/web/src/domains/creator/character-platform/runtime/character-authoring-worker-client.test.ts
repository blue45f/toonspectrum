import { describe, expect, it } from "vitest";

import {
  CharacterAuthoringWorkerClient,
  type CharacterAuthoringWorkerLike,
} from "./character-authoring-worker-client";
import {
  CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
  type CharacterAuthoringWorkerRequest,
  type CharacterAuthoringWorkerResponse,
} from "./character-authoring-worker-protocol";
import { executeCharacterAuthoringTask } from "./character-authoring-worker-runtime";

import type { CharacterGeometryStroke } from "../surface-ink/character-geometry-stroke";

const stroke: CharacterGeometryStroke = {
  strokeId: "stroke:client",
  name: "client",
  visible: true,
  locked: false,
  status: "valid",
  style: {
    color: "#111111", baseWidth: 0.02, opacity: 1, taperStart: 0, taperEnd: 0.5,
    pressureWidth: 0.5, profile: "ribbon", fill: true, lineOnly: false,
  },
  points: [
    { anchor: { kind: "free", position: [0, 0, 0] }, pressure: 0.5, width: 1, twist: 0 },
    { anchor: { kind: "free", position: [0.4, 0.2, 0] }, pressure: 0.7, width: 0.5, twist: 0.2 },
  ],
};

class FakeWorker implements CharacterAuthoringWorkerLike {
  readonly listeners = {
    message: new Set<(event: { data: unknown }) => void>(),
    error: new Set<(event: { preventDefault?(): void }) => void>(),
    messageerror: new Set<(event: { preventDefault?(): void }) => void>(),
  };
  terminated = false;
  postMessage(message: CharacterAuthoringWorkerRequest): void {
    queueMicrotask(() => {
      const progress: CharacterAuthoringWorkerResponse = {
        version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
        kind: "progress",
        requestId: message.requestId,
        generationId: message.generationId,
        stage: "computing",
        progress: 0.5,
      };
      this.listeners.message.forEach((listener) => listener({ data: progress }));
      const result: CharacterAuthoringWorkerResponse = {
        version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
        kind: "result",
        requestId: message.requestId,
        generationId: message.generationId,
        result: executeCharacterAuthoringTask(message.task),
      };
      this.listeners.message.forEach((listener) => listener({ data: result }));
    });
  }
  addEventListener(type: keyof FakeWorker["listeners"], listener: never): void {
    this.listeners[type].add(listener as never);
  }
  removeEventListener(type: keyof FakeWorker["listeners"], listener: never): void {
    this.listeners[type].delete(listener as never);
  }
  terminate(): void { this.terminated = true; }
}

describe("Character authoring browser Worker client", () => {
  it("executes a real binary geometry task in an isolated Worker contract", async () => {
    const worker = new FakeWorker();
    const stages: string[] = [];
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => worker });
    const result = await client.execute(
      { kind: "build-geometry-stroke", stroke },
      { onProgress: (progress) => stages.push(progress.stage) },
    );
    expect(result.kind).toBe("mesh");
    expect(stages).toEqual(["queued", "computing", "ready"]);
    expect(worker.terminated).toBe(true);
  });

  it("keeps the operation in the browser with a cooperative main-realm fallback", async () => {
    const stages: string[] = [];
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => null });
    const result = await client.execute(
      { kind: "build-geometry-stroke", stroke },
      { onProgress: (progress) => stages.push(progress.stage) },
    );
    expect(result.kind).toBe("mesh");
    expect(stages).toEqual(["queued", "main-thread-fallback", "ready"]);
  });

  it("fails visibly when the caller forbids fallback", async () => {
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => null });
    await expect(client.execute(
      { kind: "build-geometry-stroke", stroke },
      { allowMainThreadFallback: false },
    )).rejects.toMatchObject({ code: "worker-unavailable" });
  });
});

class ControlledWorker extends FakeWorker {
  request: CharacterAuthoringWorkerRequest | null = null;
  override postMessage(message: CharacterAuthoringWorkerRequest): void { this.request = message; }
  result(): void {
    const request = this.request;
    if (!request) throw new Error("요청이 없습니다.");
    this.listeners.message.forEach((listener) => listener({ data: {
      version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
      kind: "result", requestId: request.requestId, generationId: request.generationId,
      result: executeCharacterAuthoringTask(request.task),
    } }));
  }
}

function expectReleased(worker: FakeWorker): void {
  expect(worker.terminated).toBe(true);
  expect(Object.values(worker.listeners).every((listeners) => listeners.size === 0)).toBe(true);
}

describe("Worker 작업 취소와 최신 편집 요청", () => {
  it("dispose가 실행 중 작업을 거절하고 모든 Worker listener를 해제한다", async () => {
    const workers = [new ControlledWorker(), new ControlledWorker()];
    let next = 0;
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => workers[next++] ?? null });
    const first = client.execute({ kind: "build-geometry-stroke", stroke });
    const second = client.execute({ kind: "build-geometry-stroke", stroke });
    const results = Promise.allSettled([first, second]);
    client.dispose();
    expect(await results).toEqual([
      { status: "rejected", reason: expect.objectContaining({ code: "disposed" }) },
      { status: "rejected", reason: expect.objectContaining({ code: "disposed" }) },
    ]);
    workers.forEach(expectReleased);
    await expect(client.execute({ kind: "build-geometry-stroke", stroke })).rejects.toMatchObject({ code: "disposed" });
  });

  it("같은 대상의 이전 메시를 취소하고 최신 폭의 실제 정점 결과만 반환한다", async () => {
    const workers = [new ControlledWorker(), new ControlledWorker()];
    let next = 0;
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => workers[next++] ?? null });
    const first = client.execute({ kind: "build-geometry-stroke", stroke }, { latestKey: "guide:a" });
    const rejection = expect(first).rejects.toMatchObject({ code: "superseded" });
    const edited = { ...stroke, style: { ...stroke.style, baseWidth: 0.2 } };
    const second = client.execute({ kind: "build-geometry-stroke", stroke: edited }, { latestKey: "guide:a" });
    workers[0]?.result();
    workers[1]?.result();
    await rejection;
    const result = await second;
    const expected = executeCharacterAuthoringTask({ kind: "build-geometry-stroke", stroke: edited });
    expect(result.kind).toBe("mesh");
    if (result.kind !== "mesh" || expected.kind !== "mesh") throw new Error("메시 결과가 아닙니다.");
    expect(new Float32Array(result.positions)).toEqual(new Float32Array(expected.positions));
    expect(Math.hypot(...new Float32Array(result.positions).slice(0, 3))).toBeCloseTo(0.1);
    workers.forEach(expectReleased);
  });

  it("서로 다른 대상의 요청은 함께 완료한다", async () => {
    const workers = [new ControlledWorker(), new ControlledWorker()];
    let next = 0;
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => workers[next++] ?? null });
    const first = client.execute({ kind: "build-geometry-stroke", stroke }, { latestKey: "guide:a" });
    const second = client.execute({ kind: "build-geometry-stroke", stroke }, { latestKey: "guide:b" });
    workers[1]?.result(); workers[0]?.result();
    expect((await Promise.all([first, second])).every((value) => value.kind === "mesh")).toBe(true);
  });

  it("Worker 생성 도중 취소되어도 자원을 종료한다", async () => {
    const abort = new AbortController(); const worker = new ControlledWorker();
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => { abort.abort(); return worker; } });
    await expect(client.execute({ kind: "build-geometry-stroke", stroke }, { signal: abort.signal })).rejects.toMatchObject({ code: "aborted" });
    expectReleased(worker);
    expect(worker.request).toBeNull();
  });

  it("fallback이 입력 처리를 기다리는 동안 dispose/abort/최신 요청을 적용한다", async () => {
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => null });
    const first = client.execute({ kind: "build-geometry-stroke", stroke }, { latestKey: "guide:a" });
    const rejection = expect(first).rejects.toMatchObject({ code: "superseded" });
    const abort = new AbortController();
    const second = client.execute({ kind: "build-geometry-stroke", stroke }, { latestKey: "guide:a", signal: abort.signal });
    const aborted = expect(second).rejects.toMatchObject({ code: "aborted" });
    abort.abort();
    const third = client.execute({ kind: "build-geometry-stroke", stroke });
    const disposed = expect(third).rejects.toMatchObject({ code: "disposed" });
    client.dispose();
    await Promise.all([rejection, aborted, disposed]);
  });

  it("fallback 실행 전 호출자가 원본을 바꾸어도 제출 시점의 정점을 계산한다", async () => {
    const client = new CharacterAuthoringWorkerClient({ workerFactory: () => null });
    const edited = { ...stroke, style: { ...stroke.style } };
    const resultPromise = client.execute({ kind: "build-geometry-stroke", stroke: edited });
    edited.style.baseWidth = 0.6;
    const result = await resultPromise;
    if (result.kind !== "mesh") throw new Error("메시 결과가 아닙니다.");
    expect(Math.hypot(...new Float32Array(result.positions).slice(0, 3))).toBeCloseTo(0.01);
  });
});
