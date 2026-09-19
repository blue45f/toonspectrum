import { afterEach, describe, expect, it, vi } from "vitest";

import { encodeNativeBrushDocumentFrame } from "./studio-native-brush-document-output";
import { validateNativeBrushOutputPixels } from "./studio-native-brush-output-validation";

import type { NativeBrushDocumentClipEdges, NativeBrushProbeFrame } from "./studio-native-brush-probe-contract";

const interior = [false, false, false, false] as const;
const surface = { width: 8, height: 8 };
const patch = { x: 2, y: 2, width: 2, height: 2 };
function rgba(count = 4) { const bytes = new Uint8Array(count * 4); bytes[3] = 1; return bytes; }
function verdict(work: () => void) { try { work(); return "ok"; } catch (error) { return (error as Error).message; } }
function original(pixels: Uint8Array, width: number, height: number, edges: NativeBrushDocumentClipEdges): string {
  let visible = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!pixels[(y * width + x) * 4 + 3]) continue;
    visible = true;
    if ((x === 0 && !edges[0]) || (y === 0 && !edges[1]) || (x === width - 1 && !edges[2]) || (y === height - 1 && !edges[3])) {
      return "브러시 자국이 변환 영역을 벗어나 결과를 적용하지 않았습니다. 더 작은 굵기로 다시 시도하세요.";
    }
  }
  return visible ? "ok" : "선택한 엔진이 빈 획을 반환하여 원본을 유지했습니다.";
}

describe("native output alpha inspection", () => {
  it("preserves even alpha=1 and never treats transparent RGB as visible ink", () => {
    expect(() => validateNativeBrushOutputPixels(rgba(), patch, surface, interior)).not.toThrow();
    const transparent = new Uint8Array(16).fill(255);
    for (let i = 3; i < transparent.length; i += 4) transparent[i] = 0;
    expect(() => validateNativeBrushOutputPixels(transparent, patch, surface, interior)).toThrow(/빈 획/);
  });
  it.each([0, 1, 2, 3])("checks boundary %i rather than assuming every packed-region edge is a crop edge", (edge) => {
    const pixels = new Uint8Array(8 * 8 * 4);
    const positions = [[0, 4], [4, 0], [7, 4], [4, 7]] as const;
    const [x, y] = positions[edge]!; pixels[(y * 8 + x) * 4 + 3] = 1;
    expect(() => validateNativeBrushOutputPixels(pixels, { x: 0, y: 0, ...surface }, surface, interior)).toThrow(/변환 영역/);
    const allowed: [boolean, boolean, boolean, boolean] = [false, false, false, false]; allowed[edge] = true;
    expect(() => validateNativeBrushOutputPixels(pixels, { x: 0, y: 0, ...surface }, surface, allowed)).not.toThrow();
    expect(() => validateNativeBrushOutputPixels(rgba(), patch, surface, interior)).not.toThrow();
  });
  it.each([
    { x: -1 }, { y: -1 }, { width: 0 }, { height: 0 }, { x: 7 }, { y: 7 }, { width: 2.5 }, { height: Infinity },
  ])("rejects invalid packed region %j", (override) => {
    expect(() => validateNativeBrushOutputPixels(rgba(), { ...patch, ...override }, surface, interior)).toThrow(/Invalid native brush/);
  });
  it("rejects truncated buffers and invalid surface/clip contracts", () => {
    expect(() => validateNativeBrushOutputPixels(new Uint8Array(3), patch, surface, interior)).toThrow(/RGBA/);
    expect(() => validateNativeBrushOutputPixels(rgba(), patch, { width: 9000, height: 8 }, interior)).toThrow(/2048/);
    expect(() => validateNativeBrushOutputPixels(rgba(), patch, surface, [0, 0, 0, 0] as unknown as NativeBrushDocumentClipEdges)).toThrow(/crop boundary/);
  });
  it("matches the original full-canvas algorithm for 512 seeded full/packed edge cases", () => {
    let seed = 17;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 >>> 0; return seed; };
    for (let test = 0; test < 512; test++) {
      const width = 1 + random() % 24, height = 1 + random() % 24;
      const x = random() % width, y = random() % height;
      const w = 1 + random() % (width - x), h = 1 + random() % (height - y);
      const pixels = new Uint8Array(w * h * 4), full = new Uint8Array(width * height * 4);
      for (let i = 0; i < w * h; i++) {
        const alpha = test % 5 === 0 ? 0 : random() % 7 === 0 ? 1 + random() % 255 : 0;
        pixels[i * 4 + 3] = alpha;
        full[((y + Math.floor(i / w)) * width + x + i % w) * 4 + 3] = alpha;
      }
      const mask = test % 16;
      const edges: NativeBrushDocumentClipEdges = [Boolean(mask & 1), Boolean(mask & 2), Boolean(mask & 4), Boolean(mask & 8)];
      const expected = original(full, width, height, edges);
      expect(verdict(() => validateNativeBrushOutputPixels(pixels, { x, y, width: w, height: h }, { width, height }, edges))).toBe(expected);
      expect(verdict(() => validateNativeBrushOutputPixels(full, { x: 0, y: 0, width, height }, { width, height }, edges))).toBe(expected);
    }
  });
});

