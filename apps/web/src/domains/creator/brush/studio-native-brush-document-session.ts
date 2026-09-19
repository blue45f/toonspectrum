import { renderStudioNativeBrushDocumentOnClient } from "./studio-native-brush-document-product";
import { createStudioNativeBrushProbeClient } from "./studio-native-brush-probe-client";

import type { StudioNativeBrushDocumentPlan, StudioNativeBrushDocumentResult } from "./studio-native-brush-document-contract";
import type { StudioNativeBrushDocumentClientPort } from "./studio-native-brush-document-product";
import type { NativeBrushProbeEngine } from "./studio-native-brush-probe-contract";

export const NATIVE_BRUSH_SESSION_IDLE_MS = 15_000;
export const NATIVE_BRUSH_SESSION_LIFETIME_MS = 120_000;
export const NATIVE_BRUSH_SESSION_MAX_OPERATIONS = 32;

interface SessionOptions {
  readonly createClient?: () => StudioNativeBrushDocumentClientPort;
  /** Tests may shorten, never extend, the product retention bound. */
  readonly idleMs?: number;
  readonly now?: () => number;
}
interface Lease {
  readonly client: StudioNativeBrushDocumentClientPort;
  readonly engine: NativeBrushProbeEngine;
  readonly createdAt: number;
  completed: number;
  idleUntil: number;
}
function cancelled(): DOMException { return new DOMException("네이티브 브러시 세션을 종료했습니다.", "AbortError"); }

/**
 * One inspector, at most one selected Worker, one active operation. No global pool or prewarm.
 * Only successful operations keep a bounded lease; failure/cancel never retries in the same call.
 * Source snapshots/results are not cached by this class. GPU/WASM capacity can remain resident
 * until expiry; this is bounded reuse, not a claim of zero retained native memory.
 */
export class StudioNativeBrushDocumentSession {
  private lease: Lease | null = null;
  private active: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly createClient: () => StudioNativeBrushDocumentClientPort;
  private readonly now: () => number;
  private readonly idleMs: number;
  constructor(options: SessionOptions = {}) {
    this.idleMs = options.idleMs ?? NATIVE_BRUSH_SESSION_IDLE_MS;
    if (!Number.isSafeInteger(this.idleMs) || this.idleMs < 1 || this.idleMs > NATIVE_BRUSH_SESSION_IDLE_MS) {
      throw new RangeError("Native brush session idle bound must be 1–15000ms");
    }
    this.createClient = options.createClient ?? createStudioNativeBrushProbeClient;
    this.now = options.now ?? (() => performance.now());
  }
  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private release(): void {
    this.clearTimer();
    const previous = this.lease; this.lease = null;
    previous?.client.dispose();
  }
  private retain(lease: Lease): void {
    const remaining = Math.min(this.idleMs, lease.createdAt + NATIVE_BRUSH_SESSION_LIFETIME_MS - this.now());
    if (remaining <= 0 || lease.completed >= NATIVE_BRUSH_SESSION_MAX_OPERATIONS) { this.release(); return; }
    lease.idleUntil = this.now() + remaining;
    this.timer = setTimeout(() => {
      if (this.lease === lease && !this.active) this.release();
    }, remaining);
  }
  async render(plan: StudioNativeBrushDocumentPlan, signal: AbortSignal): Promise<StudioNativeBrushDocumentResult> {
    if (this.disposed || signal.aborted) throw cancelled();
    if (this.active) throw new Error("Native brush session already has an active conversion");
    const captured = structuredClone(plan);
    const controller = new AbortController(); this.active = controller;
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const current = this.lease;
      const time = this.now();
      if (current && (current.engine !== captured.engine || time >= current.idleUntil
        || time - current.createdAt >= NATIVE_BRUSH_SESSION_LIFETIME_MS
        || current.completed >= NATIVE_BRUSH_SESSION_MAX_OPERATIONS)) this.release();
      this.clearTimer();
      const initialize = this.lease === null;
      if (!this.lease) {
        this.lease = { client: this.createClient(), engine: captured.engine, createdAt: this.now(), completed: 0, idleUntil: Infinity };
      }
      const selected = this.lease;
      if (signal.aborted || this.disposed) controller.abort();
      const result = await renderStudioNativeBrushDocumentOnClient(captured, controller.signal, selected.client, initialize);
      if (controller.signal.aborted || this.disposed || this.lease !== selected) throw cancelled();
      selected.completed++;
      this.retain(selected);
      return result;
    } catch (error) {
      this.release();
      throw error;
    } finally {
      signal.removeEventListener("abort", onAbort);
      if (this.active === controller) this.active = null;
    }
  }
  /** Terminal for this owner. The next user action must create a new session explicitly. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active?.abort();
    this.release();
  }
}
