import { describe, expect, it, vi } from "vitest";

import {
  runStudioRetouchWorker,
  type StudioRetouchWorkerLike,
} from "./studio-retouch-worker-client";
import {
  STUDIO_RETOUCH_DIRECT_MAX_IMAGE_PIXELS,
  studioRetouchSuccessTransfers,
  type StudioRetouchWorkerResponseMessage,
  type StudioRetouchWorkerRunMessage,
  type StudioRetouchWorkerRunRequest,
  type StudioRetouchWorkerSuccessMessage,
} from "./studio-retouch-worker-protocol";
import { applyStudioRetouchWorkerRequest } from "./studio-retouch-worker-runtime";

function request(kind: "dodge-burn" | "wet-mix" = "dodge-burn"): StudioRetouchWorkerRunRequest {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  data.fill(128);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  const common = { data, w: 8, h: 8, points: [{ x: 4, y: 4 }] };
  return kind === "dodge-burn"
    ? {
        kind,
        ...common,
        settings: {
          radiusPx: 3,
          hardness: 0.5,
          exposure: 50,
          mode: "dodge",
          range: "midtones",
          sponge: "saturate",
        },
      }
    : {
        kind,
        ...common,
        settings: {
          radiusPx: 3,
          hardness: 0.5,
          strength: 0.6,
          wetness: 0.5,
          pickup: 0.4,
          paintColor: { r: 20, g: 80, b: 220 },
        },
      };
}

class ApplyingWorker implements StudioRetouchWorkerLike {
  onmessage: StudioRetouchWorkerLike["onmessage"] = null;
  onerror: StudioRetouchWorkerLike["onerror"] = null;
  terminateCount = 0;
  postCount = 0;
  transferCount = 0;

  constructor() {
    queueMicrotask(() => this.onmessage?.({
      data: { type: "studio-retouch/ready", version: 1 },
    } as MessageEvent<StudioRetouchWorkerResponseMessage>));
  }

