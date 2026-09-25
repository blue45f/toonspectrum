import { describe, expect, it, vi } from "vitest";

import { exportStudioAppearanceSvg } from "./studio-svg-export-appearance";
import { encodeSvgBrushTexturePng } from "./studio-svg-export-png";

function encodedPng(size = 8): string {
  const pixels = Uint8ClampedArray.from({ length: size * size * 4 }, (_, index) => index % 256);
  const png = encodeSvgBrushTexturePng(pixels, size);
  if (!png) throw new Error("테스트 PNG 생성 실패");
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

describe("외관 보존 SVG", () => {
  it("선택 해상도의 원본 PNG와 알파를 바이트 그대로 내장한다", async () => {
    const png = encodedPng();
    const toDataURL = vi.fn(() => png);
    const result = await exportStudioAppearanceSvg({ width: 8, height: 8, toDataURL });
    expect(toDataURL).toHaveBeenCalledExactlyOnceWith("image/png");
    expect(result).toMatchObject({ pixelWidth: 8, pixelHeight: 8 });
    expect(result.svg).toContain('width="8" height="8" viewBox="0 0 8 8"');
    expect(result.svg).toContain(`href="${png}"`);
    expect(result.svg).toContain("벡터로 편집할 수 없습니다");
    expect(result.svg).not.toContain("<rect");
  });

  it("PNG의 실제 크기가 캡처와 다르면 저장하지 않는다", async () => {
    await expect(exportStudioAppearanceSvg({ width: 16, height: 16, toDataURL: () => encodedPng(8) }))
      .rejects.toThrow("캡처와 PNG의 크기가 달라");
  });

  it.each(["data:image/jpeg;base64,AAAA", "data:image/png;base64,AAAA", "data:image/png;base64,\"/><script/>"])(
    "PNG 계약을 벗어난 결과를 내장하지 않는다: %s", async (source) => {
      await expect(exportStudioAppearanceSvg({ width: 8, height: 8, toDataURL: () => source })).rejects.toThrow();
    },
  );

  it("빈 캡처는 인코딩 전에 중단한다", async () => {
    const toDataURL = vi.fn(() => encodedPng());
    await expect(exportStudioAppearanceSvg({ width: 0, height: 8, toDataURL })).rejects.toThrow("픽셀 크기");
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("취소된 작업은 원본 인코딩을 시작하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const toDataURL = vi.fn(() => encodedPng());
    await expect(exportStudioAppearanceSvg({ width: 8, height: 8, toDataURL }, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(toDataURL).not.toHaveBeenCalled();
  });
});
