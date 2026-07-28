// @vitest-environment jsdom

import { readPsd } from "ag-psd";
import { describe, expect, it, vi } from "vitest";

import {
  exportPagePsd,
  planPsdEditableTextDescriptor,
  preflightPsdExport,
  PSD_EXPORT_MAX_DIMENSION_PX,
  type PsdExportEl,
  type PsdTextElLike,
} from "./studio-psd-export";

import type Konva from "konva";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FakeNodeSpec {
  id: string;
  documentRect: Rect;
  viewRect?: Rect;
  canvas?: HTMLCanvasElement;
}

function pixelCanvas(width: number, height: number, rgba = [32, 64, 96, 255]): HTMLCanvasElement {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = rgba[0] ?? 0;
    data[offset + 1] = rgba[1] ?? 0;
    data[offset + 2] = rgba[2] ?? 0;
    data[offset + 3] = rgba[3] ?? 255;
  }
  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ width, height, data }),
    }),
  } as unknown as HTMLCanvasElement;
}

function fakeStage(specs: readonly FakeNodeSpec[]): {
  stage: Konva.Stage;
  toCanvasById: ReadonlyMap<string, ReturnType<typeof vi.fn>>;
} {
  const toCanvasById = new Map<string, ReturnType<typeof vi.fn>>();
  const nodes = specs.map((spec) => {
    const toCanvas = vi.fn(() => spec.canvas ?? pixelCanvas(spec.documentRect.width, spec.documentRect.height));
    toCanvasById.set(spec.id, toCanvas);
    return {
      getAttr: (name: string) => name === "studioElementId" ? spec.id : undefined,
      getClientRect: (options?: { relativeTo?: unknown }) =>
        options?.relativeTo ? spec.documentRect : (spec.viewRect ?? spec.documentRect),
      toCanvas,
    };
  });
  const stage = {
    findOne: (predicate: (node: (typeof nodes)[number]) => boolean) => nodes.find(predicate),
  } as unknown as Konva.Stage;
  return { stage, toCanvasById };
}

function textEl(
  id: string,
  overrides: Partial<PsdTextElLike> = {},
): PsdTextElLike {
  return {
    id,
    type: "text",
    text: "Hello 안녕",
    x: 20,
    y: 30,
    width: 220,
    fontSize: 32,
    fill: "#123456",
    rotation: 0,
    font: "Arial, sans-serif",
    align: "left",
    fontStyle: "normal",
    ...overrides,
  };
}

