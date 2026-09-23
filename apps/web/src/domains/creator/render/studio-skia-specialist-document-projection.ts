import type { El } from "../studio-element-model";
import {
  createStudioSkiaSpecialistRasterCache,
  type StudioSkiaSpecialistRasterCache,
} from "./studio-skia-specialist-raster-cache";
import {
  planStudioSkiaSpecialistRaster,
  type StudioSkiaSpecialistRasterLease,
} from "./studio-skia-specialist-raster";
import { requiresStudioSkiaSpecialistRaster } from "./studio-skia-specialist-raster-contract";

export interface StudioSkiaPreparedImageProjection {
  readonly key: string;
  readonly src: string;
  readonly capturesLiveFrame: boolean;
  readonly rasterBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface StudioSkiaSpecialistDocumentProjection {
  readonly sources: ReadonlyMap<string, StudioSkiaPreparedImageProjection>;
  readonly hasLiveFrames: boolean;
  release(options?: { readonly invalidateLiveFrames?: boolean }): void;
}
export interface PrepareStudioSkiaSpecialistDocumentProjectionOptions {
  readonly signal?: AbortSignal;
  readonly liveFrameRevision?: number;
  readonly cache?: StudioSkiaSpecialistRasterCache;
}

export function createStudioSkiaSpecialistDocumentProjectionCache():
StudioSkiaSpecialistRasterCache {
  return createStudioSkiaSpecialistRasterCache();
}

export async function prepareStudioSkiaSpecialistDocumentProjection(
  elements: readonly El[],
  options: PrepareStudioSkiaSpecialistDocumentProjectionOptions = {},
): Promise<StudioSkiaSpecialistDocumentProjection> {
  const cache = options.cache ?? createStudioSkiaSpecialistRasterCache();
  const ownsCache = options.cache === undefined;
  const candidates = elements.filter(requiresStudioSkiaSpecialistRaster);
  const acquired: Array<{
    readonly elementId: string;
    readonly lease: StudioSkiaSpecialistRasterLease;
  }> = [];
  try {
    await Promise.all(candidates.map(async (element) => {
      const plan = planStudioSkiaSpecialistRaster(element, {
        liveFrameRevision: options.liveFrameRevision ?? 0,
      });
      const lease = await cache.acquire(element, plan, {
        signal: options.signal,
        consumer: `studio-skia-document:${element.id}`,
      });
      acquired.push({ elementId: element.id, lease });
    }));
    const sources = new Map<string, StudioSkiaPreparedImageProjection>();
    for (const { elementId, lease } of acquired) {
      sources.set(elementId, Object.freeze({
        key: lease.key,
        src: lease.src,
        capturesLiveFrame: lease.capturesLiveFrame,
        rasterBounds: Object.freeze({
          x: lease.localX,
          y: lease.localY,
          width: lease.displayWidth,
          height: lease.displayHeight,
        }),
      }));
    }
    let released = false;
    return Object.freeze({
      sources,
      hasLiveFrames: acquired.some(({ lease }) => lease.capturesLiveFrame),
      release(
        releaseOptions: { readonly invalidateLiveFrames?: boolean } = {},
      ): void {
        if (released) return;
        released = true;
        for (const { lease } of acquired) {
          lease.release();
          if (releaseOptions.invalidateLiveFrames && lease.capturesLiveFrame) {
            cache.invalidate(lease.key);
          }
        }
        if (ownsCache) cache.dispose();
      },
    });
  } catch (error) {
    for (const { lease } of acquired) lease.release();
    if (ownsCache) cache.dispose();
    throw error;
  }
}
