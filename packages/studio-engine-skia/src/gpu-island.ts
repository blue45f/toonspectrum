import { renderSceneToCanvas, type RenderOptions } from "./render";

import type { SceneIR } from "@toonspectrum/studio-project-model";
import type {
  CanvasKit,
  GrDirectContext,
  Surface,
  WebGLContextHandle,
} from "canvaskit-wasm";


/**
 * Skia CanvasKit GPU island (V13 §5.4).
 *
 * Interactive Skia completion never reads pixels back to JavaScript. The selected path is explicit:
 * OffscreenCanvas -> CanvasKit WebGL context -> on-screen GPU Surface -> ImageBitmap transport.
 * The helper that may fall back to a software surface is intentionally not used.
 */

export const SKIA_GPU_ISLAND_PROVIDER_ID = "skia-canvaskit-gpu" as const;

export interface SkiaGpuIslandRequest {
  readonly islandId: string;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  /** Renderer-neutral content. Brush paths can use the same SceneIR consumed by Vello. */
  readonly scene: SceneIR;
  readonly renderOptions?: RenderOptions;
}

export type SkiaGpuIslandResult =
  | {
      readonly status: "transferred";
      readonly islandId: string;
      readonly revision: number;
      readonly bitmap: ImageBitmap;
    }
  | {
      readonly status: "cached";
      readonly islandId: string;
      readonly revision: number;
    }
  | {
      readonly status: "unavailable";
      readonly reason: string;
    };

export interface SkiaGpuIslandBackend {
  render(request: SkiaGpuIslandRequest): Promise<SkiaGpuIslandResult>;
  dispose(): void;
}

export interface SkiaGpuIslandBackendOptions {
  /** Test/custom-host seam. Production lazily loads canvaskit-wasm when omitted. */
  readonly loadCanvasKit?: () => Promise<CanvasKit>;
}

interface LiveSurface {
  readonly ck: CanvasKit;
  readonly canvas: OffscreenCanvas;
  readonly gl: WebGLContextHandle;
  readonly context: GrDirectContext;
  readonly surface: Surface;
  readonly width: number;
  readonly height: number;
  readonly onContextLost: (event: Event) => void;
}

let defaultCanvasKitPromise: Promise<CanvasKit> | null = null;

async function loadDefaultCanvasKit(): Promise<CanvasKit> {
  if (!defaultCanvasKitPromise) {
    const pending = Promise.all([
      import("canvaskit-wasm"),
      import("canvaskit-wasm/bin/canvaskit.wasm?url"),
    ]).then(([module, wasm]) => module.default({
      locateFile: (file: string) => file.endsWith(".wasm") ? wasm.default : file,
    }));
    defaultCanvasKitPromise = pending;
    // A later explicitly-created backend can retry a failed initialization.
    void pending.catch(() => {
      if (defaultCanvasKitPromise === pending) defaultCanvasKitPromise = null;
    });
  }
  return defaultCanvasKitPromise;
}

export const SKIA_GPU_ISLAND_MAX_DIMENSION = 8_192;
export const SKIA_GPU_ISLAND_MAX_PIXELS = 16_777_216;

function unavailable(reason: string): SkiaGpuIslandResult {
  return { status: "unavailable", reason };
}

function validDimension(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function disposeSurface(current: LiveSurface | null): void {
  if (!current) return;
  current.canvas.removeEventListener("webglcontextlost", current.onContextLost);
  // Each allocation gets its own cleanup attempt, even after device/context loss.
  const cleanup = [
    () => current.surface.delete(),
    () => current.context.delete(),
    () => current.ck.deleteContext(current.gl),
  ];
  for (const release of cleanup) {
    try { release(); } catch { /* Preserve the original failure and release remaining resources. */ }
  }
}

function createGpuSurface(
  ck: CanvasKit,
  width: number,
  height: number,
  onContextLost: (event: Event) => void,
): LiveSurface | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(width, height);
  const gl = ck.GetWebGLContext(canvas, {
    alpha: 1, antialias: 0, depth: 0, stencil: 8,
    premultipliedAlpha: 1, preserveDrawingBuffer: 0, majorVersion: 2,
  });
  if (!Number.isSafeInteger(gl) || gl <= 0) return null;
  let context: GrDirectContext | null = null;
  let surface: Surface | null = null;
  try {
    context = ck.MakeWebGLContext(gl);
    if (!context) return null;
    surface = ck.MakeOnScreenGLSurface(context, width, height, ck.ColorSpace.SRGB);
    if (!surface) return null;
    canvas.addEventListener("webglcontextlost", onContextLost);
    return { ck, canvas, gl, context, surface, width, height, onContextLost };
  } finally {
    if (!surface) {
      try { context?.delete(); } finally { ck.deleteContext(gl); }
    }
  }
}

