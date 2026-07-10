import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectStudioCaptureAssetSources,
  STUDIO_CAPTURE_READY_MAX_ASSETS,
  StudioCaptureReadinessError,
  waitForStudioCaptureReady,
  type StudioCaptureStageLike,
} from "./studio-capture-readiness";

afterEach(() => {
  vi.useRealTimers();
});

function stage(): StudioCaptureStageLike & { drawCount: number } {
  return {
    drawCount: 0,
    batchDraw() {
      this.drawCount += 1;
    },
  };
}

describe("waitForStudioCaptureReady", () => {
  it("waits for the requested React commit, fonts, unique assets, and Konva paint frames", async () => {
    const targetStage = stage();
    let renderedPageId: string | null = null;
    let frames = 0;
    let fontsReady = false;
    const preloaded: string[] = [];

    const result = await waitForStudioCaptureReady({
      pageId: "page-2",
      getRenderedPageId: () => renderedPageId,
      getStage: () => targetStage,
      assetSources: ["data:image/png;base64,AA", "data:image/png;base64,AA", "blob:second"],
      nextFrame: async () => {
        frames += 1;
        if (frames === 1) renderedPageId = "page-2";
      },
      waitForFonts: async () => {
        fontsReady = true;
      },
      preloadImage: async (source) => {
        preloaded.push(source);
      },
    });

    expect(result).toBe(targetStage);
    expect(fontsReady).toBe(true);
    expect(new Set(preloaded)).toEqual(new Set(["data:image/png;base64,AA", "blob:second"]));
    expect(preloaded).toHaveLength(2);
    expect(frames).toBe(4);
    expect(targetStage.drawCount).toBe(1);
  });

  it("stops when the selected page changes during readiness work", async () => {
    const targetStage = stage();
    let renderedPageId = "page-1";
    let frames = 0;

    const promise = waitForStudioCaptureReady({
      pageId: "page-1",
      getRenderedPageId: () => renderedPageId,
      getStage: () => targetStage,
      nextFrame: async () => {
        frames += 1;
        if (frames === 1) renderedPageId = "page-2";
      },
      waitForFonts: async () => undefined,
      preloadImage: async () => undefined,
    });

    await expect(promise).rejects.toMatchObject({ code: "stale-page" });
    expect(targetStage.drawCount).toBe(0);
  });

  it("times out instead of silently capturing the previously rendered page", async () => {
    vi.useFakeTimers();
    const targetStage = stage();
    const promise = waitForStudioCaptureReady({
      pageId: "never-committed",
      getRenderedPageId: () => "previous-page",
      getStage: () => targetStage,
      timeoutMs: 250,
      nextFrame: () => new Promise(() => undefined),
      waitForFonts: async () => undefined,
      preloadImage: async () => undefined,
    });

    const assertion = expect(promise).rejects.toMatchObject({ code: "render-timeout" });
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it("honors cancellation before any image work begins", async () => {
    const controller = new AbortController();
    controller.abort();
    const preloadImage = vi.fn(async () => undefined);

    await expect(waitForStudioCaptureReady({
      pageId: "page-1",
      getRenderedPageId: () => "page-1",
      getStage: () => stage(),
      assetSources: ["private-source"],
      signal: controller.signal,
      nextFrame: async () => undefined,
      waitForFonts: async () => undefined,
      preloadImage,
    })).rejects.toMatchObject({ code: "aborted" });

    expect(preloadImage).not.toHaveBeenCalled();
  });

  it("does not reflect a private asset URL when decode fails", async () => {
    const privateSource = "https://assets.example/private.png?token=do-not-reflect";
    const promise = waitForStudioCaptureReady({
      pageId: "page-1",
      getRenderedPageId: () => "page-1",
      getStage: () => stage(),
      assetSources: [privateSource],
      nextFrame: async () => undefined,
      waitForFonts: async () => undefined,
      preloadImage: async () => {
        throw new Error(privateSource);
      },
    });

    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(StudioCaptureReadinessError);
      expect((error as StudioCaptureReadinessError).code).toBe("asset-load");
      expect((error as Error).message).not.toContain("do-not-reflect");
      return true;
    });
  });

  it("rejects pathological per-page asset counts before starting decodes", async () => {
    const preloadImage = vi.fn(async () => undefined);
    const promise = waitForStudioCaptureReady({
      pageId: "page-1",
      getRenderedPageId: () => "page-1",
      getStage: () => stage(),
      assetSources: Array.from(
        { length: STUDIO_CAPTURE_READY_MAX_ASSETS + 1 },
        (_, index) => `blob:asset-${index}`
      ),
      nextFrame: async () => undefined,
      waitForFonts: async () => undefined,
      preloadImage,
    });

    await expect(promise).rejects.toMatchObject({ code: "asset-limit" });
    expect(preloadImage).not.toHaveBeenCalled();
  });
});

describe("collectStudioCaptureAssetSources", () => {
  it("collects and deduplicates only raster and mask dependencies from pages and master", () => {
    expect(collectStudioCaptureAssetSources(
      {
        id: "page-1",
        elements: [
          { type: "image", src: " data:image/png;base64,AA ", prompt: "private prompt" },
          { type: "image", src: "data:image/png;base64,AA", maskSrc: "blob:mask" },
          { type: "text", text: "not an asset", sourceUrl: "https://ignore.example" },
        ],
      },
      { elements: [{ type: "image", src: "blob:master" }] },
      { elements: "malformed" }
    )).toEqual(["data:image/png;base64,AA", "blob:mask", "blob:master"]);
  });

  it("returns an empty list for malformed and private non-render fields", () => {
    expect(collectStudioCaptureAssetSources(
      null,
      { elements: [{ requestId: "provider-secret", referenceAssetIds: ["asset-1"] }] }
    )).toEqual([]);
  });
});
