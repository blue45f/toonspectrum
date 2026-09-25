import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { beforeAll, describe, expect, it } from "vitest";

import { exportStudioAppearanceSvg } from "./studio-svg-export-appearance";
import { encodeSvgBrushTexturePng } from "./studio-svg-export-png";

let resvgModule: typeof import("@resvg/resvg-wasm");

beforeAll(async () => {
  resvgModule = await import("@resvg/resvg-wasm");
  const require = createRequire(import.meta.url);
  await resvgModule.initWasm(await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
});

describe("외관 보존 SVG 픽셀 왕복", () => {
  it("표준 SVG 렌더러에서 색상·부분 알파·빈 배경을 원래 해상도로 재현한다", async () => {
    const size = 8;
    const source = new Uint8ClampedArray(size * size * 4);
    for (let index = 0; index < size * size; index += 1) {
      source.set([index * 3, 255 - index * 3, 96, [0, 128, 255][index % 3]!], index * 4);
    }
    const encoded = encodeSvgBrushTexturePng(source, size);
    if (!encoded) throw new Error("테스트 PNG 생성 실패");
    const { svg } = await exportStudioAppearanceSvg({
      width: size, height: size,
      toDataURL: () => `data:image/png;base64,${Buffer.from(encoded).toString("base64")}`,
    });
    const renderer = new resvgModule.Resvg(svg, { font: { loadSystemFonts: false } });
    const rendered = renderer.render();
    try {
      expect(rendered.width).toBe(size);
      expect(rendered.height).toBe(size);
      const actual = rendered.pixels;
      for (let offset = 0; offset < source.length; offset += 4) {
        const alpha = source[offset + 3]!;
        expect(actual[offset + 3]).toBe(alpha);
        for (let channel = 0; channel < 3; channel += 1) {
          // resvg의 반환 픽셀은 premultiplied RGBA다. 반올림 오차만 허용한다.
          const expected = Math.round(source[offset + channel]! * alpha / 255);
          expect(Math.abs(actual[offset + channel]! - expected)).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      rendered.free();
      renderer.free();
    }
  });
});
