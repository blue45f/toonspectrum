import { describe, expect, it, vi } from "vitest";

import { prepareStudioSkiaSpecialistDocumentProjection } from "./studio-skia-specialist-document-projection";

import type { El } from "../studio-element-model";
import type { StudioSkiaSpecialistRasterCache } from "./studio-skia-specialist-raster-cache";

function filteredImage(id: string): El {
  return {
    id,
    type: "image",
    src: `data:image/png;base64,${id}`,
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    rotation: 0,
    brightness: 0.2,
  } as El;
}

describe("prepareStudioSkiaSpecialistDocumentProjection", () => {
  it("holds exact specialist leases and publishes local padded bounds", async () => {
    const release = vi.fn();
    const invalidate = vi.fn(() => true);
    const acquire = vi.fn(async (_element, plan) => ({
      key: plan.key,
      src: "blob:prepared",
      width: 48,
      height: 38,
      bytes: 128,
      localX: -4,
      localY: -4,
      displayWidth: 48,
      displayHeight: 38,
      capturesLiveFrame: false,
      release,
    }));
    const cache = {
      acquire,
      invalidate,
      snapshot: () => ({
        disposed: false,
        entryCount: 1,
        readyCount: 1,
        preparingCount: 0,
        activeReferenceCount: 1,
        residentBytes: 128,
        queuedCount: 0,
        activePreparations: 0,
      }),
      dispose: vi.fn(),
    } as unknown as StudioSkiaSpecialistRasterCache;

    const projection = await prepareStudioSkiaSpecialistDocumentProjection(
      [filteredImage("filtered"), { id: "plain", type: "draw", hidden: true } as El],
      { cache },
    );
    expect(acquire).toHaveBeenCalledOnce();
    expect(projection.sources.get("filtered")).toMatchObject({
      src: "blob:prepared",
      rasterBounds: { x: -4, y: -4, width: 48, height: 38 },
    });
    expect(projection.hasLiveFrames).toBe(false);
    projection.release();
    projection.release();
    expect(release).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates live-frame leases only when requested", async () => {
    const release = vi.fn();
    const invalidate = vi.fn(() => true);
    const cache = {
      acquire: vi.fn(async (_element, plan) => ({
        key: plan.key,
        src: "blob:gif-frame",
        width: 40,
        height: 30,
        bytes: 64,
        localX: 0,
        localY: 0,
        displayWidth: 40,
        displayHeight: 30,
        capturesLiveFrame: true,
        release,
      })),
      invalidate,
      snapshot: vi.fn(),
      dispose: vi.fn(),
    } as unknown as StudioSkiaSpecialistRasterCache;
    const gif = {
      ...filteredImage("gif"),
      brightness: undefined,
      isAnimatedGif: true,
      src: "data:image/gif;base64,gif",
    } as El;
    const projection = await prepareStudioSkiaSpecialistDocumentProjection(
      [gif],
      { cache, liveFrameRevision: 3 },
    );
    expect(projection.hasLiveFrames).toBe(true);
    const key = projection.sources.get("gif")!.key;
    projection.release({ invalidateLiveFrames: true });
    expect(release).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith(key);
  });
});
