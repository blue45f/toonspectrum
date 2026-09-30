import { describe, expect, it } from "vitest";

import { sampleCutImageUri, SAMPLE_CUT_IMAGE_URIS } from "./motion-webtoon-sample-art";

describe("motion-webtoon-sample-art", () => {
  it("컷 이미지 3종을 제공한다", () => {
    expect(SAMPLE_CUT_IMAGE_URIS).toHaveLength(3);
    for (const uri of SAMPLE_CUT_IMAGE_URIS) {
      expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
      const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('viewBox="0 0 600 800"');
    }
  });

  it("3종의 SVG가 서로 다르다", () => {
    const [a, b, c] = SAMPLE_CUT_IMAGE_URIS;
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it("인덱스가 순환한다", () => {
    expect(sampleCutImageUri(0)).toBe(SAMPLE_CUT_IMAGE_URIS[0]);
    expect(sampleCutImageUri(3)).toBe(SAMPLE_CUT_IMAGE_URIS[0]);
    expect(sampleCutImageUri(-1)).toBe(SAMPLE_CUT_IMAGE_URIS[2]);
  });

  it("데이터 URI에 위험한 스크립트 태그가 없다", () => {
    for (const uri of SAMPLE_CUT_IMAGE_URIS) {
      const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
      expect(svg.toLowerCase()).not.toContain("<script");
      expect(svg).not.toContain("javascript:");
    }
  });
});
