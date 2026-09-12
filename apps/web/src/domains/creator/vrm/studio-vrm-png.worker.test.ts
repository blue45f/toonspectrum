import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  StudioVrmPngWorkerRequest,
  StudioVrmPngWorkerResponse,
} from "./studio-vrm-png-worker-protocol";

function request(): StudioVrmPngWorkerRequest {
  return {
    version: 1, kind: "encode", requestId: 7, width: 2, height: 1,
    layers: [{ role: "color", width: 2, height: 1, dataBuffer: new ArrayBuffer(8) }],
  };
}

async function harness(options: { unavailable?: boolean; encodeFails?: boolean } = {}) {
  vi.resetModules();
  const messages: StudioVrmPngWorkerResponse[] = [];
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const images: { data: Uint8ClampedArray; width: number; height: number }[] = [];
  const canvases: MockCanvas[] = [];
  class MockCanvas {
    readonly initialWidth: number;
    readonly initialHeight: number;
    readonly putImageData = vi.fn();
    constructor(public width: number, public height: number) {
      this.initialWidth = width;
      this.initialHeight = height;
      canvases.push(this);
    }
    getContext() { return { putImageData: this.putImageData }; }
    async convertToBlob() {
      if (options.encodeFails) throw new Error("encoder failed");
      return new Blob([new Uint8Array(33)], { type: "image/png" });
    }
  }
  vi.stubGlobal("self", {
    postMessage: (value: StudioVrmPngWorkerResponse) => messages.push(value),
    addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => {
      listeners.push(listener);
    },
  });
  vi.stubGlobal("OffscreenCanvas", options.unavailable ? undefined : MockCanvas);
  vi.stubGlobal("ImageData", class {
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      images.push({ data, width, height });
    }
  });
  await import("./studio-vrm-png.worker");
  return { messages, listeners, canvases, images };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("single-image VRM PNG worker memory and terminal behavior", () => {
  it("uses one encoding canvas and wraps the transferred pixels without a second image allocation", async () => {
    const host = await harness();
    expect(host.messages).toEqual([{ version: 1, kind: "ready" }]);
    const input = request();
    host.listeners[0]!({ data: input });
    await vi.waitFor(() => expect(host.messages[1]?.kind).toBe("result"));
    // Only the 1x1 startup capability probe and one destination canvas are created.
    expect(host.canvases.map((canvas) => [canvas.initialWidth, canvas.initialHeight])).toEqual([
      [1, 1], [2, 1],
    ]);
    expect(host.images).toHaveLength(1);
    expect(host.images[0]!.data.buffer).toBe(input.layers[0]!.dataBuffer);
    expect(host.canvases[1]!.putImageData).toHaveBeenCalledExactlyOnceWith(expect.anything(), 0, 0);
    expect([host.canvases[1]!.width, host.canvases[1]!.height]).toEqual([1, 1]);
    host.listeners[0]!({ data: request() });
    expect(host.canvases).toHaveLength(2);
  });

  it("rejects a second layer before allocating any encoding canvas", async () => {
    const host = await harness();
    const input = request();
    host.listeners[0]!({ data: { ...input, layers: [...input.layers, ...input.layers] } });
    expect(host.messages[1]).toEqual({ version: 1, kind: "error", requestId: 7, code: "protocol" });
    expect(host.canvases).toHaveLength(1);
    expect(host.images).toHaveLength(0);
  });

  it("releases the encoding canvas when browser PNG conversion fails", async () => {
    const host = await harness({ encodeFails: true });
    host.listeners[0]!({ data: request() });
    await vi.waitFor(() => expect(host.messages[1]).toEqual({
      version: 1, kind: "error", requestId: 7, code: "encode-failed",
    }));
    expect([host.canvases[1]!.width, host.canvases[1]!.height]).toEqual([1, 1]);
  });

  it("reports unavailable without installing an encoder when OffscreenCanvas is missing", async () => {
    const host = await harness({ unavailable: true });
    expect(host.messages).toEqual([{ version: 1, kind: "unavailable", code: "offscreen-canvas" }]);
    expect(host.listeners).toHaveLength(0);
    expect(host.canvases).toHaveLength(0);
  });
});
