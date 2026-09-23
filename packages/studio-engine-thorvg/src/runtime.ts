import {
  THORVG_WEB_VERSION,
  auditThorvgLottie,
  auditThorvgSvg,
  thorvgProviderId,
  type ThorvgBackend,
  type ThorvgLottieAudit,
  type ThorvgProviderId,
  type ThorvgSvgAudit,
} from "./audit";

import type {
  AnimationInfo,
  RendererType,
  ThorVGNamespace,
} from "@thorvg/webcanvas";

type ThorvgModule = typeof import("@thorvg/webcanvas");
type ThorvgModuleLoader = () => Promise<ThorvgModule>;

const loadThorvgModule: ThorvgModuleLoader = () => import("@thorvg/webcanvas");

export const THORVG_WASM_URL = new URL("../wasm/thorvg.wasm", import.meta.url).href;

export class ThorvgBackendConflictError extends Error {
  constructor(
    readonly activeBackend: ThorvgBackend,
    readonly requestedBackend: ThorvgBackend,
  ) {
    super(
      `ThorVG backend ${activeBackend} is already active; `
      + `the immutable ${requestedBackend} request was rejected`,
    );
    this.name = "ThorvgBackendConflictError";
  }
}

interface ThorvgRuntimeState {
  readonly backend: ThorvgBackend;
  readonly promise: Promise<ThorVGNamespace>;
  references: number;
}

let runtimeState: ThorvgRuntimeState | null = null;
let canvasSequence = 0;

export interface ThorvgRuntimeLease {
  readonly backend: ThorvgBackend;
  readonly providerId: ThorvgProviderId;
  readonly namespace: ThorVGNamespace;
  release(): void;
}

export interface AcquireThorvgRuntimeOptions {
  readonly backend: ThorvgBackend;
  readonly wasmUrl?: string;
  readonly loadModule?: ThorvgModuleLoader;
}

/**
 * Acquires the process-global ThorVG engine. WebCanvas exposes global initialization, so an active
 * backend is immutable until every surface releases it. A conflicting request fails closed rather
 * than terminating or silently replacing the live engine.
 */
export async function acquireThorvgRuntime(
  options: AcquireThorvgRuntimeOptions,
): Promise<ThorvgRuntimeLease> {
  const { backend } = options;
  if (runtimeState && runtimeState.backend !== backend) {
    throw new ThorvgBackendConflictError(runtimeState.backend, backend);
  }
  if (!runtimeState) {
    const loadModule = options.loadModule ?? loadThorvgModule;
    const wasmUrl = options.wasmUrl ?? THORVG_WASM_URL;
    const next: ThorvgRuntimeState = {
      backend,
      references: 0,
      promise: loadModule()
        .then((module) => module.default.init({
          renderer: backend as RendererType,
          threads: 0,
          locateFile: (path) => path.endsWith(".wasm") ? wasmUrl : path,
        })),
    };
    runtimeState = next;
    void next.promise.catch(() => {
      if (runtimeState === next && next.references === 0) runtimeState = null;
    });
  }

  const state = runtimeState;
  let namespace: ThorVGNamespace;
  try {
    namespace = await state.promise;
  } catch (error) {
    if (runtimeState === state && state.references === 0) runtimeState = null;
    throw error;
  }
  if (runtimeState !== state) {
    namespace.term();
    throw new Error("ThorVG runtime ownership changed during initialization");
  }
  state.references += 1;
  let released = false;
  return Object.freeze({
    backend,
    providerId: thorvgProviderId(backend),
    namespace,
    release() {
      if (released) return;
      released = true;
      if (runtimeState !== state) return;
      state.references = Math.max(0, state.references - 1);
      if (state.references === 0) {
        runtimeState = null;
        namespace.term();
      }
    },
  });
}

export interface ThorvgSurfaceReceipt {
  readonly kind: "thorvg-surface-receipt";
  readonly engineVersion: typeof THORVG_WEB_VERSION;
  readonly selectedProviderId: ThorvgProviderId;
  readonly attemptedProviderId: ThorvgProviderId;
  readonly activeProviderId: ThorvgProviderId;
  readonly backend: ThorvgBackend;
  readonly assetKind: "svg" | "lottie";
  readonly width: number;
  readonly height: number;
  readonly audit: ThorvgSvgAudit | ThorvgLottieAudit;
  readonly cpuReadbackBytes: 0;
}

