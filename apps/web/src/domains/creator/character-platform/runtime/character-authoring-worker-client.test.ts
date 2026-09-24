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
