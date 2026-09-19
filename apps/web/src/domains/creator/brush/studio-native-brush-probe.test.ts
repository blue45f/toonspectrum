import { describe, expect, it, vi } from "vitest";

import { StudioNativeBrushProbeClient } from "./studio-native-brush-probe-client";
import { validateNativeBrushProbeConfig, validateNativeBrushProbeSamples } from "./studio-native-brush-probe-contract";
import { nativeBrushProbeMybDocument, nativeBrushProbeScene } from "./studio-native-brush-probe-program";

import type { NativeBrushProbeWorkerPort } from "./studio-native-brush-probe-client";
import type { NativeBrushProbeConfig } from "./studio-native-brush-probe-contract";

const config: NativeBrushProbeConfig = { size: 24, color: "#123456", style: "ink", seed: 7 };
const sample = { x: 12, y: 20, pressure: 0.7, tiltX: 0, tiltY: 0, tMs: 0 };
class FakeWorker extends EventTarget implements NativeBrushProbeWorkerPort {
  postMessage = vi.fn(); terminate = vi.fn();
  reply(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
}

describe("native brush test boundary", () => {
  it("rejects invalid configuration and oversized/nonmonotonic batches", () => {
    expect(() => validateNativeBrushProbeConfig(config)).not.toThrow();
    expect(() => validateNativeBrushProbeConfig({ ...config, size: 9999 })).toThrow();
    expect(() => validateNativeBrushProbeSamples([sample], 0, 0)).not.toThrow();
    expect(() => validateNativeBrushProbeSamples(Array(129).fill(sample), 0, 0)).toThrow();
    expect(() => validateNativeBrushProbeSamples([sample], 1, 0)).toThrow();
    expect(() => validateNativeBrushProbeSamples([sample], 0, 8192)).toThrow();
    expect(() => validateNativeBrushProbeSamples([{ ...sample, x: -1 }], 0, 0)).toThrow();
  });
  it("uses different real MYB settings for ink/wash/chalk and stable vector geometry", () => {
    expect(nativeBrushProbeMybDocument(config)).not.toEqual(nativeBrushProbeMybDocument({ ...config, style: "wash" }));
    expect(nativeBrushProbeMybDocument(config)).not.toEqual(nativeBrushProbeMybDocument({ ...config, style: "chalk" }));
    const scene = nativeBrushProbeScene(config, [sample, { ...sample, x: 100, tMs: 8 }]);
    expect(scene.nodes).toHaveLength(1);
    expect(scene).toEqual(nativeBrushProbeScene(config, [sample, { ...sample, x: 100, tMs: 8 }]));
  });
  it("allows one request in flight and disposes pending work without a hanging promise", async () => {
    const worker = new FakeWorker(), client = new StudioNativeBrushProbeClient(worker);
    const pending = client.request({ type: "init", engine: "libmypaint" });
    await expect(client.request({ type: "finish" })).rejects.toThrow(/in flight/);
    const rejected = expect(pending).rejects.toThrow(/disposed/);
    client.dispose(); await rejected;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    client.dispose(); expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("matches IDs/engine and rejects malformed dirty regions instead of corrupting the preview", async () => {
    const worker = new FakeWorker(), client = new StudioNativeBrushProbeClient(worker);
    const ready = client.request({ type: "init", engine: "libmypaint" });
    worker.reply({ version: 1, id: 1, type: "ready", engine: "libmypaint" }); await ready;
    const pending = client.request({ type: "append", samples: [sample] });
    const rejected = expect(pending).rejects.toThrow(/잘못된/);
    worker.reply({ version: 1, id: 2, type: "frame", engine: "libmypaint", samples: 1, finished: false,
      frame: { kind: "pixels", x: 500, y: 0, width: 20, height: 1, pixels: new Uint8Array(80) } });
    await rejected; expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("closes a stale transferred bitmap, then accepts the current response", async () => {
    const worker = new FakeWorker(), client = new StudioNativeBrushProbeClient(worker);
    const ready = client.request({ type: "init", engine: "canvaskit" });
    const close = vi.fn();
    worker.reply({ version: 1, id: 99, type: "frame", frame: { kind: "bitmap", bitmap: { close } } });
    expect(close).toHaveBeenCalledTimes(1);
    worker.reply({ version: 1, id: 1, type: "ready", engine: "canvaskit" });
    await ready; client.dispose();
  });
  it("terminates on timeout without selecting another engine", async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker(), client = new StudioNativeBrushProbeClient(worker, 50);
      const pending = client.request({ type: "init", engine: "vello" });
      const rejected = expect(pending).rejects.toThrow(/초과/);
      await vi.advanceTimersByTimeAsync(51); await rejected;
      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
