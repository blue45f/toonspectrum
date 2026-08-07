import { providerDescriptorSchema } from "@toonspectrum/studio-engine-registry";
import { UnsupportedSceneFeatureError } from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import { canvasKitProviderDescriptor } from "../descriptor";
import { loadCanvasKitNode } from "../node/index";
import { encodeRgbaToPng, renderSceneToPixels, renderSceneToPng } from "../render";

import type { ColorIR, PathIR, SceneIR, SceneNodeIR } from "@toonspectrum/studio-project-model";
import type { CanvasKit } from "canvaskit-wasm";

const SIZE = 64;
const WHITE: ColorIR = { r: 1, g: 1, b: 1, a: 1 };

function makeScene(background: ColorIR, nodes: SceneNodeIR[]): SceneIR {
  return { version: 11, width: SIZE, height: SIZE, background, nodes };
}

function rectPath(x0: number, y0: number, x1: number, y1: number): PathIR {
  return {
    verbs: [
      { v: "M", x: x0, y: y0 },
      { v: "L", x: x1, y: y0 },
      { v: "L", x: x1, y: y1 },
      { v: "L", x: x0, y: y1 },
      { v: "Z" },
    ],
  };
}

function pixelAt(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
}

function expectPixel(
  actual: readonly number[],
  expected: readonly number[],
  tolerance = 1,
): void {
  for (let channel = 0; channel < 4; channel += 1) {
    expect(Math.abs(actual[channel] - expected[channel])).toBeLessThanOrEqual(tolerance);
  }
}

let ck: CanvasKit;

beforeAll(async () => {
  ck = await loadCanvasKitNode();
});

