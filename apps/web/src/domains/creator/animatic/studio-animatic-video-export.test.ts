import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioAnimaticWorkspace } from "./studio-animatic-workspace";
import { exportStudioAnimaticVideo } from "./studio-animatic-video-export";

import type { MotionExportDeps, MotionRecorderLike } from "../export/studio-motion-export";

const { draw } = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock("./studio-animatic-renderer", () => ({ drawStudioAnimaticFrame: draw }));
vi.mock("./studio-animatic-recorded-webm", () => ({ finalizeStudioAnimaticRecordedWebm: async (blob: Blob) => blob }));
afterEach(() => { draw.mockReset(); vi.unstubAllGlobals(); });

function harness() {
  let now = 0;
  let frame = 0;
  const frames = new Set<number>();
  const track = { stop: vi.fn() };
  const stream = { addTrack: vi.fn(), getTracks: () => [track] };
  const canvas = { width: 720, height: 1280, getContext: vi.fn(() => ({} as CanvasRenderingContext2D)), captureStream: vi.fn(() => stream) };
  let recording = false;
  const recorder: MotionRecorderLike = {
    mimeType: "video/webm;codecs=vp9,opus",
    start: vi.fn(() => { recording = true; }),
    stop: vi.fn(() => {
      if (!recording) return;
      recording = false;
      recorder.ondataavailable?.({ data: new Blob([Uint8Array.of(1, 2, 3)]) });
      recorder.onstop?.();
    }),
    ondataavailable: null, onstop: null, onerror: null,
  };
  const deps: MotionExportDeps = {
    createCanvas: vi.fn(() => canvas), createRecorder: vi.fn(() => recorder), isMimeSupported: () => true,
    createAudio: async () => null, now: () => now,
    requestFrame: (callback) => { const id = ++frame; frames.add(id); queueMicrotask(() => { if (frames.delete(id)) { now += 1000; callback(); } }); return id; },
    cancelFrame: (id) => { frames.delete(id); },
  };
  const base = createStudioAnimaticWorkspace([{ id: "p1" }], "episode-1");
  const hash = `sha256:${"a".repeat(64)}` as const;
  const snapshot = { ...base, artwork: [{ pageId: "p1", width: 720, height: 1280, documentWidth: 720, documentHeight: 1280, asset: { hash, bytes: 4, mime: "image/png" } }] };
  const request = { snapshot, images: new Map([[hash, {} as CanvasImageSource]]), audioBuffers: new Map<string, AudioBuffer>(), deps };
  return { request, deps, recorder, canvas, track, frames };
}

