import type { SceneIR } from "@toonspectrum/studio-project-model";
import type {
  CanvasKit,
  GrDirectContext,
  Surface,
  WebGLContextHandle,
} from "canvaskit-wasm";

import { renderSceneToCanvas, type RenderOptions } from "./render";

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
}

let defaultCanvasKitPromise: Promise<CanvasKit> | null = null;

async function loadDefaultCanvasKit(): Promise<CanvasKit> {
  defaultCanvasKitPromise ??= Promise.all([
    import("canvaskit-wasm"),
    import("canvaskit-wasm/bin/canvaskit.wasm?url"),
  ]).then(([module, wasm]) => module.default({
    locateFile(file: string) {
      return file.endsWith(".wasm") ? wasm.default : file;
    },
  }));
  return defaultCanvasKitPromise;
}

function unavailable(reason: string): SkiaGpuIslandResult {
  return { status: "unavailable", reason };
}

function validDimension(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function disposeSurface(current: LiveSurface | null): void {
  if (!current) return;
  current.surface.delete();
  current.context.delete();
  current.ck.deleteContext(current.gl);
}

function createGpuSurface(
  ck: CanvasKit,
  width: number,
  height: number,
): LiveSurface | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(width, height);
  // CanvasKit's declaration historically names HTMLCanvasElement here, while Emscripten's
  // GL.createContext accepts OffscreenCanvas in Worker/browser runtimes. Keep the cast at the
  // vendor boundary instead of weakening the rest of the package.
  const gl = ck.GetWebGLContext(canvas as unknown as HTMLCanvasElement, {
    alpha: 1,
    antialias: 0,
    depth: 0,
    stencil: 8,
    premultipliedAlpha: 1,
    preserveDrawingBuffer: 0,
    majorVersion: 2,
  });
  if (!gl) return null;

  const context = ck.MakeWebGLContext(gl);
  if (!context) {
    ck.deleteContext(gl);
    return null;
  }
  const surface = ck.MakeOnScreenGLSurface(
    context,
    width,
    height,
    ck.ColorSpace.SRGB,
  );
  if (!surface) {
    context.delete();
    ck.deleteContext(gl);
    return null;
  }
  return { ck, canvas, gl, context, surface, width, height };
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
  let lastRevision = -1;
  let lastIslandId: string | null = null;

  function resetSurface(): void {
    disposeSurface(live);
    live = null;
  }

  return {
    async render(request) {
      if (disposed) return unavailable("Skia GPU island backend is disposed");
      if (typeof OffscreenCanvas === "undefined") {
        return unavailable("OffscreenCanvas is required for the Skia GPU island bridge");
      }
      if (
        !validDimension(request.width)
        || !validDimension(request.height)
        || request.scene.width !== request.width
        || request.scene.height !== request.height
      ) {
        return unavailable("Skia GPU island request dimensions must be positive and match SceneIR");
      }
      if (lastIslandId === request.islandId && lastRevision === request.revision) {
        return {
          status: "cached",
          islandId: request.islandId,
          revision: request.revision,
        };
      }

      try {
        const ck = await loadCanvasKit();
        if (disposed) return unavailable("Skia GPU island backend was disposed during initialization");
        if (!live || live.ck !== ck || live.width !== request.width || live.height !== request.height) {
          resetSurface();
          live = createGpuSurface(ck, request.width, request.height);
          if (!live) {
            return unavailable(
              "CanvasKit could not create the explicit WebGL2 context/GrDirectContext/GPU surface",
            );
          }
        }

        ck.setCurrentContext(live.gl);
        renderSceneToCanvas(
          ck,
          live.surface.getCanvas(),
          request.scene,
          request.renderOptions ?? {},
        );
        live.surface.flush();
        const bitmap = live.canvas.transferToImageBitmap();
        lastIslandId = request.islandId;
        lastRevision = request.revision;
        return {
          status: "transferred",
          islandId: request.islandId,
          revision: request.revision,
          bitmap,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return unavailable("CanvasKit GPU island render failed: " + detail);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resetSurface();
      lastRevision = -1;
      lastIslandId = null;
    },
  };
}
