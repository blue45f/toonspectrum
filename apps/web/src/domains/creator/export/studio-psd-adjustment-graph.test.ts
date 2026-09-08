// @vitest-environment jsdom

import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioKonvaRuntime as Konva } from "../render/studio-konva-runtime";

import { exportPagePsd, type PsdExportEl } from "./studio-psd-export";

const graph: PsdExportEl[] = [
  { id: "ink", type: "draw", points: [0, 0, 8, 8], opacity: 0.5 },
  {
    id: "adjustment<&>", type: "image", x: 0, y: 0, width: 16, height: 24,
    adjustmentLayer: { version: 1, scope: "composite-below" },
    smartFilters: { entries: [{ id: "invert", engine: "invert", enabled: true, opacity: 0.25 }] },
    opacity: 0.75, blendMode: "multiply", filterMaskSrc: "blob:render-only-mask",
  },
];

function view(stage: InstanceType<typeof Konva.Stage>) {
  return [stage.width(), stage.height(), stage.x(), stage.y(), stage.scaleX(), stage.scaleY(), stage.rotation()];
}

describe("PSD live adjustment graph capture", () => {
  let stage: InstanceType<typeof Konva.Stage>;
  let container: HTMLDivElement;
  let background: InstanceType<typeof Konva.Rect>;
  let content: InstanceType<typeof Konva.Group>;

  beforeEach(() => {
    const context = new Proxy({}, {
      get: (_target, key) => {
        if (key === "getImageData") return (_x: number, _y: number, width: number, height: number) => ({
          width, height, data: new Uint8ClampedArray(width * height * 4),
        });
        if (key === "createImageData") return (width: number, height: number) => ({
          width, height, data: new Uint8ClampedArray(width * height * 4),
        });
        return () => undefined;
      },
      set: () => true,
    }) as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((id: string) => id === "2d" ? context : null) as HTMLCanvasElement["getContext"],
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    stage = new Konva.Stage({ container, width: 40, height: 30, x: 5, y: -8, scaleX: -0.5, scaleY: 0.5, rotation: 90 });
    const layer = new Konva.Layer();
    background = new Konva.Rect({ name: "bg", width: 16, height: 24 });
    content = new Konva.Group({ studioElementId: "ink" });
    stage.add(layer); layer.add(background, content);
  });

  afterEach(() => {
    stage.destroy(); container.remove(); vi.restoreAllMocks();
  });

  it("encodes the final pixels once without duplicate source/background layers or double opacity", async () => {
    const originalView = view(stage);
    const nodeCapture = vi.spyOn(content, "toCanvas");
    const finalPixels = new Uint8ClampedArray(32 * 48 * 4);
    finalPixels.set([85, 120, 155, 191], 0);
    const captured = { width: 32, height: 48, getContext: () => ({ getImageData: () => ({ width: 32, height: 48, data: finalPixels }) }) } as unknown as HTMLCanvasElement;
    const capture = vi.spyOn(stage, "toCanvas").mockImplementation((options) => {
      expect(options).toEqual({ pixelRatio: 1 });
      expect(view(stage)).toEqual([32, 48, 0, 0, 2, 2, 0]);
      expect(background.visible()).toBe(true);
      return captured;
    });
    const result = await exportPagePsd(stage, graph, 16, 24, 0.5, {
      scale: 2, background: { color: "#ffffff" },
    });
    const psd = readPsd(await result.blob.arrayBuffer(), { useImageData: true, skipCompositeImageData: true });
    expect(capture).toHaveBeenCalledOnce();
    expect(nodeCapture).not.toHaveBeenCalled();
    expect(psd.children).toHaveLength(1);
    expect(psd.children![0]!.opacity).toBe(1);
    expect(psd.children![0]!.blendMode).toBe("normal");
    expect(psd.children![0]!.imageData!.data).toEqual(finalPixels);
    expect(view(stage)).toEqual(originalView);
    expect(captured.width).toBe(0);
    expect(result.layerCount).toBe(1);
    expect(result.lossManifest!.decisions).toContainEqual(expect.objectContaining({ feature: "adjustment-layer", disposition: "rasterized", count: 1 }));
    expect(result.lossManifest!.decisions).not.toContainEqual(expect.objectContaining({ feature: "layers", disposition: "preserved" }));
    const xml = new DOMParser().parseFromString(psd.imageResources!.xmpMetadata!, "application/xml");
    expect(xml.getElementsByTagName("parsererror")).toHaveLength(0);
    const metadata = JSON.parse(xml.getElementsByTagName("tsadjust:manifest")[0]!.textContent!);
    expect(metadata.sourceLayerOrder).toEqual(["ink", "adjustment<&>"]);
    expect(metadata.adjustments[0]).toMatchObject({
      id: "adjustment<&>", adjustmentLayer: { version: 1, scope: "composite-below" },
      smartFilters: graph[1]!.smartFilters, opacity: 0.75, blendMode: "multiply", hasFilterMask: true,
    });
    expect(psd.imageResources!.xmpMetadata).not.toContain("blob:render-only-mask");
  });

  it("excludes background only when requested and restores visibility and view after readback failure", async () => {
    const originalView = view(stage);
    vi.spyOn(stage, "toCanvas").mockImplementation(() => {
      expect(background.visible()).toBe(false);
      throw new Error("readback failed");
    });
    await expect(exportPagePsd(stage, graph, 16, 24, 0.5, { includeBackground: false })).rejects.toThrow("readback failed");
    expect(background.visible()).toBe(true);
    expect(view(stage)).toEqual(originalView);
  });

  it("fails before capture for unsupported graph versions and over-budget composite buffers", async () => {
    const capture = vi.spyOn(stage, "toCanvas");
    const unsupported = [{ ...graph[1]!, adjustmentLayer: { version: 2, scope: "composite-below" } }] as unknown as PsdExportEl[];
    await expect(exportPagePsd(stage, unsupported, 16, 24, 1)).rejects.toThrow("지원하지 않는 보정 레이어");
    await expect(exportPagePsd(stage, graph, 5000, 5000, 1)).rejects.toThrow("메모리 한도");
    expect(capture).not.toHaveBeenCalled();
  });
});