export interface ThorvgMountedSurface {
  readonly receipt: ThorvgSurfaceReceipt;
  animationInfo(): AnimationInfo | null;
  renderFrame(frame: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export interface MountThorvgAssetOptions {
  readonly canvas: HTMLCanvasElement;
  readonly kind: "svg" | "lottie";
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly backend: ThorvgBackend;
  readonly initialFrame?: number;
  readonly wasmUrl?: string;
  readonly loadModule?: ThorvgModuleLoader;
}

/** Mounts exactly one preselected ThorVG provider and never attempts another renderer. */
export async function mountThorvgAsset(
  options: MountThorvgAssetOptions,
): Promise<ThorvgMountedSurface> {
  const audit = options.kind === "svg"
    ? auditThorvgSvg(options.source, options.width, options.height)
    : auditThorvgLottie(options.source);
  const lease = await acquireThorvgRuntime({
    backend: options.backend,
    wasmUrl: options.wasmUrl,
    loadModule: options.loadModule,
  });
  const previousId = options.canvas.id;
  const id = `studio-thorvg-${++canvasSequence}`;
  options.canvas.id = id;

  let canvas: InstanceType<ThorVGNamespace["Canvas"]> | null = null;
  let picture: InstanceType<ThorVGNamespace["Picture"]> | null = null;
  let mountedPicture: InstanceType<ThorVGNamespace["Picture"]> | null = null;
  let animation: InstanceType<ThorVGNamespace["Animation"]> | null = null;

  const releaseSurfaceResources = (): void => {
    if (canvas && mountedPicture) {
      try {
        canvas.remove(mountedPicture);
      } catch {
        // The selected backend may already have invalidated its canvas.
      }
    }
    try {
      animation?.dispose();
      picture?.dispose();
    } finally {
      animation = null;
      picture = null;
      mountedPicture = null;
      canvas?.destroy();
      canvas = null;
    }
  };

  try {
    canvas = new lease.namespace.Canvas(`#${id}`, {
      width: options.width,
      height: options.height,
      enableDevicePixelRatio: false,
    });
    if (options.kind === "svg") {
      picture = new lease.namespace.Picture();
      picture.load(options.source, { type: "svg" }).size(options.width, options.height);
      mountedPicture = picture;
      canvas.add(mountedPicture).render();
    } else {
      animation = new lease.namespace.Animation();
      animation.load(options.source);
      const ownedPicture = animation.picture;
      if (!ownedPicture) throw new Error("ThorVG Lottie animation has no picture");
      ownedPicture.size(options.width, options.height);
      mountedPicture = ownedPicture;
      const info = animation.info();
      const requestedFrame = options.initialFrame ?? 0;
      const lastFrame = Math.max(0, (info?.totalFrames ?? 1) - 1);
      animation.frame(Math.min(lastFrame, Math.max(0, requestedFrame)));
      canvas.add(mountedPicture).update().render();
    }
  } catch (error) {
    try {
      releaseSurfaceResources();
    } finally {
      if (options.canvas.id === id) options.canvas.id = previousId;
      lease.release();
    }
    throw error;
  }

  const providerId = lease.providerId;
  let destroyed = false;
  const receipt: ThorvgSurfaceReceipt = Object.freeze({
    kind: "thorvg-surface-receipt" as const,
    engineVersion: THORVG_WEB_VERSION,
    selectedProviderId: providerId,
    attemptedProviderId: providerId,
    activeProviderId: providerId,
    backend: options.backend,
    assetKind: options.kind,
    width: options.width,
    height: options.height,
    audit,
    cpuReadbackBytes: 0 as const,
  });
  return Object.freeze({
    receipt,
    animationInfo: () => animation?.info() ?? null,
    renderFrame(frame: number) {
      if (destroyed || !animation || !canvas) return;
      const info = animation.info();
      const lastFrame = Math.max(0, (info?.totalFrames ?? 1) - 1);
      animation.frame(Math.min(lastFrame, Math.max(0, frame)));
      canvas.update().render();
    },
    resize(width: number, height: number) {
      if (destroyed || !canvas) return;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new RangeError(`invalid ThorVG surface size: ${width}x${height}`);
      }
      canvas.resize(width, height).update().render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        releaseSurfaceResources();
      } finally {
        if (options.canvas.id === id) options.canvas.id = previousId;
        lease.release();
      }
    },
  });
}

export function thorvgRuntimeSnapshot(): Readonly<{
  backend: ThorvgBackend | null;
  references: number;
}> {
  return Object.freeze({
    backend: runtimeState?.backend ?? null,
    references: runtimeState?.references ?? 0,
  });
}

/** Test-only emergency cleanup for injected runtimes. */
export async function resetThorvgRuntimeForTests(): Promise<void> {
  const state = runtimeState;
  runtimeState = null;
  if (!state) return;
  try {
    const namespace = await state.promise;
    namespace.term();
  } catch {
    // Failed initialization owns no usable runtime.
  }
}
