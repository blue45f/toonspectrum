import { describe, expect, it } from "vitest";

import { studioFilterComparisonClip } from "./studio-filter-comparison-clip";

const canvas = { x: 460, y: 503, width: 340, height: 420 };
const dialog = { x: 800, y: 678.390625, width: 420, height: 390 };

describe("필터 미리보기 비교 영역", () => {
  it("변경된 상단 안내 높이에도 패널과 겹치지 않는 동일 좌표 띠를 선택한다", () => {
    const clip = studioFilterComparisonClip(canvas, dialog);
    expect(clip).toEqual({ ...canvas, height: 167 });
    expect(clip.y + clip.height + 8).toBeLessThanOrEqual(dialog.y);
  });
  it("넓은 공간에서는 기존 180px 범위를 유지한다", () => {
    expect(studioFilterComparisonClip(canvas, { ...dialog, y: 800 }).height).toBe(180);
  });
  it("픽셀 검사가 의미 없을 정도로 좁아지면 통과시키지 않는다", () => {
    expect(() => studioFilterComparisonClip(canvas, { ...dialog, y: 610 })).toThrow("120px");
  });
  it("잘못된 측정값은 거절한다", () => {
    expect(() => studioFilterComparisonClip({ ...canvas, width: NaN }, dialog)).toThrow("실제 위치");
  });
});
