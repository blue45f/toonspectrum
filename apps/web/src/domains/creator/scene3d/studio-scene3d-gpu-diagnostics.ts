/** One on-demand GPU render-submission sample; no engine imports or document writes.
 * Three's lastValue can be stale after mapping failure. Only fresh context timestamps count.
 * The private pool contract is isolated here and covered by pin/browser verification.
 */
export type GpuDiagnosticReason = "not-mounted" | "unsupported" | "other-profiler"
  | "paused" | "waiting-for-frame" | "reading-gpu" | "no-fresh-timestamps"
  | "render-failed" | "readback-failed" | "timed-out";
export interface StudioScene3dGpuSample {
  readonly gpuPassTotalMs: number;
  readonly cpuSubmitMs: number;
  readonly passCount: number;
  readonly width: number;
  readonly height: number;
}
export interface StudioScene3dGpuDiagnosticSnapshot {
  readonly reason: GpuDiagnosticReason | null;
  readonly canRequest: boolean;
  readonly busy: boolean;
  readonly sample: StudioScene3dGpuSample | null;
}
export interface StudioScene3dGpuDiagnostics {
  getSnapshot(): StudioScene3dGpuDiagnosticSnapshot;
  subscribe(listener: () => void): () => void;
  attach(renderer: unknown, invalidate: () => void): () => void;
  setPaused(paused: boolean): void;
  request(): void;
  cancel(): void;
}
type Render = (...args: unknown[]) => unknown;
interface QueryPool {
  queryOffsets: Map<string, number>;
  timestamps: Map<string, number>;
  currentQueryIndex: number;
  pendingResolve: unknown;
  isDisposed: boolean;
  trackTimestamp: boolean;
}
interface Renderer {
  render: Render;
  getRenderTarget(): unknown;
  domElement: { width: number; height: number };
  backend: {
    isWebGPUBackend: true;
    trackTimestamp: boolean;
    device: { features: { has(feature: string): boolean } };
    timestampQueryPool: { render?: QueryPool | null };
    resolveTimestampsAsync(type: "render"): Promise<unknown>;
  };
}
interface Binding { renderer: Renderer; invalidate(): void }
interface Operation {
  binding: Binding; original: Render; wrapper: Render; hadOwnRender: boolean;
  timer: ReturnType<typeof setTimeout> | null; submitted: boolean;
  cancelled: boolean; timedOut: boolean;
}
const owners = new WeakMap<object, Operation>();
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";
function supported(value: unknown): value is Renderer {
  if (!record(value) || !record(value.backend)) return false;
  const b = value.backend;
  if (b.isWebGPUBackend !== true || !record(b.device) || !record(b.device.features)
    || typeof b.device.features.has !== "function" || !record(b.timestampQueryPool)
    || typeof b.trackTimestamp !== "boolean" || typeof b.resolveTimestampsAsync !== "function"
    || typeof value.render !== "function" || typeof value.getRenderTarget !== "function"
    || !record(value.domElement)) return false;
  try { return b.device.features.has("timestamp-query") === true; } catch { return false; }
}
function validPool(value: unknown): value is QueryPool {
  return record(value) && value.queryOffsets instanceof Map && value.timestamps instanceof Map
    && Number.isSafeInteger(value.currentQueryIndex) && typeof value.isDisposed === "boolean"
    && typeof value.trackTimestamp === "boolean";
}
function availability(renderer: Renderer, allowed?: Operation): GpuDiagnosticReason | null {
  if (!supported(renderer)) return "unsupported";
  if (renderer.backend.trackTimestamp || (owners.has(renderer) && owners.get(renderer) !== allowed)) return "other-profiler";
  const p = renderer.backend.timestampQueryPool.render;
  if (p === undefined || p === null) return null; // Three allocates lazily on first measured submission.
  if (!validPool(p) || p.isDisposed || !p.trackTimestamp) return "unsupported";
  return p.pendingResolve || p.currentQueryIndex !== 0 || p.queryOffsets.size !== 0
    ? "other-profiler" : null;
}
export function createStudioScene3dGpuDiagnostics(): StudioScene3dGpuDiagnostics {
  let binding: Binding | null = null;
  let generation = 0;
  let paused = false;
  let operation: Operation | null = null;
  let snapshot: StudioScene3dGpuDiagnosticSnapshot = Object.freeze({
    reason: "not-mounted", canRequest: false, busy: false, sample: null,
  });
  const listeners = new Set<() => void>();
  const publish = (reason: GpuDiagnosticReason | null, sample: StudioScene3dGpuSample | null = null) => {
    const blocked = !binding || paused || availability(binding.renderer) !== null;
    snapshot = Object.freeze({ reason, sample, busy: operation !== null,
      canRequest: !operation && !blocked });
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* A UI observer must not interrupt rendering or cleanup. */ }
    }
  };
  const refresh = () => publish(!binding ? "not-mounted" : paused ? "paused" : availability(binding.renderer));
  const restore = (op: Operation) => {
    if (op.binding.renderer.render === op.wrapper) {
      if (op.hadOwnRender) op.binding.renderer.render = op.original;
      else Reflect.deleteProperty(op.binding.renderer, "render");
    }
  };
  const clearTimer = (op: Operation) => {
    if (op.timer !== null) clearTimeout(op.timer);
    op.timer = null;
  };
  const release = (op: Operation) => {
    clearTimer(op); restore(op);
    if (owners.get(op.binding.renderer) === op) owners.delete(op.binding.renderer);
    if (operation === op) operation = null;
  };
  const settle = (op: Operation, reason: GpuDiagnosticReason | null, sample: StudioScene3dGpuSample | null = null) => {
    const current = binding === op.binding && operation === op;
    release(op);
    if (!current) return;
    if (op.timedOut) publish("timed-out");
    else if (op.cancelled) refresh();
    else publish(reason, sample);
  };
  const cancel = () => {
    if (!operation) return;
    const op = operation;
    op.cancelled = true;
    clearTimer(op); restore(op);
    // An in-flight GPU mapping remains exclusive until settlement; never dispose its renderer pool.
    if (!op.submitted) release(op);
    if (op.submitted) publish("reading-gpu"); else refresh();
  };
  const request = () => {
    if (operation) return;
    if (!binding || paused || availability(binding.renderer)) { refresh(); return; }
    const b = binding;
    const renderer = b.renderer;
    const original = renderer.render;
    const op: Operation = { binding: b, original, wrapper: original,
      hadOwnRender: Object.hasOwn(renderer, "render"), timer: null,
      submitted: false, cancelled: false, timedOut: false };
    const wrapper: Render = function (this: unknown, ...args: unknown[]): unknown {
      if (this !== renderer || op.submitted || op.cancelled || operation !== op) {
        return Reflect.apply(original, this, args);
      }
      if (paused || renderer.getRenderTarget() !== null) return Reflect.apply(original, this, args);
      const unavailable = availability(renderer, op);
      if (unavailable) { settle(op, unavailable); return Reflect.apply(original, this, args); }
      op.submitted = true;
      const backend = renderer.backend;
      backend.trackTimestamp = true;
      const start = performance.now();
      let result: unknown;
      let cpuSubmitMs: number;
      try {
        result = Reflect.apply(original, this, args);
        cpuSubmitMs = performance.now() - start;
      } catch (error) {
        backend.trackTimestamp = false;
        settle(op, "render-failed");
        throw error; // Do not hide a real renderer error behind diagnostics.
      }
      restore(op);
      const pool = backend.timestampQueryPool.render;
      const keys = validPool(pool) ? [...pool.queryOffsets.keys()] : [];
      const fresh = validPool(pool) && !pool.isDisposed && !pool.pendingResolve
        && keys.length > 0 && keys.length <= 1_024 && keys.length * 2 === pool.currentQueryIndex
        && keys.every((key) => typeof key === "string" && !pool.timestamps.has(key));
      let resolving: Promise<unknown>;
      try { resolving = Promise.resolve(backend.resolveTimestampsAsync("render")); }
      catch (error) { resolving = Promise.reject(error); }
      finally { backend.trackTimestamp = false; }
      const dimensions = { width: renderer.domElement.width, height: renderer.domElement.height };
      const cleanup = () => {
        // Upstream retains frame keys. Remove only fresh keys belonging to this sample.
        if (fresh && pool) for (const key of keys) pool.timestamps.delete(key);
      };
      void resolving.then(() => {
        const times = fresh && pool && !pool.isDisposed && pool.currentQueryIndex === 0
          && pool.queryOffsets.size === 0 ? keys.map((key) => pool.timestamps.get(key)) : [];
        cleanup();
        if (times.length === 0 || times.some((time) => typeof time !== "number"
          || !Number.isFinite(time) || time < 0) || !Number.isFinite(cpuSubmitMs) || cpuSubmitMs < 0) {
          settle(op, "no-fresh-timestamps"); return;
        }
        const gpuPassTotalMs = (times as number[]).reduce((sum, time) => sum + time, 0);
        if (!Number.isFinite(gpuPassTotalMs)) { settle(op, "no-fresh-timestamps"); return; }
        settle(op, null, Object.freeze({ gpuPassTotalMs, cpuSubmitMs, passCount: keys.length, ...dimensions }));
      }, () => { cleanup(); settle(op, "readback-failed"); });
      if (binding === b && operation === op && !op.cancelled) publish("reading-gpu");
      return result;
    };
    op.wrapper = wrapper;
    operation = op;
    owners.set(renderer, op);
    try { renderer.render = wrapper; }
    catch { settle(op, "unsupported"); return; }
    op.timer = setTimeout(() => {
      if (operation !== op) return;
      op.cancelled = true; op.timedOut = true;
      restore(op);
      if (!op.submitted) release(op);
      publish("timed-out");
    }, 5_000);
    publish("waiting-for-frame");
    if (operation === op && !op.cancelled) {
      try { b.invalidate(); } catch { settle(op, "render-failed"); }
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    request, cancel,
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      if (paused) cancel();
      if (!operation) refresh();
    },
    attach(value, invalidate) {
      cancel();
      const currentGeneration = ++generation;
      operation = null; // Old readbacks retain their renderer-local lease until settlement.
      binding = supported(value) ? { renderer: value, invalidate } : null;
      if (!binding) publish("unsupported"); else refresh();
      return () => {
        if (generation !== currentGeneration) return;
        cancel();
        binding = null; operation = null;
        refresh();
      };
    },
  };
}