/**
 * Persistent CanvasKit WebGL surface for interactive renderer islands.
 *
 * No CPU fallback exists in this class. A failed WASM load, WebGL2 context, GrDirectContext,
 * SkSurface, SceneIR render or ImageBitmap transfer returns unavailable for this selected provider.
 * The caller keeps the previous presented texture and may choose another provider only for a later
 * operation/stroke boundary.
 */
export function createSkiaGpuIslandBackend(
  options: SkiaGpuIslandBackendOptions = {},
): SkiaGpuIslandBackend {
  const loadCanvasKit = options.loadCanvasKit ?? loadDefaultCanvasKit;
  let live: LiveSurface | null = null;
  let disposed = false;
  let failure: string | null = null;
  let last: SkiaGpuIslandRequest | null = null;
  let tail: Promise<void> = Promise.resolve();

  function resetSurface(): void {
    const previous = live;
    live = null;
    last = null;
    disposeSurface(previous);
  }
  function contextLost(event: Event): void {
    event.preventDefault();
    failure = "CanvasKit WebGL context was lost; create a new backend at the next operation boundary";
    last = null;
  }

  async function render(request: SkiaGpuIslandRequest): Promise<SkiaGpuIslandResult> {
    if (disposed) return unavailable("Skia GPU island backend is disposed");
    if (failure) return unavailable(failure);
    if (typeof OffscreenCanvas === "undefined") {
      return unavailable("OffscreenCanvas is required for the Skia GPU island bridge");
    }
    if (
      !request.scene || request.scene.version !== 11
      || !validDimension(request.width) || !validDimension(request.height)
      || request.width > SKIA_GPU_ISLAND_MAX_DIMENSION || request.height > SKIA_GPU_ISLAND_MAX_DIMENSION
      || request.width * request.height > SKIA_GPU_ISLAND_MAX_PIXELS
      || request.scene.width !== request.width || request.scene.height !== request.height
      || !Number.isSafeInteger(request.revision) || request.revision < 0
      || typeof request.islandId !== "string" || !request.islandId.trim() || request.islandId.length > 256
    ) return unavailable("Invalid or over-budget Skia GPU island identity, revision or SceneIR dimensions");
    // Scene/font bytes are immutable within a revision. Dimensions are also part of the key:
    // a DPR/viewport resize cannot reuse a bitmap from the old backing store.
    if (last && live
      && last.islandId === request.islandId && last.revision === request.revision
      && last.width === request.width && last.height === request.height
      && last.scene === request.scene && last.renderOptions?.fontData === request.renderOptions?.fontData
    ) return { status: "cached", islandId: request.islandId, revision: request.revision };
    last = null;
    try {
      const ck = await loadCanvasKit();
      if (disposed) return unavailable("Skia GPU island backend was disposed during initialization");
      if (!live || live.ck !== ck || live.width !== request.width || live.height !== request.height) {
        resetSurface();
        live = createGpuSurface(ck, request.width, request.height, contextLost);
        if (!live) throw new Error("Could not create the explicit WebGL2 context/GrDirectContext/GPU surface");
      }
      // Public Canvas methods activate the context attached by Surface.getCanvas(). Do not
      // call the unexported/minified CanvasKit.setCurrentContext implementation detail.
      renderSceneToCanvas(ck, live.surface.getCanvas(), request.scene, request.renderOptions ?? {});
      live.surface.flush();
      const bitmap = live.canvas.transferToImageBitmap();
      if (failure || disposed) {
        bitmap.close();
        return unavailable(failure ?? "Skia GPU island backend is disposed");
      }
      last = request;
      // Ownership is transferred to the caller, who must close the bitmap after upload/use.
      return { status: "transferred", islandId: request.islandId, revision: request.revision, bitmap };
    } catch (error) {
      failure = "CanvasKit GPU island render failed: " + (error instanceof Error ? error.message : String(error));
      resetSurface();
      return unavailable(failure);
    }
  }

  return {
    render(request) {
      // One GL context has one ordered command stream. Concurrent lazy initialization must not
      // present old revisions after newer ones or allocate two orphaned surfaces.
      const snapshot = { ...request };
      const result = tail.then(() => render(snapshot));
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resetSurface();
    },
  };
}
