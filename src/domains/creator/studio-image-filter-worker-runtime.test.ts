import { afterEach, describe, expect, it, vi } from "vitest";

import { applyImageFilters, buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "./studio-konva-filters";

import type {
  StudioImageFilterWorkerResponseMessage,
  StudioImageFilterWorkerRunMessage,
} from "./studio-image-filter-worker-protocol";

interface WorkerScopeHarness {
  onmessage: ((event: MessageEvent<StudioImageFilterWorkerRunMessage>) => void) | null;
  postMessage(message: StudioImageFilterWorkerResponseMessage, transfer: Transferable[]): void;
}

const registry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(registry);

function imageData() {
  return {
    data: new Uint8ClampedArray([
      10, 40, 80, 255,
      90, 120, 160, 200,
    ]),
    width: 2,
    height: 1,
  };
}

async function loadWorkerHarness(): Promise<{
  messages: StudioImageFilterWorkerResponseMessage[];
  scope: WorkerScopeHarness;
}> {
  vi.resetModules();
  const messages: StudioImageFilterWorkerResponseMessage[] = [];
  const postMessage = vi.fn((message: StudioImageFilterWorkerResponseMessage) => {
    messages.push(message);
  });
  vi.stubGlobal("postMessage", postMessage);
  await import("./studio-image-filter.worker");
  return { messages, scope: globalThis as unknown as WorkerScopeHarness };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("studio-image-filter.worker runtime", () => {
  it("announces readiness and returns pixels matching the direct filter chain", async () => {
    const { messages, scope } = await loadWorkerHarness();
    const input = imageData();
    const expected = imageData();
    const el = { brightness: 0.25, saturation: -0.3, temperature: 20 };
    const built = buildImageFilters(el, registry);
    applyImageFilters(expected, built.filters, built.attrs);

    scope.onmessage?.({
      data: { type: "studio-image-filter/run", version: 1, request: { imageData: input, el } },
    } as MessageEvent<StudioImageFilterWorkerRunMessage>);

    expect(messages[0]).toEqual({ type: "studio-image-filter/ready", version: 1 });
    expect(messages[1]?.type).toBe("studio-image-filter/success");
    if (messages[1]?.type !== "studio-image-filter/success") throw new Error("success response expected");
    expect(Array.from(messages[1].imageData.data)).toEqual(Array.from(expected.data));
  });

  it("returns a structured failure for malformed pixel memory", async () => {
    const { messages, scope } = await loadWorkerHarness();
    const malformed = {
      data: new Uint8ClampedArray(4),
      width: 2,
      height: 2,
    };

    scope.onmessage?.({
      data: { type: "studio-image-filter/run", version: 1, request: { imageData: malformed, el: {} } },
    } as MessageEvent<StudioImageFilterWorkerRunMessage>);

    expect(messages[1]).toMatchObject({
      type: "studio-image-filter/failure",
      version: 1,
      error: { name: "RangeError" },
    });
  });
});