async function parseResult(result: Awaited<ReturnType<typeof exportPagePsd>>) {
  return readPsd(new Uint8Array(await result.blob.arrayBuffer()), {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
}

describe("PSD editable text one-way export", () => {
  it("round-trips a supported horizontal TextEl descriptor on its existing raster layer", async () => {
    const image: PsdExportEl = {
      id: "base",
      type: "image",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      name: "Base",
    };
    const text = textEl("caption", {
      name: "Caption",
      align: "center",
      blendMode: "multiply",
      clipBelow: true,
      fill: "#123456cc",
      fontStyle: "bold italic",
      letterSpacing: 1.6,
      lineHeight: 1.25,
      opacity: 0.42,
    });
    const { stage, toCanvasById } = fakeStage([
      { id: "base", documentRect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: "caption", documentRect: { x: 20, y: 30, width: 220, height: 48 } },
    ]);

    const result = await exportPagePsd(stage, [image, text], 720, 1_080, 1, {
      includeBackground: false,
    });
    const parsed = await parseResult(result);
    const caption = parsed.children?.find((layer) => layer.name === "Caption");

    expect(result.layerCount).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(result.lossManifest?.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: "text", disposition: "preserved", count: 1 }),
    ]));
    expect(parsed.children).toHaveLength(2);
    expect(caption).toBeDefined();
    expect(caption).toMatchObject({
      left: 20,
      top: 30,
      right: 240,
      bottom: 78,
      blendMode: "multiply",
      clipping: true,
    });
    expect(caption?.opacity).toBeCloseTo(0.42, 2);
    expect(caption?.text).toMatchObject({
      text: "Hello 안녕",
      transform: [1, 0, 0, 1, 20, 30],
      orientation: "horizontal",
      shapeType: "box",
      boxBounds: [0, 0, 220, 48],
      paragraphStyle: { justification: "center" },
      style: {
        font: { name: "ArialMT" },
        fontSize: 32,
        fauxBold: true,
        fauxItalic: true,
        leading: 40,
        tracking: 50,
      },
    });
    expect(caption?.text?.style?.fillColor).toMatchObject({
      r: expect.closeTo(18, 2),
      g: expect.closeTo(52, 2),
      b: expect.closeTo(86, 2),
      a: expect.closeTo(204, 2),
    });
    expect(toCanvasById.get("base")).toHaveBeenCalledOnce();
    expect(toCanvasById.get("caption")).toHaveBeenCalledOnce();
  });

  it("round-trips rotation, vertical, curve, unsupported font, gradient, and effects as raster fallback", async () => {
    const elements = [
      textEl("rotation", { name: "Rotation", rotation: 12 }),
      textEl("vertical", { name: "Vertical", vertical: true }),
      textEl("curve", { name: "Curve", textPath: { shape: "arcUp" } }),
      textEl("font", { name: "Font", font: "'Uploaded Personal Font', cursive" }),
      textEl("gradient", { name: "Gradient", fillType: "gradient" }),
      textEl("effect", { name: "Effect", stroke: "#ffffff", strokeWidth: 2 }),
    ] satisfies PsdTextElLike[];
    const specs = elements.map((element, index) => ({
      id: element.id,
      documentRect: { x: 20, y: 30 + index * 50, width: 220, height: 40 },
    }));
    const { stage } = fakeStage(specs);

    const result = await exportPagePsd(stage, elements, 720, 1_080, 1, {
      includeBackground: false,
    });
    const parsed = await parseResult(result);
    const layers = new Map(parsed.children?.map((layer) => [layer.name, layer]));

    expect(result.layerCount).toBe(elements.length);
    for (const name of ["Rotation", "Vertical", "Curve", "Font", "Gradient", "Effect"]) {
      expect(layers.get(name)?.text, `${name} must stay raster-only`).toBeUndefined();
    }
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Rotation: 회전/u),
      expect.stringMatching(/^Vertical: 세로쓰기/u),
      expect.stringMatching(/^Curve: 곡선 텍스트/u),
      expect.stringMatching(/^Font: 지원하지 않는 글꼴\(Uploaded Personal Font\)/u),
      expect.stringMatching(/^Gradient: 그라데이션 채우기/u),
      expect.stringMatching(/^Effect: 외곽선 효과/u),
    ]));
    expect(result.skipped).toHaveLength(elements.length);
    expect(result.lossManifest?.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        feature: "text",
        disposition: "rasterized",
        count: elements.length,
      }),
    ]));
  });

  it("keeps the bounded eligibility matrix explicit for inactive effects, size, color, and panel clipping", () => {
    const supported = planPsdEditableTextDescriptor(
      textEl("flat", {
        fillType: "solid",
        shadowColor: "#000000",
        shadowOpacity: 0,
        stroke: "#ffffff",
        strokeWidth: 0,
        textPath: { shape: "none" },
      }),
      { documentX: 4, documentY: 5, documentHeight: 40, scale: 2 },
    );
    expect(supported.fallbackReasons).toEqual([]);
    expect(supported.text).toMatchObject({
      transform: [1, 0, 0, 1, 8, 10],
      right: 440,
      bottom: 80,
      style: { fontSize: 64 },
    });

    expect(planPsdEditableTextDescriptor(
      textEl("too-large", { fontSize: 700 }),
      { documentX: 0, documentY: 0, documentHeight: 40, scale: 2 },
    )).toMatchObject({
      text: null,
      fallbackReasons: [expect.stringMatching(/^지원하지 않는 글자 크기/u)],
    });
    expect(planPsdEditableTextDescriptor(
      textEl("css-color", { fill: "rgb(1, 2, 3)" }),
      { documentX: 0, documentY: 0, documentHeight: 40, scale: 1 },
    )).toMatchObject({
      text: null,
      fallbackReasons: ["지원하지 않는 단색(rgb(1, 2, 3))"],
    });
    expect(planPsdEditableTextDescriptor(
      textEl("clipped"),
      { documentX: 0, documentY: 0, documentHeight: 40, scale: 1, panelClipped: true },
    )).toMatchObject({
      text: null,
      fallbackReasons: ["패널 경계 클리핑"],
    });
  });
});

describe("PSD export capability and loss preflight", () => {
  it("fails PSB and unsafe PSD dimensions before raster capture", async () => {
    expect(preflightPsdExport({
      canvasW: 720,
      canvasH: 1_080,
      layerCount: 1,
      container: "psb",
    })).toMatchObject({
      canExport: false,
      blockingReasons: [expect.stringContaining("PSB")],
      lossManifest: {
        target: { container: "psb" },
        decisions: expect.arrayContaining([
          expect.objectContaining({ disposition: "blocked" }),
        ]),
      },
    });
    expect(preflightPsdExport({
      canvasW: PSD_EXPORT_MAX_DIMENSION_PX + 1,
      canvasH: 1,
      layerCount: 1,
    })).toMatchObject({
      canExport: false,
      blockingReasons: [expect.stringContaining("안전 한 변")],
    });

    const { stage } = fakeStage([]);
    await expect(exportPagePsd(stage, [], 720, 1_080, 1, {
      container: "psb",
    })).rejects.toThrow("PSB 내보내기");
  });

  it("reports masks, smart filters, groups, and editable 3D scenes as rasterized/dropped", async () => {
    const image: PsdExportEl = {
      id: "scene",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      groupId: "group-a",
      maskSrc: "data:image/png;base64,MASK",
      filterMaskSrc: "data:image/png;base64,FILTER_MASK",
      smartFilters: { entries: [{ id: "blur" }] },
      bg3dScene: { version: 1 },
    };
    const { stage } = fakeStage([
      { id: "scene", documentRect: { x: 0, y: 0, width: 100, height: 100 } },
    ]);
    const result = await exportPagePsd(stage, [image], 720, 1_080, 1, {
      includeBackground: false,
    });
    expect(result.lossManifest?.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: "groups", disposition: "dropped", count: 1 }),
      expect.objectContaining({ feature: "layer-mask", disposition: "rasterized", count: 1 }),
      expect.objectContaining({ feature: "adjustment-layer", disposition: "rasterized", count: 1 }),
      expect.objectContaining({ feature: "smart-object", disposition: "rasterized", count: 1 }),
    ]));
  });
});
