import { afterEach, describe, expect, it, vi } from "vitest";

import { processFreehandPoints } from "../studio-brush";

import {
  disposeStudioBrushWorkerClient,
  processFreehandPointsInWorker,
} from "./studio-brush-worker-client";
import {
  STUDIO_BRUSH_WORKER_PROTOCOL_VERSION,
  type StudioBrushWorkerPlanResponse,
} from "./studio-brush-worker-protocol";

class FakeBrushWorker {
  static instances: FakeBrushWorker[] = [];

  onmessage: ((event: MessageEvent<StudioBrushWorkerPlanResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly postMessage = vi.fn<(message: unknown) => void>();
  readonly terminate = vi.fn<() => void>();

  constructor(..._args: unknown[]) {
    FakeBrushWorker.instances.push(this);
  }
}

function installFakeWorker(): void {
  FakeBrushWorker.instances = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("Worker", FakeBrushWorker);
}

function respond(worker: FakeBrushWorker, id: string, points: number[]): void {
  worker.onmessage?.({
    data: {
      version: STUDIO_BRUSH_WORKER_PROTOCOL_VERSION,
      id,
      ok: true,
      points,
      dabCount: Math.floor(points.length / 2),
    },
  } as MessageEvent<StudioBrushWorkerPlanResponse>);
}

afterEach(() => {
  disposeStudioBrushWorkerClient();
  vi.unstubAllGlobals();
  FakeBrushWorker.instances = [];
});

describe("studio-brush-worker-protocol & client", () => {
  it("defines protocol version 1", () => {
    expect(STUDIO_BRUSH_WORKER_PROTOCOL_VERSION).toBe(1);
  });

  it("falls back gracefully when Web Worker is not available in node test environment", async () => {
    const raw = [10, 10, 12, 12, 30, 30, 50, 50];
    const res = await processFreehandPointsInWorker(raw, 3, "pen", 6, 42);
    expect(res).toEqual(processFreehandPoints(raw, 3));
  });

  it("retires a crashed worker, drains pending work, and creates a fresh generation", async () => {
    installFakeWorker();
    const raw = [10, 10, 12, 12, 30, 30, 50, 50];

    const firstPromise = processFreehandPointsInWorker(raw, 3, "pen", 6, 42);
    const first = FakeBrushWorker.instances[0];
    expect(first).toBeDefined();
    const staleOnMessage = first!.onmessage;
    first!.onerror?.({ message: "worker crashed" } as ErrorEvent);

    await expect(firstPromise).resolves.toEqual(processFreehandPoints(raw, 3));
    expect(first!.terminate).toHaveBeenCalledTimes(1);

    const replacementPoints = [1, 1, 20, 20, 40, 40];
    const secondPromise = processFreehandPointsInWorker(raw, 3, "pen", 6, 43);
    const second = FakeBrushWorker.instances[1];
    expect(second).toBeDefined();
    const secondRequest = second!.postMessage.mock.calls[0]?.[0] as { id: string };

    staleOnMessage?.({
      data: {
        version: STUDIO_BRUSH_WORKER_PROTOCOL_VERSION,
        id: secondRequest.id,
        ok: true,
        points: [999, 999],
        dabCount: 1,
      },
    } as MessageEvent<StudioBrushWorkerPlanResponse>);
    respond(second!, secondRequest.id, replacementPoints);

    await expect(secondPromise).resolves.toEqual(replacementPoints);
    expect(FakeBrushWorker.instances).toHaveLength(2);
  });

  it("retires the generation when postMessage throws synchronously", async () => {
    installFakeWorker();
    const raw = [0, 0, 10, 10, 20, 20];

    const firstPromise = processFreehandPointsInWorker(raw, 2, "pen", 6, 7);
    const first = FakeBrushWorker.instances[0];
    expect(first).toBeDefined();
    first!.postMessage.mockImplementationOnce(() => {
      throw new DOMException("worker is gone", "InvalidStateError");
    });

    const secondPromise = processFreehandPointsInWorker(raw, 2, "pen", 6, 8);
    await expect(secondPromise).resolves.toEqual(processFreehandPoints(raw, 2));
    expect(first!.terminate).toHaveBeenCalledTimes(1);

    const firstRequest = first!.postMessage.mock.calls[0]?.[0] as { id: string };
    await expect(firstPromise).resolves.toEqual(processFreehandPoints(raw, 2));
    expect(firstRequest.id).toMatch(/^brush-work-/);

    const thirdPromise = processFreehandPointsInWorker(raw, 2, "pen", 6, 9);
    const replacement = FakeBrushWorker.instances[1];
    const request = replacement!.postMessage.mock.calls[0]?.[0] as { id: string };
    respond(replacement!, request.id, [0, 0, 20, 20]);
    await expect(thirdPromise).resolves.toEqual([0, 0, 20, 20]);
  });
});
