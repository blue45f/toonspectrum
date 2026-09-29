import { describe, expect, it } from "vitest";

import {
  deleteFrame,
  mergeFrames,
  setFramesBorderWidth,
  setFramesGutter,
  splitCellsArea,
  splitFrame,
  splitFrameToFrames,
  mangaRectArea,
  type MangaFrame,
} from "./manga-frame";

function makeFrames(): MangaFrame[] {
  return [
    { id: "a", rect: { x: 0, y: 0, w: 100, h: 100 }, borderWidth: 2, gutter: 8 },
    { id: "b", rect: { x: 108, y: 0, w: 100, h: 100 }, borderWidth: 2, gutter: 8 },
    { id: "c", rect: { x: 0, y: 108, w: 208, h: 92 }, borderWidth: 2, gutter: 8 },
  ];
}

describe("splitFrame", () => {
  it("사각 영역을 2행×2열로 gutter 포함 분할한다", () => {
    const cells = splitFrame({ x: 0, y: 0, w: 200, h: 100 }, 2, 2, 10);
    expect(cells).toHaveLength(4);
    // 셀 크기: (200-10)/2 = 95, (100-10)/2 = 45
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 95, h: 45 });
    expect(cells[1]).toEqual({ x: 105, y: 0, w: 95, h: 45 });
    expect(cells[2]).toEqual({ x: 0, y: 55, w: 95, h: 45 });
    expect(cells[3]).toEqual({ x: 105, y: 55, w: 95, h: 45 });
  });

  it("분할된 셀의 순수 면적(gutter 제외)이 기대값과 일치한다", () => {
    const rect = { x: 10, y: 20, w: 300, h: 200 };
    const rows = 3;
    const cols = 4;
    const gutter = 12;
    const cells = splitFrame(rect, rows, cols, gutter);

    const cellW = (rect.w - gutter * (cols - 1)) / cols;
    const cellH = (rect.h - gutter * (rows - 1)) / rows;
    const expectedCellArea = rows * cols * cellW * cellH;

    expect(splitCellsArea(cells)).toBeCloseTo(expectedCellArea, 6);
    // gutter를 포함한 전체 점유 면적 = 원본 면적
    const gutterArea = mangaRectArea(rect) - expectedCellArea;
    expect(gutterArea).toBeGreaterThan(0);
    // 셀들이 서로 겹치지 않고 gutter만큼 떨어져 있다
    const first = cells[0]!;
    const second = cells[1]!;
    expect(second.x - (first.x + first.w)).toBeCloseTo(gutter, 6);
  });

  it("입력 rect를 변경하지 않는 순수 함수이다", () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    splitFrame(rect, 2, 3, 5);
    expect(rect).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("rows/cols가 1 미만이면 1로 보정하고 음수 gutter는 0으로 보정한다", () => {
    const cells = splitFrame({ x: 0, y: 0, w: 100, h: 100 }, 0, -2, -5);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("gutter가 영역보다 크면 셀 크기가 0으로 클램프된다", () => {
    const cells = splitFrame({ x: 0, y: 0, w: 20, h: 20 }, 2, 2, 50);
    expect(cells).toHaveLength(4);
    for (const cell of cells) {
      expect(cell.w).toBe(0);
      expect(cell.h).toBe(0);
    }
  });
});

describe("splitFrameToFrames", () => {
  it("프레임 배열을 생성하고 id/테두리/간격을 부여한다", () => {
    const frames = splitFrameToFrames(
      { x: 0, y: 0, w: 200, h: 100 },
      1,
      2,
      8,
      3,
      (r, c) => `f${r}-${c}`,
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ id: "f0-0", borderWidth: 3, gutter: 8 });
    expect(frames[1]).toMatchObject({ id: "f0-1" });
  });
});

describe("프레임 일괄 조정", () => {
  it("setFramesGutter가 모든 프레임의 간격을 일괄 변경하고 원본을 보존한다", () => {
    const frames = makeFrames();
    const next = setFramesGutter(frames, 16);
    expect(next.every((f) => f.gutter === 16)).toBe(true);
    expect(frames[0]!.gutter).toBe(8);
  });

  it("setFramesBorderWidth가 테두리 두께를 일괄 변경한다", () => {
    const next = setFramesBorderWidth(makeFrames(), 5);
    expect(next.every((f) => f.borderWidth === 5)).toBe(true);
  });
});

describe("deleteFrame", () => {
  it("지정한 id의 프레임을 제거한다", () => {
    const next = deleteFrame(makeFrames(), "b");
    expect(next.map((f) => f.id)).toEqual(["a", "c"]);
  });
});

describe("mergeFrames", () => {
  it("여러 프레임을 바운딩 박스 하나의 프레임으로 병합한다", () => {
    const merged = mergeFrames(makeFrames(), ["a", "b", "c"]);
    expect(merged).not.toBeNull();
    expect(merged!.rect).toEqual({ x: 0, y: 0, w: 208, h: 200 });
    expect(merged!.borderWidth).toBe(2);
  });

  it("유효한 프레임이 없으면 null을 반환한다", () => {
    expect(mergeFrames(makeFrames(), ["zzz"])).toBeNull();
  });
});
