import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioUnitCubeMesh } from "./studio-editable-half-edge-mesh";
import {
  disposeStudioOcctWorker,
  runStudioOcctOperation,
} from "./studio-occt-worker-client";

import type {
  StudioOcctWorkerRequest,
  StudioOcctWorkerResponse,
} from "./studio-occt-worker-protocol";

class FakeOcctWorker extends EventTarget {
  static mode: "post-message-throw" | "silent" | "success" = "success";
  static latest: FakeOcctWorker | null = null;

  lastRequest: StudioOcctWorkerRequest | null = null;
  terminated = false;

  constructor() {
    super();
    FakeOcctWorker.latest = this;
  }

  postMessage(request: StudioOcctWorkerRequest): void {
    this.lastRequest = request;
    if (FakeOcctWorker.mode === "post-message-throw") {
      throw new DOMException("structured clone failed", "DataCloneError");
    }
    if (FakeOcctWorker.mode === "silent") return;
    queueMicrotask(() => {
      const response: StudioOcctWorkerResponse = {
        id: request.id,
        result: {
          ok: true,
          mesh: createStudioUnitCubeMesh(),
          faceCount: 6,
          triangleCount: 12,
          vertexCount: 8,
          volumeApprox: 1,
          backend: "opencascade-wasm",
          operation: "BRepPrimAPI_MakeBox",
          loadPath: "browser",
        },
      };
      this.dispatchEvent(new MessageEvent("message", { data: response }));
    });
  }

  emitError(message: string): void {
    const event = new Event("error") as ErrorEvent;
    Object.defineProperty(event, "message", { value: message });
    this.dispatchEvent(event);
  }

  emitMalformedMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  emitMessageError(): void {
    this.dispatchEvent(new Event("messageerror"));
  }

  terminate(): void {
    this.terminated = true;
  }
}

afterEach(() => {
  disposeStudioOcctWorker();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeOcctWorker.latest = null;
  FakeOcctWorker.mode = "success";
});

function useFakeBrowserWorker(): void {
  vi.stubGlobal("window", {});
  vi.stubGlobal("Worker", FakeOcctWorker);
}

describe("Studio OCCT Worker client", () => {
  it("runs browser operations off the UI thread and returns the canonical mesh", async () => {
    useFakeBrowserWorker();
    const result = await runStudioOcctOperation({ kind: "box", size: [1, 1, 1] });
    expect(result.loadPath).toBe("browser");
    expect(result.vertexCount).toBe(8);
    expect(result.mesh.faces).toHaveLength(6);
    expect(FakeOcctWorker.latest?.terminated).toBe(false);
  });

  it("terminates the shared Worker and rejects on cancellation", async () => {
    useFakeBrowserWorker();
    FakeOcctWorker.mode = "silent";
    const controller = new AbortController();
    const operation = runStudioOcctOperation(
      { kind: "box", size: [1, 1, 1] },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeOcctWorker.latest?.terminated).toBe(true);
  });

  it("terminates a wedged Worker at the bounded timeout", async () => {
    vi.useFakeTimers();
    useFakeBrowserWorker();
    FakeOcctWorker.mode = "silent";
    const operation = runStudioOcctOperation(
      { kind: "box", size: [1, 1, 1] },
      { timeoutMs: 1_000 },
    );
    const assertion = expect(operation).rejects.toThrow(/timed out after 1000ms/u);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(FakeOcctWorker.latest?.terminated).toBe(true);
  });

  it("fails closed when Worker is unavailable in a browser", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", undefined);

    await expect(
      runStudioOcctOperation({ kind: "box", size: [1, 1, 1] }),
    ).rejects.toThrow("OCCT Worker is unavailable in this browser");
    expect(FakeOcctWorker.latest).toBeNull();
  });

  it("terminates and rejects pending work on a Worker error", async () => {
    useFakeBrowserWorker();
    FakeOcctWorker.mode = "silent";
    const operation = runStudioOcctOperation({ kind: "box", size: [1, 1, 1] });
    const assertion = expect(operation).rejects.toThrow("OCCT kernel crashed");

    FakeOcctWorker.latest?.emitError("OCCT kernel crashed");

    await assertion;
    expect(FakeOcctWorker.latest?.terminated).toBe(true);
  });

  it("terminates and rejects pending work on message deserialization failure", async () => {
    useFakeBrowserWorker();
    FakeOcctWorker.mode = "silent";
    const operation = runStudioOcctOperation({ kind: "box", size: [1, 1, 1] });
    const assertion = expect(operation).rejects.toThrow(
      "OCCT Worker returned an unreadable result",
    );

    FakeOcctWorker.latest?.emitMessageError();

    await assertion;
    expect(FakeOcctWorker.latest?.terminated).toBe(true);
  });

  it("rejects malformed response payloads instead of trusting TypeScript types", async () => {
    useFakeBrowserWorker();
    FakeOcctWorker.mode = "silent";
    const operation = runStudioOcctOperation({ kind: "box", size: [1, 1, 1] });
    const assertion = expect(operation).rejects.toThrow(
      "OCCT Worker returned an invalid response payload",
    );

    FakeOcctWorker.latest?.emitMalformedMessage({
      id: FakeOcctWorker.latest.lastRequest?.id,
      result: { ok: true, mesh: null },
    });

    await assertion;
    expect(FakeOcctWorker.latest?.terminated).toBe(true);
  });

  it("cleans up immediately when postMessage throws synchronously", async () => {
    useFakeBrowserWorker();
    FakeOcctWorker.mode = "post-message-throw";

    await expect(
      runStudioOcctOperation({ kind: "box", size: [1, 1, 1] }),
    ).rejects.toThrow("OCCT Worker postMessage failed: structured clone failed");
    expect(FakeOcctWorker.latest?.terminated).toBe(true);
  });
});
