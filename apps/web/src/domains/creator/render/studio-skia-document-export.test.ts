// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type { SkiaDocumentFrame, SkiaDocumentRenderer } from "@toonspectrum/studio-engine-skia";

import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import { captureStudioSkiaDocumentForExport } from "./studio-skia-document-export";

function frame(id: string, x = 0): El {
  return {
    id,
    type: "frame",
    x,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    bgColor: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  } as El;
}

function page(patch: Partial<PageState> = {}): PageState {
  return {
    id: "page-1",
    elements: [frame("page-frame", 120)],
    bg: "#fefefe",
    bgGrad: null,
    canvasH: 300,
    ...patch,
  };
}

function rendererHarness() {
  let presented: SkiaDocumentFrame | null = null;
  const renderer: SkiaDocumentRenderer = {
    present: vi.fn(async (next) => {
      presented = next;
      return {
        status: "presented" as const,
        revision: next.revision,
        stats: {
          compiledItems: next.items.length,
          compiledBatches: 1,
          cachedBatches: 1,
          cachedItems: next.items.length,
          paintedItems: next.items.length,
          presentation: "full" as const,
          pictureBytes: 1,
          retainedSnapshotBytes: 0,
          gpuCacheBytes: 1,
          imageTextureBytes: 0,
          cachedImages: 0,
          fontBytes: 0,
          cachedFonts: 0,
          frameMs: 1,
          interactiveReadbacks: 0 as const,
        },
      };
    }),
    snapshotPng: vi.fn((revision) =>
      presented?.revision === revision ? Uint8Array.of(1, 2, 3) : null
    ),
    dispose: vi.fn(),
  };
  return { renderer, get presented() { return presented; } };
}

function dependencies(harness = rendererHarness()) {
  const projection = {
    sources: new Map(),
    hasLiveFrames: false,
    release: vi.fn(),
  };
  const output = document.createElement("canvas");
  return {
    harness,
    projection,
    output,
    value: {
      createRenderer: vi.fn(async () => harness.renderer),
      prepareSpecialistProjection: vi.fn(async () => projection),
      createCanvas: vi.fn(() => document.createElement("canvas")),
      decodePng: vi.fn(async (_bytes: Uint8Array, width: number, height: number) => {
        output.width = width;
        output.height = height;
        return output;
      }),
    },
  };
}

describe("detached Skia document export", () => {
  it("renders solid background, master, and page in exact z-order at export scale", async () => {
    const deps = dependencies();
    const result = await captureStudioSkiaDocumentForExport({
      page: page(),
      masterElements: [frame("master-frame")],
      exportScale: 2,
      transparent: false,
    }, deps.value);

    expect(result).toMatchObject({ status: "captured" });
    expect(deps.harness.presented?.items.map((item) => item.id)).toEqual([
      "__toonspectrum_skia_export_background__",
      "master-frame",
      "page-frame",
    ]);
    expect(deps.harness.presented).toMatchObject({ width: 720, height: 300, dpr: 2 });
    expect(deps.output).toMatchObject({ width: 1440, height: 600 });
    expect(deps.output.dataset.studioRasterExportBackend).toBe("skia-document");
    expect(deps.projection.release).toHaveBeenCalledWith({ invalidateLiveFrames: true });
    expect(deps.harness.renderer.dispose).toHaveBeenCalledOnce();
  });

  it("keeps transparent exports free of the authored page background", async () => {
    const deps = dependencies();
    const result = await captureStudioSkiaDocumentForExport({
      page: page(),
      exportScale: 1,
      transparent: true,
    }, deps.value);

    expect(result.status).toBe("captured");
    expect(deps.harness.presented?.items.map((item) => item.id)).toEqual(["page-frame"]);
  });

  it("does not approximate gradient, paper, timeline, or over-budget documents", async () => {
    for (const candidate of [
      page({ bgGrad: ["#fff", "#000"] }),
      page({ paperSurface: { kind: "cold-press", seed: 1 } }),
      page({
        animTimeline: { fps: 24, frameCount: 1, tracks: {} } as PageState["animTimeline"],
      }),
      page({ canvasH: 9000 }),
    ]) {
      const deps = dependencies();
      const result = await captureStudioSkiaDocumentForExport({
        page: candidate,
        exportScale: 1,
        transparent: false,
      }, deps.value);
      expect(result.status).toBe("unsupported");
      expect(deps.value.createRenderer).not.toHaveBeenCalled();
    }
  });

  it("requires an exact presented receipt and snapshot before publishing pixels", async () => {
    const deps = dependencies();
    vi.mocked(deps.harness.renderer.snapshotPng).mockReturnValue(null);
    const result = await captureStudioSkiaDocumentForExport({
      page: page(),
      exportScale: 1,
      transparent: false,
    }, deps.value);

    expect(result).toEqual({
      status: "unavailable",
      reason: "document-export-snapshot-unavailable",
    });
    expect(deps.value.decodePng).not.toHaveBeenCalled();
    expect(deps.projection.release).toHaveBeenCalledOnce();
  });

  it("honors group visibility and page-level master suppression", async () => {
    const deps = dependencies();
    const hidden = { ...frame("hidden-frame"), groupId: "hidden" } as El;
    const result = await captureStudioSkiaDocumentForExport({
      page: page({
        hideMaster: true,
        elements: [hidden, frame("visible-frame")],
        groups: [{ id: "hidden", name: "hidden", hidden: true }],
      }),
      masterElements: [frame("master-frame")],
      exportScale: 1,
      transparent: true,
    }, deps.value);

    expect(result.status).toBe("captured");
    expect(deps.harness.presented?.items.map((item) => item.id)).toEqual(["visible-frame"]);
  });
});
