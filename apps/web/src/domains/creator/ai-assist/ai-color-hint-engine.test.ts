import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_COLOR_FILL_OPTIONS,
  extractReferencePalette,
  fillColorHints,
  hexToRgb,
  pixelLuminance,
  suggestShadowHighlight,
} from "./ai-color-hint-engine";

/** 테스트용 선화 생성: 흰 배경 + 검은 사각형 테두리 */
function makeLineArt(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const isBorder = x === 4 || x === width - 5 || y === 4 || y === height - 5;
      const v = isBorder ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("hexToRgb", () => {
  it("6자리 hex를 파싱한다", () => {
    expect(hexToRgb("#ff6b6b")).toEqual([255, 107, 107]);
  });

  it("3자리 축약형을 파싱한다", () => {
    expect(hexToRgb("#f00")).toEqual([255, 0, 0]);
  });

  it("잘못된 입력은 검은색을 반환한다", () => {
    expect(hexToRgb("xyz")).toEqual([0, 0, 0]);
  });
});

describe("pixelLuminance", () => {
  it("흰색은 255, 검은색은 0이다", () => {
    expect(pixelLuminance(255, 255, 255)).toBe(255);
    expect(pixelLuminance(0, 0, 0)).toBe(0);
  });
});

describe("fillColorHints", () => {
  it("선을 넘지 않고 영역을 채운다", () => {
    const width = 20;
    const height = 20;
    const lineArt = makeLineArt(width, height);
    const { colorLayer, regions } = fillColorHints(
      lineArt,
      width,
      height,
      [{ x: 10, y: 10, color: "#ff0000" }],
      DEFAULT_AI_COLOR_FILL_OPTIONS,
    );
    expect(regions).toHaveLength(1);
    expect(regions[0].pixelCount).toBeGreaterThan(0);
    // 내부는 채워지고 테두리 바깥은 비어 있어야 함
    const inside = (10 * width + 10) * 4;
    expect(colorLayer[inside]).toBe(255);
    expect(colorLayer[inside + 3]).toBeGreaterThan(0);
    const outside = (0 * width + 0) * 4;
    expect(colorLayer[outside + 3]).toBe(0);
    // 선 위에는 칠해지지 않음
    const onLine = (4 * width + 10) * 4;
    expect(colorLayer[onLine + 3]).toBe(0);
  });

  it("범위 밖 힌트는 무시한다", () => {
    const { regions } = fillColorHints(
      makeLineArt(10, 10),
      10,
      10,
      [{ x: 999, y: 999, color: "#ff0000" }],
      DEFAULT_AI_COLOR_FILL_OPTIONS,
    );
    expect(regions).toHaveLength(0);
  });

  it("여러 힌트는 각각 영역을 만든다", () => {
    const width = 30;
    const height = 20;
    // 가운데 세로선을 추가해 두 영역으로 분리
    const lineArt = makeLineArt(width, height);
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + 15) * 4;
      lineArt[i] = 0;
      lineArt[i + 1] = 0;
      lineArt[i + 2] = 0;
    }
    const { regions, colorLayer } = fillColorHints(
      lineArt,
      width,
      height,
      [
        { x: 7, y: 10, color: "#ff0000" },
        { x: 22, y: 10, color: "#0000ff" },
      ],
      DEFAULT_AI_COLOR_FILL_OPTIONS,
    );
    expect(regions).toHaveLength(2);
    // 왼쪽 영역은 빨강, 오른쪽 영역은 파랑
    const leftPixel = (10 * width + 7) * 4;
    expect(colorLayer[leftPixel]).toBe(255);
    expect(colorLayer[leftPixel + 2]).toBe(0);
    const rightPixel = (10 * width + 22) * 4;
    expect(colorLayer[rightPixel + 2]).toBe(255);
    expect(colorLayer[rightPixel]).toBe(0);
  });
});

describe("suggestShadowHighlight", () => {
  it("광원 반대편에 그림자를 제안한다", () => {
    const bounds = { x: 0, y: 0, width: 90, height: 90 };
    const result = suggestShadowHighlight(bounds, "top-left", 1);
    // 광원이 좌상단이면 그림자는 우하단
    expect(result.shadow.x).toBeGreaterThan(bounds.x + 30);
    expect(result.shadow.y).toBeGreaterThan(bounds.y + 30);
    // 하이라이트는 좌상단
    expect(result.highlight.x).toBe(bounds.x);
    expect(result.highlight.y).toBe(bounds.y);
  });

  it("강도에 따라 불투명도가 달라진다", () => {
    const bounds = { x: 0, y: 0, width: 90, height: 90 };
    const strong = suggestShadowHighlight(bounds, "top", 1);
    const soft = suggestShadowHighlight(bounds, "top", 0.2);
    expect(strong.shadowOpacity).toBeGreaterThan(soft.shadowOpacity);
  });
});

describe("extractReferencePalette", () => {
  it("가장 많이 쓰인 색을 반환한다", () => {
    const layer = new Uint8ClampedArray(16 * 4); // 16픽셀
    // 빨강 10픽셀, 파랑 5픽셀
    for (let i = 0; i < 10; i += 1) {
      layer[i * 4] = 255;
      layer[i * 4 + 3] = 255;
    }
    for (let i = 10; i < 15; i += 1) {
      layer[i * 4 + 2] = 255;
      layer[i * 4 + 3] = 255;
    }
    const palette = extractReferencePalette(layer, 2);
    expect(palette).toHaveLength(2);
    expect(palette[0]).toBe("#ff0000");
    expect(palette[1]).toBe("#0000ff");
  });

  it("빈 레이어는 빈 배열을 반환한다", () => {
    expect(extractReferencePalette(new Uint8ClampedArray(16 * 4), 3)).toEqual([]);
  });
});
