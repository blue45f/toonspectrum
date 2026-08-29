/**
 * Production Three WebGPU renderer factory for the Studio 3D background editor.
 *
 * This is the next-generation counterpart to the editor's long-standing `THREE.WebGLRenderer`
 * path. Callers reach it only through `studio-bg3d-three-webgpu-entry`, which is imported
 * dynamically after {@link probeStudioBg3dWebGpuCapability} admits the host and the
 * engine-selection policy chooses `webgpu`. The `three/webgpu` import is therefore static on
 * purpose: it belongs to that lazy entry's closure, where the bundle audit can prove the WebGL
 * editor never downloads it, and a nested dynamic import would only add a round trip.
 *
 * Three's `WebGPURenderer` silently installs a WebGL2 fallback when device creation fails. That is
 * the wrong behaviour for an editor that reports its active engine to the artist and keeps a
 * per-session failure counter: a renderer advertised as WebGPU must either be WebGPU or fail. The
 * factory therefore removes the fallback hook, asserts the backend brand after `init()`, and tears
 * down any partially constructed device before rethrowing.
 */

import { WebGPURenderer } from "three/webgpu";

import {
  STUDIO_BG3D_WEBGPU_MIN_BUFFER_SIZE,
  STUDIO_BG3D_WEBGPU_MIN_STORAGE_BINDING_SIZE,
} from "./studio-bg3d-webgpu-capability";

export type StudioBg3dWebGpuRendererErrorCode =
  | "invalid-canvas"
  | "version-contract-unsupported"
  | "initialization-failed"
  | "backend-unavailable";

export class StudioBg3dWebGpuRendererError extends Error {
  readonly code: StudioBg3dWebGpuRendererErrorCode;

  constructor(code: StudioBg3dWebGpuRendererErrorCode, cause?: unknown) {
    super(`Studio BG3D WebGPU renderer failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = "StudioBg3dWebGpuRendererError";
    this.code = code;
  }
}

export type StudioBg3dWebGpuDeviceLossReason = "destroyed" | "unknown";

export interface StudioBg3dWebGpuDeviceLoss {
  readonly reason: StudioBg3dWebGpuDeviceLossReason;
  readonly message: string;
}

export interface CreateStudioBg3dThreeWebGpuRendererOptions {
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  /**
   * Called once if the GPU device is lost while the renderer is alive. The editor uses this to
   * record a session failure and fall back to WebGL2 without waiting for the next frame to throw.
   * A device destroyed by our own `dispose()` never reports.
   */
  readonly onDeviceLost?: (loss: StudioBg3dWebGpuDeviceLoss) => void;
}

export interface StudioBg3dThreeWebGpuRuntime {
  readonly renderer: WebGPURenderer;
  dispose(): Promise<void>;
}

interface ThreeWebGpuBackendLifecycle {
  readonly isWebGPUBackend?: unknown;
  readonly parameters?: { readonly device?: unknown };
  readonly device?: {
    destroy?: () => void;
    readonly lost?: PromiseLike<{ readonly reason?: unknown; readonly message?: unknown }>;
  } | null;
  dispose?: () => void;
}

interface ThreeWebGpuRendererLifecycle {
  /** Three r184's WebGPURenderer installs a WebGL fallback internally. Production forbids it. */
  _getFallback: null | ((error: unknown) => unknown);
  readonly backend: ThreeWebGpuBackendLifecycle;
}

function disposeRejectedThreeWebGpuInitialization(backend: ThreeWebGpuBackendLifecycle): void {
  try {
    backend.dispose?.();
  } catch {
    // Three's public Renderer.dispose() calls async setAnimationLoop(), which retries a rejected
    // init promise when initialization never completed. Tear the owned backend down directly.
    if (backend.parameters?.device === undefined) {
      try {
        backend.device?.destroy?.();
      } catch {
        // Best-effort cleanup must not replace the original initialization error.
      }
    }
  }
}

function normalizeDeviceLoss(info: {
  readonly reason?: unknown;
  readonly message?: unknown;
}): StudioBg3dWebGpuDeviceLoss {
  const reason: StudioBg3dWebGpuDeviceLossReason = info?.reason === "destroyed" ? "destroyed" : "unknown";
  const message = typeof info?.message === "string" && info.message.length > 0
    ? info.message.slice(0, 240)
    : "WebGPU 디바이스 연결이 끊어졌습니다.";
  return Object.freeze({ reason, message });
}

/**
 * Observes `GPUDevice.lost` without letting a rejected or never-settling promise leak. `lost`
 * resolves (it does not reject) on every conforming implementation, but the editor must not depend
 * on that for correctness.
 */
function observeDeviceLoss(
  backend: ThreeWebGpuBackendLifecycle,
  isDisposed: () => boolean,
  onDeviceLost: (loss: StudioBg3dWebGpuDeviceLoss) => void,
): void {
  const lost = backend.device?.lost;
  if (!lost || typeof lost.then !== "function") return;
  void Promise.resolve(lost).then(
    (info) => {
      if (isDisposed()) return;
      onDeviceLost(normalizeDeviceLoss(info ?? {}));
    },
    () => {
      if (isDisposed()) return;
      onDeviceLost(normalizeDeviceLoss({}));
    },
  );
}

/**
 * Creates an initialized, verified WebGPU renderer bound to `canvas`.
 *
 * Callers must probe first; this factory does not re-probe, because R3F needs the renderer within
 * one asynchronous `gl` factory call and a second adapter request would double the cold-start cost.
 */
export async function createStudioBg3dThreeWebGpuRenderer(
  canvas: HTMLCanvasElement,
  options: CreateStudioBg3dThreeWebGpuRendererOptions = {},
): Promise<StudioBg3dThreeWebGpuRuntime> {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new StudioBg3dWebGpuRendererError("invalid-canvas");
  }
  const renderer = new WebGPURenderer({
    canvas,
    antialias: options.antialias ?? true,
    alpha: options.alpha ?? true,
    powerPreference: "high-performance",
    requiredLimits: {
      maxBufferSize: STUDIO_BG3D_WEBGPU_MIN_BUFFER_SIZE,
      maxStorageBufferBindingSize: STUDIO_BG3D_WEBGPU_MIN_STORAGE_BINDING_SIZE,
    },
  });
  const lifecycle = renderer as unknown as ThreeWebGpuRendererLifecycle;
  const initializationBackend = lifecycle.backend;
  if (typeof lifecycle._getFallback !== "function") {
    disposeRejectedThreeWebGpuInitialization(initializationBackend);
    throw new StudioBg3dWebGpuRendererError("version-contract-unsupported");
  }
  // A runtime advertised as WebGPU must fail closed instead of quietly becoming WebGL2, so the
  // engine-selection policy — not Three — owns the fallback decision.
  lifecycle._getFallback = null;
  try {
    await renderer.init();
  } catch (error) {
    disposeRejectedThreeWebGpuInitialization(initializationBackend);
    throw new StudioBg3dWebGpuRendererError("initialization-failed", error);
  }
  if (lifecycle.backend.isWebGPUBackend !== true) {
    await renderer.dispose();
    throw new StudioBg3dWebGpuRendererError("backend-unavailable");
  }
  let disposed = false;
  if (options.onDeviceLost) {
    observeDeviceLoss(lifecycle.backend, () => disposed, options.onDeviceLost);
  }
  return Object.freeze({
    renderer,
    async dispose() {
      if (disposed) return;
      disposed = true;
      await renderer.dispose();
    },
  });
}
