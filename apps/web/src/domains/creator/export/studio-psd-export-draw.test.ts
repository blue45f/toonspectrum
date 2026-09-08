// @vitest-environment jsdom

import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioKonvaRuntime as Konva } from "../render/studio-konva-runtime";

import { exportPagePsd, type PsdExportEl } from "./studio-psd-export";

function pixelCanvas(
  width: number,
  height: number,
  color: number,
  alpha = 255,
  pixels: readonly { x: number; y: number; alpha?: number }[] = [{ x: 0, y: 0 }],
) {
  // A sparse pixel surface keeps the large-document regression cheap while honoring every real
  // getImageData rectangle. Konva geometry and ag-psd still consume the full declared dimensions.
  const getImageData = vi.fn((x: number, y: number, w: number, h: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (const pixel of pixels) {
      if (pixel.x < x || pixel.x >= x + w || pixel.y < y || pixel.y >= y + h) continue;
      const offset = ((pixel.y - y) * w + pixel.x - x) * 4;
      data.set([color, 50, 80, pixel.alpha ?? alpha], offset);
    }
    return { width: w, height: h, data };
  });
  const canvas = { width, height, getContext: () => ({ getImageData }) } as unknown as HTMLCanvasElement;
  return { canvas, getImageData };
}

describe("PSD custom draw node capture", () => {
  let stage: InstanceType<typeof Konva.Stage>;
  let layer: InstanceType<typeof Konva.Layer>;
  let container: HTMLDivElement;

  beforeEach(() => {
    // Konva owns the real scene graph and bounds. Only the browser pixel surface is substituted;
    // the PSD encoder/decoder and document-view capture arguments remain real.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => new Proxy({}, {
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
    }) as CanvasRenderingContext2D);
    container = document.createElement("div");
    document.body.appendChild(container);
    stage = new Konva.Stage({ container, width: 32, height: 48, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    layer = new Konva.Layer();
    stage.add(layer);
  });

  afterEach(() => {
    stage.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  function addDraw(id: string, color = 100, bounded = false) {
    const node = new Konva.Group({ studioElementId: id });
    node.add(new Konva.Shape({
      ...(bounded ? { x: 4, y: 6, width: 8, height: 10 } : {}),
      // A sceneFunc can paint visible pixels without declaring width/height, as causal pen and
      // dynamic-dab StudioDrawNode branches do. A zero getClientRect is not an empty stroke.
      sceneFunc: (context) => context.fillRect(4, 6, 8, 10),
      listening: false,
    }));
    layer.add(node);
    const capture = vi.spyOn(node, "toCanvas").mockImplementation((options = {}) => {
      const width = Math.round((options.width ?? 0) * (options.pixelRatio ?? 1));
      const height = Math.round((options.height ?? 0) * (options.pixelRatio ?? 1));
      return pixelCanvas(width, height, color).canvas;
    });
    const element: PsdExportEl = { id, type: "draw", points: [4, 6, 12, 16] };
    return { node, capture, element };
  }

  it("exports four visible custom-paint nodes as four distinct layers despite zero Konva bounds", async () => {
    const strokes = ["dry-media", "pen-one", "pen-two", "pen-three"].map((id, index) =>
      addDraw(id, 60 + index),
    );
    for (const { node } of strokes) {
      expect(node.getClientRect()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    }
    const result = await exportPagePsd(stage, strokes.map(({ element }) => element), 32, 48, 1, {
      includeBackground: false,
    });
    expect(result.layerCount).toBe(4);
    expect(result.skipped).toEqual([]);
    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    expect(psd.children).toHaveLength(4);
    expect(psd.children?.map((child) => child.imageData?.data[0])).toEqual([63, 62, 61, 60]);
    expect(psd.children?.map((child) => [child.left, child.top, child.right, child.bottom]))
      .toEqual(Array.from({ length: 4 }, () => [0, 0, 1, 1]));
    expect(result.lossManifest?.decisions).not.toContainEqual(
      expect.objectContaining({ feature: "layers", disposition: "dropped" }),
    );
    for (const { capture } of strokes) expect(capture).toHaveBeenCalledTimes(1);
  });

  it("captures document pixels at the output scale and restores the exact view", async () => {
    stage.position({ x: -13, y: 17 });
    stage.scale({ x: -0.37, y: 0.37 });
    stage.rotation(90);
    const original = { ...stage.getAttrs() };
    const drawStage = vi.spyOn(stage, "draw");
    const resizeStage = vi.spyOn(stage, "size");
    const { capture, element } = addDraw("zoomed");
    capture.mockImplementation((options = {}) => {
      expect(stage.position()).toEqual({ x: 0, y: 0 });
      expect(stage.scale()).toEqual({ x: 2, y: 2 });
      expect(stage.rotation()).toBe(0);
      expect(options).toMatchObject({ x: 0, y: 0, width: 64, height: 96, pixelRatio: 1 });
      return pixelCanvas(64, 96, 70).canvas;
    });
    const result = await exportPagePsd(stage, [element], 32, 48, 0.37, {
      scale: 2, includeBackground: false,
    });
    expect(result.layerCount).toBe(1);
    expect(stage.getAttrs()).toEqual(original);
    expect(drawStage).not.toHaveBeenCalled();
    expect(resizeStage).not.toHaveBeenCalled();
  });

  it("keeps the existing bounded-node capture and PSD layer metadata", async () => {
    const { capture, element } = addDraw("bounded", 80, true);
    const result = await exportPagePsd(stage, [{
      ...element, opacity: 0.4, blendMode: "multiply", clipBelow: true,
    }], 32, 48, 1, { includeBackground: false });
    expect(capture).toHaveBeenCalledWith({ x: 4, y: 6, width: 8, height: 10, pixelRatio: 1 });
    const psd = readPsd(await result.blob.arrayBuffer(), { skipLayerImageData: true, skipCompositeImageData: true });
    expect(psd.children?.[0]).toMatchObject({
      left: 4, top: 6, opacity: 0.4, blendMode: "multiply", clipping: true,
    });
  });

  it("keeps panel clipping, noClip and clipping-layer metadata for document-sized captures", async () => {
    const { element: clipped, capture: captureClipped } = addDraw("clipped");
    const { element: unclipped, capture: captureUnclipped } = addDraw("unclipped");
    captureClipped.mockReturnValue(pixelCanvas(64, 96, 100, 102, [
      { x: 0, y: 0 }, { x: 6, y: 10, alpha: 1 }, { x: 33, y: 43 },
    ]).canvas);
    captureUnclipped.mockReturnValue(pixelCanvas(64, 96, 110, 102, [
      { x: 2, y: 3, alpha: 1 }, { x: 50, y: 70 },
    ]).canvas);
    addDraw("panel", 90, true);
    const panel: PsdExportEl = { id: "panel", type: "frame", x: 3, y: 5, width: 14, height: 17 };
    const result = await exportPagePsd(stage, [panel, clipped, {
      ...unclipped, noClip: true, clipBelow: true, blendMode: "multiply", opacity: 0.4,
    }], 32, 48, 1, { scale: 2, includeBackground: false });
    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    expect(result.layerCount).toBe(3);
    expect(psd.children?.[0]).toMatchObject({
      left: 2, top: 3, right: 51, bottom: 71, clipping: true, blendMode: "multiply", opacity: 1,
    });
    expect(psd.children?.[1]).toMatchObject({ left: 6, top: 10, right: 34, bottom: 44 });
    expect(psd.children?.[0]?.imageData?.data.slice(0, 4)).toEqual(new Uint8ClampedArray([110, 50, 80, 1]));
    expect(psd.children?.[1]?.imageData?.data.slice(0, 4)).toEqual(new Uint8ClampedArray([100, 50, 80, 1]));
    expect(psd.children?.[1]?.imageData?.data.slice(-4)).toEqual(new Uint8ClampedArray([100, 50, 80, 102]));
  });

  it("preserves opacity already baked by a custom draw sceneFunc without multiplying it again", async () => {
    const { capture, element } = addDraw("translucent");
    capture.mockReturnValue(pixelCanvas(32, 48, 100, 102).canvas);
    const result = await exportPagePsd(stage, [{ ...element, opacity: 0.4 }], 32, 48, 1, {
      includeBackground: false,
    });
    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    const exported = psd.children?.[0];
    expect(exported?.imageData?.data[3]).toBe(102);
    expect(exported?.opacity).toBe(1);
    expect((exported!.imageData!.data[3]! / 255) * exported!.opacity!).toBe(0.4);
  });

  it("restores the document view when a custom-node pixel capture fails", async () => {
    stage.position({ x: 8, y: 9 });
    const original = { ...stage.getAttrs() };
    const { capture, element } = addDraw("failed");
    capture.mockImplementation(() => { throw new Error("pixel surface unavailable"); });
    const result = await exportPagePsd(stage, [element], 32, 48, 1, { includeBackground: false });
    expect(result.layerCount).toBe(0);
    expect(result.skipped).toContainEqual(expect.stringContaining("래스터화 실패"));
    expect(stage.getAttrs()).toEqual(original);
  });

  it("reserves the background pixels before admitting a full-document draw capture", async () => {
    const { element, capture } = addDraw("large-with-background");
    await expect(exportPagePsd(stage, [element], 4096, 4097, 1, {
      background: { color: "#ffffff" },
    })).rejects.toThrow(/메모리/u);
    expect(capture).not.toHaveBeenCalled();
  });

  it("counts retained layers and the next draw readback before allocating more pixels", async () => {
    const first = addDraw("large-bounded", 100, true);
    first.node.getChildren()[0]!.size({ width: 4096, height: 4096 });
    first.capture.mockReturnValue({ width: 4096, height: 4096 } as HTMLCanvasElement);
    const second = addDraw("large-custom");
    const source = pixelCanvas(4096, 4096, 100);
    second.capture.mockReturnValue(source.canvas);
    await expect(exportPagePsd(stage, [first.element, second.element], 4096, 4096, 1, {
      includeBackground: false,
    })).rejects.toThrow(/메모리/u);
    expect(first.capture).toHaveBeenCalledTimes(1);
    expect(second.capture).toHaveBeenCalledTimes(1);
    expect(source.getImageData).not.toHaveBeenCalled();
    expect(source.canvas.width).toBe(0);
  });

  it("exports twenty sparse 1440x2160 layers with background within the unchanged byte budget", async () => {
    const sources: ReturnType<typeof pixelCanvas>[] = [];
    const strokes = Array.from({ length: 20 }, (_value, index) => {
      const draw = addDraw(`sparse-${index}`, 60 + index);
      const source = pixelCanvas(1440, 2160, 60 + index, 102, [
        { x: 11 + index, y: 2051 + index, alpha: 1 },
        { x: 12 + index, y: 2052 + index },
      ]);
      sources.push(source);
      draw.capture.mockReturnValue(source.canvas);
      return draw;
    });
    const result = await exportPagePsd(stage, strokes.map(({ element }) => element), 720, 1080, 1, {
      scale: 2, background: { color: "#ffffff" },
    });
    expect(result.layerCount).toBe(20);
    expect(result.skipped).toEqual([]);
    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    expect(psd.children).toHaveLength(21);
    const draws = psd.children!.slice(0, 20);
    expect(draws.map((draw) => [draw.left, draw.top, draw.right, draw.bottom])).toEqual(
      Array.from({ length: 20 }, (_value, index) => {
        const n = 19 - index;
        return [11 + n, 2051 + n, 13 + n, 2053 + n];
      }),
    );
    expect(draws.map((draw) => Array.from(draw.imageData!.data))).toEqual(
      Array.from({ length: 20 }, (_value, index) => [
        79 - index, 50, 80, 1, 0, 0, 0, 0,
        0, 0, 0, 0, 79 - index, 50, 80, 102,
      ]),
    );
    expect(draws.reduce((total, draw) => total + draw.imageData!.data.byteLength, 0)).toBe(320);
    for (const { canvas, getImageData } of sources) {
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
      expect(getImageData.mock.calls.every(([_x, _y, _w, height]) => height <= 64)).toBe(true);
    }
  });

  it("reports and preserves a fully transparent draw without changing a following clipping base", async () => {
    const draw = addDraw("blank");
    const source = pixelCanvas(32, 48, 100, 0);
    draw.capture.mockReturnValue(source.canvas);
    const child = addDraw("clipping-child");
    const result = await exportPagePsd(stage, [draw.element, { ...child.element, clipBelow: true }], 32, 48, 1, {
      includeBackground: false,
    });
    expect(result.layerCount).toBe(2);
    expect(result.skipped).toContainEqual(expect.stringContaining("보이는 픽셀이 없어 투명 레이어"));
    const psd = readPsd(await result.blob.arrayBuffer(), { useImageData: true, skipCompositeImageData: true });
    expect(psd.children).toHaveLength(2);
    expect(psd.children?.[0]?.clipping).toBe(true);
    expect(psd.children?.[1]?.imageData?.data).toEqual(new Uint8ClampedArray(4));
    expect(result.lossManifest?.decisions).not.toContainEqual(
      expect.objectContaining({ feature: "layers", disposition: "dropped" }),
    );
    expect(source.canvas.width).toBe(0);
  });

  it("releases a captured surface and rejects the export when pixel readback fails", async () => {
    const draw = addDraw("unreadable");
    const source = pixelCanvas(32, 48, 100);
    source.getImageData.mockImplementation(() => { throw new Error("readback denied"); });
    draw.capture.mockReturnValue(source.canvas);
    await expect(exportPagePsd(stage, [draw.element], 32, 48, 1, { includeBackground: false }))
      .rejects.toThrow("readback denied");
    expect(source.canvas.width).toBe(0);
    expect(source.canvas.height).toBe(0);
  });
});