describe("storyboard video completion and resource cleanup", () => {
  it("collects the final encoded data and releases all frame, stream and canvas resources", async () => {
    const h = harness(), progress = vi.fn();
    const result = await exportStudioAnimaticVideo({ ...h.request, onProgress: progress });
    expect(result.size).toBe(3);
    expect(result.type).toBe(h.recorder.mimeType);
    expect(draw.mock.calls.length).toBeGreaterThan(2);
    expect(progress).toHaveBeenLastCalledWith(1);
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.canvas.width).toBe(1);
    expect(h.canvas.height).toBe(1);
    expect(h.frames.size).toBe(0);
  });
  it("rejects a later animation-frame drawing failure instead of leaving the export pending", async () => {
    const h = harness();
    draw.mockImplementationOnce(() => undefined).mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("lost bitmap"); });
    await expect(exportStudioAnimaticVideo(h.request)).rejects.toThrow("lost bitmap");
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.canvas.width).toBe(1);
    expect(h.frames.size).toBe(0);
  });
  it("releases the surface if drawing or capture fails before a stream exists", async () => {
    const h = harness();
    h.canvas.captureStream.mockImplementation(() => { throw new Error("capture unavailable"); });
    await expect(exportStudioAnimaticVideo(h.request)).rejects.toThrow("capture unavailable");
    expect(h.canvas.width).toBe(1);
    expect(h.canvas.height).toBe(1);
    expect(h.deps.createRecorder).not.toHaveBeenCalled();
  });
  it("honors cancellation during progress and leaves no running frame callback", async () => {
    const h = harness(), controller = new AbortController();
    await expect(exportStudioAnimaticVideo({ ...h.request, signal: controller.signal, onProgress: () => controller.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.frames.size).toBe(0);
  });
  it.each(["cancel", "hidden", "resume-race"] as const)("interrupts audio preparation on %s without recording after interruption", async (reason) => {
    const h = harness(), controller = new AbortController();
    let resume: () => void = () => undefined;
    const audio = {
      resume: vi.fn(() => new Promise<void>((resolve) => { resume = resolve; })),
      close: vi.fn(async () => undefined),
      createMediaStreamDestination: vi.fn(() => { throw new Error("resumed after export was interrupted"); }),
    };
    vi.stubGlobal("AudioContext", class { constructor() { return audio; } });
    const visibility = new EventTarget() as EventTarget & { visibilityState: string };
    visibility.visibilityState = "visible";
    vi.stubGlobal("document", visibility);
    const track = {
      id: "voice", name: "voice", asset: { hash: `sha256:${"b".repeat(64)}` as const, bytes: 20, mime: "audio/wav" },
      startMs: 0, durationMs: 1000, trimStartMs: 0, trimEndMs: 1000,
      volume: 1, muted: false, waveform: [],
    };
    let settlement: { error: unknown } | { blob: Blob } | undefined;
    const done = exportStudioAnimaticVideo({ ...h.request, signal: controller.signal,
      snapshot: { ...h.request.snapshot, audio: [track] },
    }).then((blob) => { settlement = { blob }; }, (error: unknown) => { settlement = { error }; });
    expect(audio.resume).toHaveBeenCalledOnce();
    if (reason === "resume-race") { resume(); await Promise.resolve(); }
    if (reason !== "hidden") controller.abort();
    else { visibility.visibilityState = "hidden"; visibility.dispatchEvent(new Event("visibilitychange")); }
    try {
      // Let promise/finally microtasks finish while the browser resume promise remains pending.
      for (let index = 0; index < 12; index++) await Promise.resolve();
      expect(settlement).toMatchObject({ error: reason !== "hidden"
        ? expect.objectContaining({ name: "AbortError" })
        : expect.objectContaining({ message: expect.stringContaining("화면이 숨겨져") }) });
      expect(audio.close).toHaveBeenCalledOnce();
      expect(h.track.stop).toHaveBeenCalledOnce();
      expect(h.canvas.width).toBe(1);
      expect(h.canvas.height).toBe(1);
      expect(h.frames.size).toBe(0);
      expect(h.deps.createRecorder).not.toHaveBeenCalled();
    } finally {
      // Release the fake browser operation even on failure; its late resolution must do nothing.
      resume(); await done;
    }
    expect(audio.createMediaStreamDestination).not.toHaveBeenCalled();
    expect(h.recorder.start).not.toHaveBeenCalled();
    expect(audio.close).toHaveBeenCalledOnce();
  });
  it("rejects an encoder error emitted synchronously from start", async () => {
    const h = harness();
    vi.mocked(h.recorder.start).mockImplementation(() => h.recorder.onerror?.(new Error("encoder unavailable")));
    await expect(exportStudioAnimaticVideo(h.request)).rejects.toThrow("인코딩");
    expect(h.track.stop).toHaveBeenCalledOnce();
  });
  it("rejects non-finite dimensions and uncaptured artwork before allocating a surface", async () => {
    const h = harness();
    await expect(exportStudioAnimaticVideo({ ...h.request, width: Number.NaN })).rejects.toThrow("가로·세로");
    await expect(exportStudioAnimaticVideo({ ...h.request, images: new Map() })).rejects.toThrow("모든 컷");
    expect(h.deps.createCanvas).not.toHaveBeenCalled();
  });
});
