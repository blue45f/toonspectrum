import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioScene3dGpuDiagnostics } from "./studio-scene3d-gpu-diagnostics";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.useRealTimers(); });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function harness() {
  const state = { target: null as unknown, mode: "ok", frame: 0, gate: null as Promise<void> | null };
  const pool = { queryOffsets: new Map<string, number>(), timestamps: new Map<string, number>(),
    currentQueryIndex: 0, pendingResolve: false, isDisposed: false, trackTimestamp: true };
  const backend = { isWebGPUBackend: true, trackTimestamp: false,
    device: { features: new Set(["timestamp-query"]) }, timestampQueryPool: { render: pool } as { render: typeof pool | null },
    resolveTimestampsAsync: vi.fn(async () => {
      expect(backend.trackTimestamp).toBe(true);
      pool.pendingResolve = true;
      if (state.gate) await state.gate;
      pool.pendingResolve = false;
      if (state.mode === "reject") throw new Error("device lost");
      if (state.mode === "stale") return 99;
      for (const [key, offset] of pool.queryOffsets) {
        pool.timestamps.set(key, state.mode === "nan" ? Number.NaN : (offset / 2 + 1) * 1.25);
      }
      pool.queryOffsets.clear(); pool.currentQueryIndex = 0;
      return 999; // This scalar must never be displayed.
    }),
  };
  const original = vi.fn(() => {
    if (state.mode === "render-fail") throw new Error("real render failure");
    if (!backend.trackTimestamp) return;
    backend.timestampQueryPool.render = pool;
    state.frame++;
    pool.queryOffsets.set(`shadow:${state.frame}`, 0);
    pool.queryOffsets.set(`beauty:${state.frame}`, 2);
    pool.currentQueryIndex = 4;
  });
  const renderer = { backend, render: original, getRenderTarget: () => state.target,
    domElement: { width: 640, height: 480 } };
  const diagnostics = createStudioScene3dGpuDiagnostics();
  const invalidate = vi.fn();
  const detach = diagnostics.attach(renderer, invalidate);
  cleanups.push(detach);
  return { diagnostics, renderer, backend, pool, original, invalidate, state, detach };
}
describe("Scene3D one-shot GPU diagnostics", () => {
  it("supports the real Three lazy null query pool", async () => {
    const h = harness(); h.backend.timestampQueryPool.render = null;
    h.diagnostics.request(); h.renderer.render(); await flush();
    expect(h.diagnostics.getSnapshot().sample?.gpuPassTotalMs).toBe(3.75);
  });
  it("does nothing until requested, reads fresh pass totals, and restores the renderer", async () => {
    const h = harness();
    expect(h.renderer.render).toBe(h.original);
    expect(h.backend.trackTimestamp).toBe(false);
    h.diagnostics.request(); h.renderer.render(); await flush();
    expect(h.diagnostics.getSnapshot().sample).toMatchObject({
      gpuPassTotalMs: 3.75, passCount: 2, width: 640, height: 480,
    });
    expect(h.renderer.render).toBe(h.original);
    expect(h.backend.trackTimestamp).toBe(false);
    expect(h.pool.timestamps.size).toBe(0);
    for (let i = 0; i < 12; i++) { h.diagnostics.request(); h.renderer.render(); await flush(); }
    expect(h.pool.timestamps.size).toBe(0);
    expect(h.diagnostics.getSnapshot().canRequest).toBe(true);
  });
  it.each(["stale", "nan", "reject"])("never publishes invalid %s timing", async (mode) => {
    const h = harness(); h.state.mode = mode;
    h.diagnostics.request(); h.renderer.render(); await flush();
    expect(h.diagnostics.getSnapshot().sample).toBeNull();
    expect(h.diagnostics.getSnapshot().reason).not.toBeNull();
    expect(h.backend.trackTimestamp).toBe(false);
    expect(h.renderer.render).toBe(h.original);
  });
  it("preserves unrelated timestamps and rejects reused context values", async () => {
    const h = harness(); h.pool.timestamps.set("foreign", 12);
    h.pool.timestamps.set("beauty:1", 50);
    h.diagnostics.request(); h.renderer.render(); await flush();
    expect(h.diagnostics.getSnapshot().sample).toBeNull();
    expect(h.pool.timestamps.get("foreign")).toBe(12);
  });
  it("does not measure captures or paused rendering", async () => {
    const h = harness(); h.state.target = {};
    h.diagnostics.request(); h.renderer.render();
    expect(h.backend.resolveTimestampsAsync).not.toHaveBeenCalled();
    h.diagnostics.setPaused(true);
    expect(h.renderer.render).toBe(h.original);
    h.diagnostics.setPaused(false); h.state.target = null;
    h.diagnostics.request(); h.renderer.render(); await flush();
    expect(h.diagnostics.getSnapshot().sample).not.toBeNull();
  });
  it("rejects unsupported devices and foreign profilers without changing their flags", () => {
    const h = harness(); h.backend.trackTimestamp = true;
    h.diagnostics.request();
    expect(h.diagnostics.getSnapshot().reason).toBe("other-profiler");
    expect(h.renderer.render).toBe(h.original);
    expect(h.backend.trackTimestamp).toBe(true);
    h.backend.trackTimestamp = false; h.backend.device.features.clear();
    h.diagnostics.request();
    expect(h.diagnostics.getSnapshot().reason).toBe("unsupported");
    const d = createStudioScene3dGpuDiagnostics();
    d.attach({ isWebGLRenderer: true }, vi.fn());
    expect(d.getSnapshot().canRequest).toBe(false);
  });
  it("holds exclusivity until a cancelled mapping actually settles", async () => {
    const h = harness(); let finish!: () => void;
    h.state.gate = new Promise<void>((resolve) => { finish = resolve; });
    h.diagnostics.request(); h.renderer.render(); h.diagnostics.cancel();
    h.diagnostics.request();
    expect(h.backend.resolveTimestampsAsync).toHaveBeenCalledTimes(1);
    expect(h.diagnostics.getSnapshot().canRequest).toBe(false);
    finish(); await flush();
    expect(h.diagnostics.getSnapshot().sample).toBeNull();
    expect(h.diagnostics.getSnapshot().canRequest).toBe(true);
    expect(h.pool.timestamps.size).toBe(0);
  });
  it("bounds the wait for a screen submission and releases its wrapper", () => {
    vi.useFakeTimers(); const h = harness(); h.diagnostics.request();
    vi.advanceTimersByTime(5_001);
    expect(h.diagnostics.getSnapshot()).toMatchObject({ reason: "timed-out", busy: false });
    expect(h.renderer.render).toBe(h.original);
  });
  it("times out readback without launching unbounded new mappings", async () => {
    vi.useFakeTimers(); const h = harness(); let finish!: () => void;
    h.state.gate = new Promise<void>((resolve) => { finish = resolve; });
    h.diagnostics.request(); h.renderer.render(); vi.advanceTimersByTime(5_001);
    expect(h.diagnostics.getSnapshot()).toMatchObject({ reason: "timed-out", busy: true, canRequest: false });
    h.diagnostics.request(); expect(h.backend.resolveTimestampsAsync).toHaveBeenCalledTimes(1);
    finish(); await flush();
    expect(h.diagnostics.getSnapshot()).toMatchObject({ reason: "timed-out", busy: false, sample: null });
  });
  it("does not hide rendering errors and cannot be broken by an observer", () => {
    const h = harness(); h.state.mode = "render-fail";
    h.diagnostics.subscribe(() => { throw new Error("observer"); });
    h.diagnostics.request();
    expect(() => h.renderer.render()).toThrow("real render failure");
    expect(h.renderer.render).toBe(h.original);
    expect(h.backend.trackTimestamp).toBe(false);
    expect(h.diagnostics.getSnapshot().reason).toBe("render-failed");
  });
  it("drops old readbacks after detach and leaves a new renderer untouched", async () => {
    const h = harness(); let finish!: () => void;
    h.state.gate = new Promise<void>((resolve) => { finish = resolve; });
    h.diagnostics.request(); h.renderer.render(); h.detach();
    const newer = harness();
    const unbind = h.diagnostics.attach(newer.renderer, newer.invalidate);
    const before = h.diagnostics.getSnapshot();
    h.detach(); // Old effect cleanup cannot detach a newer binding.
    finish(); await flush();
    expect(h.diagnostics.getSnapshot()).toBe(before);
    expect(h.pool.timestamps.size).toBe(0);
    unbind();
  });
  it("restores an inherited render method instead of retaining an instance override", async () => {
    const h = harness();
    const renderer = Object.create({ render: h.original });
    Object.assign(renderer, { backend: h.backend, getRenderTarget: h.renderer.getRenderTarget,
      domElement: h.renderer.domElement });
    const detach = h.diagnostics.attach(renderer, h.invalidate);
    h.diagnostics.request(); renderer.render(); await flush();
    expect(Object.hasOwn(renderer, "render")).toBe(false);
    expect(h.diagnostics.getSnapshot().sample?.gpuPassTotalMs).toBe(3.75);
    detach();
  });
});
