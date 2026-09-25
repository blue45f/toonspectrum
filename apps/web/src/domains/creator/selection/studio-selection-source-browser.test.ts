import { afterEach, describe, expect, it, vi } from "vitest";
import { readStudioSelectionSourceSize, selectOpaqueFromImageSource } from "../studio-selection-source-browser";
import { pointInSelection } from "../studio-selection-tools";

afterEach(() => vi.unstubAllGlobals());

describe("원본 알파의 타일 읽기", () => {
  it("2560px 이미지를 축소하지 않고 256행씩 읽어 독립 픽셀을 보존한다", async () => {
    let tileTop = 0;
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn((_image: unknown, _x: number, y: number) => { tileTop = -y; }),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        if (500 >= tileTop && 500 < tileTop + height) data[((500 - tileTop) * width + 1500) * 4 + 3] = 255;
        return { data };
      }),
    };
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    vi.stubGlobal("Image", class {
      naturalWidth = 2560; naturalHeight = 1280;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    expect(await readStudioSelectionSourceSize("image")).toEqual({ width: 2560, height: 1280 });
    const result = await selectOpaqueFromImageSource({ src: "image", selection: null, operation: "replace" });
    expect(context.getImageData).toHaveBeenCalledTimes(5);
    expect(context.getImageData.mock.calls.every((call) => call[2] === 2560 && call[3] === 256)).toBe(true);
    expect(pointInSelection(result, { x: 1500.5 / 2560, y: 500.5 / 1280 })).toBe(true);
    expect(pointInSelection(result, { x: 1501.5 / 2560, y: 500.5 / 1280 })).toBe(false);
  });
});
