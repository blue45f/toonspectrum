import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  StudioLiquifyWorkerResponseMessage,
  StudioLiquifyWorkerRunMessage,
} from "./studio-liquify-worker-protocol";

interface WorkerScopeHarness {
  onmessage: ((event: MessageEvent<StudioLiquifyWorkerRunMessage>) => void) | null;
  postMessage(message: StudioLiquifyWorkerResponseMessage, transfer: Transferable[]): void;
}

async function loadWorkerHarness(): Promise<{
  messages: StudioLiquifyWorkerResponseMessage[];
  scope: WorkerScopeHarness;
}> {
  vi.resetModules();
  const messages: StudioLiquifyWorkerResponseMessage[] = [];
  vi.stubGlobal("postMessage", vi.fn((message: StudioLiquifyWorkerResponseMessage) => {
    messages.push(message);
  }));
  await import("./studio-liquify.worker");
  return { messages, scope: globalThis as unknown as WorkerScopeHarness };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("studio-liquify.worker runtime", () => {
  it("준비 신호 뒤 실제 변위를 적용하고 필드 밖 원본 픽셀을 보존한다", async () => {
    const { messages, scope } = await loadWorkerHarness();
    const src = {
      data: new Uint8ClampedArray([
        10, 20, 30, 255, 40, 50, 60, 255,
        70, 80, 90, 255, 100, 110, 120, 255,
      ]),
      width: 2,
      height: 2,
    };
    const dst = { ...src, data: new Uint8ClampedArray(src.data) };

    scope.onmessage?.({ data: {
      type: "studio-liquify/run",
      version: 1,
      request: {
        src,
        dst,
        field: {
          originX: 1,
          originY: 1,
          width: 1,
          height: 1,
          dx: new Float32Array([0.5]),
          dy: new Float32Array([0]),
        },
      },
    } } as MessageEvent<StudioLiquifyWorkerRunMessage>);

    expect(messages[0]).toEqual({ type: "studio-liquify/ready", version: 1 });
    expect(messages[1]?.type).toBe("studio-liquify/success");
    if (messages[1]?.type !== "studio-liquify/success") throw new Error("success expected");
    expect(messages[1].dst.data.slice(0, 12)).toEqual(src.data.slice(0, 12));
    expect(messages[1].dst.data[15]).toBe(255);
  });

  it("잘못된 dst 길이를 구조화된 failure로 반환한다", async () => {
    const { messages, scope } = await loadWorkerHarness();
    scope.onmessage?.({ data: {
      type: "studio-liquify/run",
      version: 1,
      request: {
        src: { data: new Uint8ClampedArray(16), width: 2, height: 2 },
        dst: { data: new Uint8ClampedArray(4), width: 2, height: 2 },
        field: {
          originX: 0,
          originY: 0,
          width: 1,
          height: 1,
          dx: new Float32Array(1),
          dy: new Float32Array(1),
        },
      },
    } } as MessageEvent<StudioLiquifyWorkerRunMessage>);

    expect(messages[1]).toMatchObject({
      type: "studio-liquify/failure",
      error: { name: "RangeError" },
    });
  });
});