  postMessage(message: StudioRetouchWorkerRunMessage, transfer: Transferable[]): void {
    this.postCount += 1;
    this.transferCount = transfer.length;
    const received = structuredClone(message, { transfer });
    const result = applyStudioRetouchWorkerRequest(received.request);
    const response: StudioRetouchWorkerSuccessMessage = {
      type: "studio-retouch/success",
      version: 1,
      ...result,
    };
    const returned = structuredClone(response, {
      transfer: studioRetouchSuccessTransfers(response),
    });
    this.onmessage?.({ data: returned } as MessageEvent<StudioRetouchWorkerResponseMessage>);
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

class HangingWorker implements StudioRetouchWorkerLike {
  onmessage: StudioRetouchWorkerLike["onmessage"] = null;
  onerror: StudioRetouchWorkerLike["onerror"] = null;
  terminateCount = 0;

  constructor(ready = true) {
    if (ready) queueMicrotask(() => this.onmessage?.({
      data: { type: "studio-retouch/ready", version: 1 },
    } as MessageEvent<StudioRetouchWorkerResponseMessage>));
  }

  postMessage(message?: unknown, transfer?: unknown): void {
    void message;
    void transfer;
  }
  terminate(): void {
    this.terminateCount += 1;
  }
}

class LoadErrorWorker extends HangingWorker {
  constructor() {
    super(false);
    queueMicrotask(() => this.onerror?.({ message: "worker module failed" }));
  }
}

class ThrowingPostWorker extends HangingWorker {
  override postMessage(): void {
    throw new DOMException("blocked", "DataCloneError");
  }
}

class PostTransferThrowWorker extends HangingWorker {
  override postMessage(message: StudioRetouchWorkerRunMessage, transfer: Transferable[]): void {
    structuredClone(message, { transfer });
    throw new Error("worker transport threw after ownership transfer");
  }
}

class PostTransferFailureWorker extends HangingWorker {
  override postMessage(message: StudioRetouchWorkerRunMessage, transfer: Transferable[]): void {
    structuredClone(message, { transfer });
    queueMicrotask(() => this.onerror?.({ message: "worker crashed after ownership transfer" }));
  }
}

describe("runStudioRetouchWorker", () => {
  it.each(["dodge-burn", "wet-mix"] as const)(
    "runs %s in one fresh-buffer Worker flight with exact direct parity",
    async (kind) => {
      const input = request(kind);
      const expectedRequest = structuredClone(input);
      const expected = applyStudioRetouchWorkerRequest(expectedRequest).data;
      const inputData = input.data;
      const worker = new ApplyingWorker();

      const result = await runStudioRetouchWorker(input, { workerFactory: () => worker });

      expect(result.execution).toBe("worker");
      expect(result.kind).toBe(kind);
      expect(result.data).toEqual(expected);
      expect(result.data === inputData).toBe(false);
      expect(inputData.byteLength).toBe(0);
      expect(worker.postCount).toBe(1);
      expect(worker.transferCount).toBe(1);
      expect(worker.terminateCount).toBe(1);
    },
  );

  it("clones partial views before transfer and leaves unrelated backing bytes attached", async () => {
    const base = request();
    const backing = new ArrayBuffer(base.data.byteLength + 16);
    const view = new Uint8ClampedArray(backing, 8, base.data.byteLength);
    view.set(base.data);
    const sentinel = new Uint8Array(backing, 0, 4);
    sentinel.set([4, 3, 2, 1]);

    const result = await runStudioRetouchWorker(
      { ...base, data: view },
      { workerFactory: () => new ApplyingWorker() },
    );

    expect(result.execution).toBe("worker");
    expect(backing.byteLength).toBe(base.data.byteLength + 16);
    expect(Array.from(sentinel)).toEqual([4, 3, 2, 1]);
  });

  it("falls back before transfer for unavailable and load failures and keeps input attached", async () => {
    for (const workerFactory of [
      null,
      () => new LoadErrorWorker(),
    ] as const) {
      const input = request();
      const inputData = input.data;
      const result = await runStudioRetouchWorker(input, { workerFactory });
      expect(result.execution).toBe("direct");
      expect(inputData.byteLength).toBe(8 * 8 * 4);
    }
  });

  it("rejects a synchronous post failure at the ownership boundary", async () => {
    const input = request();
    const data = input.data;
    await expect(runStudioRetouchWorker(input, {
      workerFactory: () => new ThrowingPostWorker(),
    })).rejects.toMatchObject({ name: "DataCloneError" });
    expect(data.byteLength).toBe(8 * 8 * 4);
  });

  it("aborts and times out an in-flight one-shot Worker", async () => {
    const abortWorker = new HangingWorker();
    const controller = new AbortController();
    const aborted = runStudioRetouchWorker(request(), {
      signal: controller.signal,
      workerFactory: () => abortWorker,
    });
    const abortExpectation = expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await abortExpectation;
    expect(abortWorker.terminateCount).toBe(1);

    vi.useFakeTimers();
    try {
      const timeoutWorker = new HangingWorker();
      const timedOut = runStudioRetouchWorker(request(), {
        workerFactory: () => timeoutWorker,
        operationTimeoutMilliseconds: 5,
      });
      const timeoutExpectation = expect(timedOut).rejects.toMatchObject({ name: "AbortError" });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(6);
      await timeoutExpectation;
      expect(timeoutWorker.terminateCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed after ownership transfer instead of running a detached direct fallback", async () => {
    for (const workerFactory of [
      () => new PostTransferThrowWorker(),
      () => new PostTransferFailureWorker(),
    ]) {
      const input = request();
      const data = input.data;
      await expect(runStudioRetouchWorker(input, { workerFactory })).rejects.toThrow(
        /ownership transfer/u,
      );
      expect(data.byteLength).toBe(0);
    }
  });

  it("blocks a large direct fallback before a main-thread pixel loop can start", async () => {
    const pixels = STUDIO_RETOUCH_DIRECT_MAX_IMAGE_PIXELS + 1;
    const base = request();
    await expect(runStudioRetouchWorker({
      ...base,
      data: new Uint8ClampedArray(pixels * 4),
      w: pixels,
      h: 1,
    }, { workerFactory: null })).rejects.toThrow(/직접 계산 안전 상한/u);
  });
});
