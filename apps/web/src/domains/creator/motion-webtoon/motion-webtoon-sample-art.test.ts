import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sampleCutImageUri, SAMPLE_CUT_IMAGE_URIS } from "./motion-webtoon-sample-art";

const ASSET_DIR = join(__dirname, "../../../../public/assets/motion-webtoon");

describe("motion-webtoon-sample-art", () => {
  it("컷 이미지 3종을 제공한다", () => {
    expect(SAMPLE_CUT_IMAGE_URIS).toHaveLength(3);
    for (const uri of SAMPLE_CUT_IMAGE_URIS) {
      // 자체 에셋 경로 (외부 플레이스홀더 의존 없음)
      expect(uri.startsWith("/assets/motion-webtoon/")).toBe(true);
      expect(uri.endsWith(".svg")).toBe(true);
    }
  });

  it("3종의 에셋 경로가 서로 다르다", () => {
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

  it("에셋 SVG 파일이 존재하고 유효하다", () => {
    for (const uri of SAMPLE_CUT_IMAGE_URIS) {
      const fileName = uri.split("/").pop() as string;
      const svg = readFileSync(join(ASSET_DIR, fileName), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('viewBox="0 0 600 800"');
      // 위험한 스크립트 없음
      expect(svg.toLowerCase()).not.toContain("<script");
      expect(svg).not.toContain("javascript:");
    }
  });
});