afterEach(() => vi.unstubAllGlobals());
function canvasFixture() {
  const context = { putImageData: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(() => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4); pixels[(3 * 8 + 3) * 4 + 3] = 1;
    return { data: pixels };
  }) };
  const allocated: { width: number; height: number }[] = [];
  class Canvas {
    constructor(public width: number, public height: number) { allocated.push(this); }
    getContext() { return context; }
    async convertToBlob() { return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }); }
  }
  class Image { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} }
  vi.stubGlobal("OffscreenCanvas", Canvas); vi.stubGlobal("ImageData", Image);
  return { context, allocated };
}
describe("native PNG encoder readback and lifecycle", () => {
  it("uses zero Canvas2D reads for already available packed native RGBA", async () => {
    const f = canvasFixture();
    const result = await encodeNativeBrushDocumentFrame({ kind: "pixels", ...patch, pixels: rgba() }, surface, interior);
    expect(result.pngHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(f.context.getImageData).not.toHaveBeenCalled(); expect(f.context.putImageData).toHaveBeenCalledTimes(1);
    expect(f.allocated).toEqual([{ width: 1, height: 1 }]);
  });
  it("retains one settled read for bitmap output and closes the bitmap", async () => {
    const f = canvasFixture(), close = vi.fn();
    await encodeNativeBrushDocumentFrame({ kind: "bitmap", bitmap: { ...surface, close } as unknown as ImageBitmap }, surface, interior);
    expect(f.context.getImageData).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
    expect(f.allocated).toEqual([{ width: 1, height: 1 }]);
  });
  it("rejects empty native output before allocating an output canvas", async () => {
    const f = canvasFixture();
    await expect(encodeNativeBrushDocumentFrame({ kind: "pixels", ...patch, pixels: new Uint8Array(16) }, surface, interior)).rejects.toThrow(/빈 획/);
    expect(f.allocated).toEqual([]);
  });
  it("rejects wrong bitmap dimensions and closes it even before allocation", async () => {
    const f = canvasFixture(), close = vi.fn();
    const frame = { kind: "bitmap", bitmap: { width: 7, height: 8, close } } as unknown as NativeBrushProbeFrame;
    await expect(encodeNativeBrushDocumentFrame(frame, surface, interior)).rejects.toThrow(/dimensions/);
    expect(close).toHaveBeenCalledTimes(1); expect(f.allocated).toEqual([]);
  });
  it("releases the bitmap when clip validation fails", async () => {
    const close = vi.fn(); canvasFixture();
    await expect(encodeNativeBrushDocumentFrame({ kind: "bitmap", bitmap: { ...surface, close } as unknown as ImageBitmap }, surface, [] as unknown as NativeBrushDocumentClipEdges)).rejects.toThrow(/crop boundary/);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
