/**
 * Skia CanvasKit GPU island (V13 §5.4).
 *
 * Interactive Skia completion must not readPixels on the hot path. The
 * production transport is OffscreenCanvas WebGL → ImageBitmap → WebGPU
 * copyExternalImageToTexture. Until a WebGL surface exists, this module
 * refuses the interactive plan instead of silently falling back to CPU
 * pixels.
 */

export const SKIA_GPU_ISLAND_PROVIDER_ID = "skia-canvaskit-gpu" as const;

export interface SkiaGpuIslandRequest {
  readonly islandId: string;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
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

/**
 * Probe-only backend used until CanvasKit MakeWebGLCanvasSurface is adopted
 * on a worker. Interactive callers must treat `unavailable` as "keep the
 * previous texture / leave Konva shadow for this island".
 */
export function createSkiaGpuIslandBackend(): SkiaGpuIslandBackend {
  let lastRevision = -1;
  let lastIslandId: string | null = null;
  return {
    async render(request) {
      if (typeof OffscreenCanvas === "undefined") {
        return {
          status: "unavailable",
          reason: "OffscreenCanvas is required for the Skia GPU island bridge",
        };
      }
      if (lastIslandId === request.islandId && lastRevision === request.revision) {
        return {
          status: "cached",
          islandId: request.islandId,
          revision: request.revision,
        };
      }
      lastIslandId = request.islandId;
      lastRevision = request.revision;
      return {
        status: "unavailable",
        reason:
          "CanvasKit WebGL island renderer is not adopted on this device; "
          + "FrameGraph keeps the previous texture and does not readPixels",
      };
    },
    dispose() {
      lastRevision = -1;
      lastIslandId = null;
    },
  };
}