describe("renderSceneToPixels", () => {
  it("fills a background-only scene with the exact background color", () => {
    const scene = makeScene({ r: 0.2, g: 0.4, b: 0.6, a: 1 }, []);
    const pixels = renderSceneToPixels(ck, scene);
    expect(pixels.length).toBe(SIZE * SIZE * 4);

    const expected = [51, 102, 153, 255];
    let maxDeviation = 0;
    for (let index = 0; index < pixels.length; index += 1) {
      const deviation = Math.abs(pixels[index] - expected[index % 4]);
      if (deviation > maxDeviation) maxDeviation = deviation;
    }
    expect(maxDeviation).toBeLessThanOrEqual(1);
  });

  it("fills a centered rectangle and leaves corners on the background", () => {
    const scene = makeScene(WHITE, [
      {
        id: "rect",
        kind: "fill-path",
        opacity: 1,
        blend: "src-over",
        path: rectPath(16, 16, 48, 48),
        paint: { kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 } },
        fillRule: "nonzero",
      },
    ]);
    const pixels = renderSceneToPixels(ck, scene);
    expectPixel(pixelAt(pixels, SIZE, 32, 32), [255, 0, 0, 255]);
    expectPixel(pixelAt(pixels, SIZE, 2, 2), [255, 255, 255, 255]);
    expectPixel(pixelAt(pixels, SIZE, 61, 61), [255, 255, 255, 255]);
  });

  it("is byte-for-byte deterministic across repeated renders", () => {
    const scene = makeScene(WHITE, [
      {
        id: "rect",
        kind: "fill-path",
        opacity: 0.8,
        blend: "multiply",
        path: rectPath(10, 20, 50, 44),
        paint: { kind: "solid", color: { r: 0.3, g: 0.7, b: 0.2, a: 1 } },
        fillRule: "evenodd",
      },
    ]);
    const first = renderSceneToPixels(ck, scene);
    const second = renderSceneToPixels(ck, scene);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it("strokes a round-cap line with the stroke color on and past the segment", () => {
    const scene = makeScene(WHITE, [
      {
        id: "stroke",
        kind: "stroke-path",
        opacity: 1,
        blend: "src-over",
        path: {
          verbs: [
            { v: "M", x: 12, y: 32 },
            { v: "L", x: 52, y: 32 },
          ],
        },
        paint: { kind: "solid", color: { r: 0, g: 0, b: 1, a: 1 } },
        strokeWidth: 6,
        cap: "round",
        join: "round",
        miterLimit: 4,
      },
    ]);
    const pixels = renderSceneToPixels(ck, scene);
    // On the segment.
    expectPixel(pixelAt(pixels, SIZE, 32, 32), [0, 0, 255, 255]);
    // Past the endpoint but inside the round cap radius (butt cap would be white).
    expectPixel(pixelAt(pixels, SIZE, 53, 32), [0, 0, 255, 255]);
    // Beyond the cap and away from the stroke: untouched background.
    expectPixel(pixelAt(pixels, SIZE, 58, 32), [255, 255, 255, 255]);
    expectPixel(pixelAt(pixels, SIZE, 32, 8), [255, 255, 255, 255]);
  });

  it("multiplies a 50% gray rect over white down to mid gray", () => {
    const scene = makeScene(WHITE, [
      {
        id: "gray",
        kind: "fill-path",
        opacity: 1,
        blend: "multiply",
        path: rectPath(16, 16, 48, 48),
        paint: { kind: "solid", color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
        fillRule: "nonzero",
      },
    ]);
    const pixels = renderSceneToPixels(ck, scene);
    const [r, g, b, a] = pixelAt(pixels, SIZE, 32, 32);
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(126);
      expect(channel).toBeLessThanOrEqual(129);
    }
    expect(a).toBe(255);
    expectPixel(pixelAt(pixels, SIZE, 2, 2), [255, 255, 255, 255]);
  });

  it("composites a group at opacity 0.5 (black rect over white becomes mid gray)", () => {
    const scene = makeScene(WHITE, [
      {
        id: "group",
        kind: "group",
        opacity: 0.5,
        blend: "src-over",
        children: [
          {
            id: "black",
            kind: "fill-path",
            opacity: 1,
            blend: "src-over",
            path: rectPath(16, 16, 48, 48),
            paint: { kind: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
            fillRule: "nonzero",
          },
        ],
      },
    ]);
    const pixels = renderSceneToPixels(ck, scene);
    const [r, g, b, a] = pixelAt(pixels, SIZE, 32, 32);
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(126);
      expect(channel).toBeLessThanOrEqual(129);
    }
    expect(a).toBe(255);
    expectPixel(pixelAt(pixels, SIZE, 2, 2), [255, 255, 255, 255]);
  });

  it("interpolates a linear gradient fill between its stops", () => {
    const scene = makeScene(WHITE, [
      {
        id: "gradient",
        kind: "fill-path",
        opacity: 1,
        blend: "src-over",
        path: rectPath(16, 16, 48, 48),
        paint: {
          kind: "linear-gradient",
          from: [16, 32],
          to: [48, 32],
          stops: [
            { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
        fillRule: "nonzero",
      },
    ]);
    const pixels = renderSceneToPixels(ck, scene);
    const nearStart = pixelAt(pixels, SIZE, 18, 32);
    expect(nearStart[0]).toBeGreaterThan(200);
    expect(nearStart[2]).toBeLessThan(80);
    const nearEnd = pixelAt(pixels, SIZE, 46, 32);
    expect(nearEnd[2]).toBeGreaterThan(200);
    expect(nearEnd[0]).toBeLessThan(80);
  });

  it("throws UnsupportedSceneFeatureError for text without a font asset", () => {
    const scene = makeScene(WHITE, [
      {
        id: "caption",
        kind: "text",
        opacity: 1,
        blend: "src-over",
        x: 8,
        y: 40,
        text: "ToonStudio",
        fontSizePx: 16,
        color: { r: 0, g: 0, b: 0, a: 1 },
        fontFamily: "sans-serif",
      },
    ]);
    let caught: unknown;
    try {
      renderSceneToPixels(ck, scene);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedSceneFeatureError);
    const featureError = caught as UnsupportedSceneFeatureError;
    expect(featureError.providerId).toBe("skia-canvaskit");
    expect(featureError.features).toEqual(["render.text.paragraph"]);
  });
});

describe("PNG export", () => {
  it("renderSceneToPng returns bytes with the PNG signature", () => {
    const scene = makeScene({ r: 0.2, g: 0.4, b: 0.6, a: 1 }, []);
    const png = renderSceneToPng(ck, scene);
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("encodeRgbaToPng round-trips external pixels through the PNG codec", () => {
    const scene = makeScene({ r: 0.2, g: 0.4, b: 0.6, a: 1 }, []);
    const pixels = renderSceneToPixels(ck, scene);
    const png = encodeRgbaToPng(ck, pixels, SIZE, SIZE);
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("encodeRgbaToPng rejects a pixel buffer that does not match the dimensions", () => {
    expect(() => encodeRgbaToPng(ck, new Uint8Array(16), SIZE, SIZE)).toThrow(
      /expected/,
    );
  });
});

describe("provider descriptor", () => {
  it("passes providerDescriptorSchema.parse and matches the adapter identity", () => {
    const parsed = providerDescriptorSchema.parse(canvasKitProviderDescriptor);
    expect(parsed.id).toBe("skia-canvaskit");
    expect(parsed.kind).toBe("vector-renderer");
    expect(parsed.capabilities).toContain("render.text.paragraph");
    expect(parsed.capabilities).toContain("export.png");
  });
});
