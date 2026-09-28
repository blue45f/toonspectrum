import { describe, expect, it } from "vitest";

import { studioFilterComparisonBandHeight } from "./studio-filter-comparison-region";

const band = { x: 100, y: 503, width: 600, height: 180 };
const panel = { x: 500, y: 678.390625, width: 300, height: 310 };

describe("필터 비교 띠의 실제 가림 제외", () => {
  it("패널이 기존 180px 띠를 일부 가려도 같은 상단 163px만 비교한다", () => {
    expect(studioFilterComparisonBandHeight(band, panel)).toBe(163);
    expect(band.y + studioFilterComparisonBandHeight(band, panel)).toBeLessThan(panel.y - 12);
  });
  it("패널 아래 공간이 충분하면 원래 비교 범위를 줄이지 않는다", () => {
    expect(studioFilterComparisonBandHeight(band, { ...panel, y: 800 })).toBe(180);
  });
  it.each([{ ...panel, x: 730 }, { ...panel, x: -300 }, { ...panel, y: 100 }])(
    "비교 띠를 가리지 않는 패널 %j는 전체 원본을 유지한다",
    (rect) => { expect(studioFilterComparisonBandHeight(band, rect)).toBe(180); },
  );
  it("비교할 픽셀이 충분하지 않으면 빈 영역으로 성공 처리하지 않는다", () => {
    expect(() => studioFilterComparisonBandHeight(band, { ...panel, y: 550 })).toThrow("120px");
  });
  it("119px로 줄어든 비교는 거부하고 120px 이상의 실제 픽셀을 요구한다", () => {
    expect(() => studioFilterComparisonBandHeight(band, { ...panel, y: band.y + 12 + 119.9 })).toThrow("120px");
    expect(studioFilterComparisonBandHeight(band, { ...panel, y: band.y + 12 + 120 })).toBe(120);
  });
  it("패널이 옆에 있어도 원본 띠 자체가 120px보다 작으면 거절한다", () => {
    expect(() => studioFilterComparisonBandHeight({ ...band, height: 119 }, { ...panel, x: 730 })).toThrow("120px");
  });
  it.each([{ ...panel, y: NaN }, { ...panel, width: 0 }, { ...panel, height: -1 }])(
    "손상된 화면 좌표 %j를 거부한다",
    (rect) => { expect(() => studioFilterComparisonBandHeight(band, rect)).toThrow("화면 좌표"); },
  );
});
