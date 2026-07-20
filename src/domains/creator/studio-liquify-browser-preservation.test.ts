import { afterEach, describe, expect, it, vi } from "vitest";

import { bakeLiquifyStrokeToCanvas, type LiquifyCanvasFactory } from "./studio-liquify-browser";

import type { StudioImageDataLike } from "./studio-filters";
import type { MaskImageSource } from "./studio-selection-tools";

type TestSource = MaskImageSource & { pixels: StudioImageDataLike };

afterEach(() => {
  vi.unstubAllGlobals();
});

function patternedImage(width: number, height: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = index % 251;
    data[index * 4 + 1] = (index * 3) % 253;
    data[index * 4 + 2] = (index * 7) % 255;
    data[index * 4 + 3] = 255;
  }
  return { data, width, height };
}

describe("bakeLiquifyStrokeToCanvas source preservation", () => {
  it("Worker의 plain 결과를 native ImageData로 복원한 뒤 캔버스에 기록한다", async () => {
    class NativeImageDataStub {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    }
    vi.stubGlobal("ImageData", NativeImageDataStub);

    const source: TestSource = { pixels: patternedImage(8, 8) };
    let written: unknown = null;
    const factory: LiquifyCanvasFactory = (width, height) => ({
      canvas: { width, height } as MaskImageSource & { width: number; height: number },
      ctx: {
        fillStyle: "#fff",
        strokeStyle: "#fff",
        globalCompositeOperation: "source-over",
        filter: "none",
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        fillRect: () => {},
        clearRect: () => {},
        drawImage: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray(source.pixels.data),
          width,
          height,
        }),
        putImageData: (next) => {
          written = next;
        },
      },
    });

    await bakeLiquifyStrokeToCanvas(
      source,
      8,
      8,
      [{ x: 4, y: 4 }],
      3,
      0.6,
      factory,
      { mode: "bloat" },
    );

    expect(written).toBeInstanceOf(NativeImageDataStub);
  });

  it("work draw가 투명하게 남아도 frozen 스냅샷으로 초기화해 단일 bloat 밖의 픽셀을 보존한다", async () => {
    const width = 64;
    const height = 64;
    const source: TestSource = { pixels: patternedImage(width, height) };
    const buffers = new Map<number, StudioImageDataLike>();
    let canvasId = 0;
    const factory: LiquifyCanvasFactory = (canvasWidth, canvasHeight) => {
      canvasId += 1;
      const id = canvasId;
      let pixels: StudioImageDataLike = {
        data: new Uint8ClampedArray(canvasWidth * canvasHeight * 4),
        width: canvasWidth,
        height: canvasHeight,
      };
      buffers.set(id, pixels);
      return {
        canvas: { width: canvasWidth, height: canvasHeight, id } as MaskImageSource & {
          width: number;
          height: number;
          id: number;
        },
        ctx: {
          fillStyle: "#fff",
          strokeStyle: "#fff",
          globalCompositeOperation: "source-over",
          filter: "none",
          lineWidth: 1,
          lineCap: "butt",
          lineJoin: "miter",
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          fillRect: () => {},
          clearRect: () => {},
          // 첫 frozen 캔버스만 정상 스냅샷을 얻고, 두 번째 work draw는 브라우저 context
          // 복구 타이밍을 모사해 투명 버퍼를 유지한다.
          drawImage: (image) => {
            if (id !== 1) return;
            const input = (image as TestSource).pixels;
            pixels = { data: new Uint8ClampedArray(input.data), width: input.width, height: input.height };
          },
          getImageData: () => ({
            data: new Uint8ClampedArray(pixels.data),
            width: pixels.width,
            height: pixels.height,
          }),
          putImageData: (next) => {
            pixels = { data: new Uint8ClampedArray(next.data), width: next.width, height: next.height };
            buffers.set(id, pixels);
          },
        },
      };
    };

    const output = await bakeLiquifyStrokeToCanvas(
      source,
      width,
      height,
      [{ x: 32, y: 32 }],
      10,
      0.8,
      factory,
      { mode: "bloat" },
    );

    expect(output).not.toBeNull();
    const result = buffers.get(2)!;
    const farOffset = (4 * width + 4) * 4;
    expect(result.data.slice(farOffset, farOffset + 4)).toEqual(
      source.pixels.data.slice(farOffset, farOffset + 4),
    );
    let transparentPixels = 0;
    for (let offset = 3; offset < result.data.length; offset += 4) {
      if (result.data[offset] !== 255) transparentPixels += 1;
    }
    expect(transparentPixels).toBe(0);
  });
});
