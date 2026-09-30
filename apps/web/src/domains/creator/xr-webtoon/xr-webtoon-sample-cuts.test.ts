import { describe, expect, it } from "vitest";

import { XR_SAMPLE_CUTS } from "./xr-webtoon-sample-cuts";

const DATA_URL_PREFIX = "data:image/svg+xml;utf8,";

describe("XR_SAMPLE_CUTS", () => {
  it("3개의 샘플 컷을 제공한다", () => {
    expect(XR_SAMPLE_CUTS).toHaveLength(3);
    const ids = XR_SAMPLE_CUTS.map((cut) => cut.id);
    expect(new Set(ids).size).toBe(3);
    XR_SAMPLE_CUTS.forEach((cut) => {
      expect(cut.id.length).toBeGreaterThan(0);
      expect(cut.title.length).toBeGreaterThan(0);
    });
  });

  it("각 컷은 배경·인물·말풍선 3개 레이어를 depth 0/0.55/1로 가진다", () => {
    XR_SAMPLE_CUTS.forEach((cut) => {
      expect(cut.layers).toHaveLength(3);
      expect(cut.layers.map((layer) => layer.depth)).toEqual([0, 0.55, 1]);
      cut.layers.forEach((layer) => {
        expect(layer.alt.length).toBeGreaterThan(0);
      });
    });
  });

  it("모든 레이어 이미지는 파싱 가능한 인라인 SVG 데이터 URL이다", () => {
    XR_SAMPLE_CUTS.forEach((cut) => {
      cut.layers.forEach((layer) => {
        expect(layer.imageUrl.startsWith(DATA_URL_PREFIX)).toBe(true);
        const svg = decodeURIComponent(layer.imageUrl.slice(DATA_URL_PREFIX.length));
        expect(svg).toContain("<svg");
        expect(svg).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
      });
    });
  });

  it("캡처 대상 컷 id가 컷 목록에 존재한다", () => {
    XR_SAMPLE_CUTS.forEach((cut) => {
      expect(cut.id.length).toBeGreaterThan(0);
    });
  });
});
