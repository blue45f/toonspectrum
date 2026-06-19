import { describe, it, expect } from "vitest";

import { containFitInFrame, coverFitInFrame, estimateBubbleHeight } from "./studio-fit";

const frame = { x: 100, y: 200, width: 400, height: 300 };

describe("coverFitInFrame", () => {
  it("프레임을 덮고(둘 중 큰 비율) 중앙 정렬한다", () => {
    // 정사각형 200×200을 400×300에 cover → ratio = max(2, 1.5) = 2 → 400×400
    const r = coverFitInFrame({ width: 200, height: 200 }, frame);
    expect(r.width).toBe(400);
    expect(r.height).toBe(400);
    expect(r.x).toBe(100); // (400-400)/2 = 0 → frame.x
    expect(r.y).toBe(200 + (300 - 400) / 2); // 중앙(세로로 넘침)
  });

  it("cover는 프레임의 한 변 이상을 항상 채운다", () => {
    const r = coverFitInFrame({ width: 800, height: 100 }, frame);
    expect(r.width).toBeGreaterThanOrEqual(frame.width);
    expect(r.height).toBeGreaterThanOrEqual(frame.height);
  });

  it("0 크기는 프레임 그대로", () => {
    expect(coverFitInFrame({ width: 0, height: 100 }, frame)).toEqual({ x: 100, y: 200, width: 400, height: 300 });
  });
});

describe("containFitInFrame", () => {
  it("프레임 안에 맞추고(둘 중 작은 비율) 잘리지 않는다", () => {
    // 200×200 → contain 400×300 → ratio min(2,1.5)=1.5 → 300×300
    const r = containFitInFrame({ width: 200, height: 200 }, frame);
    expect(r.width).toBe(300);
    expect(r.height).toBe(300);
    expect(r.width).toBeLessThanOrEqual(frame.width);
    expect(r.height).toBeLessThanOrEqual(frame.height);
  });

  it("패딩을 적용하면 더 작게 맞춘다", () => {
    const noPad = containFitInFrame({ width: 200, height: 200 }, frame, 0);
    const pad = containFitInFrame({ width: 200, height: 200 }, frame, 20);
    expect(pad.width).toBeLessThan(noPad.width);
  });
});

describe("estimateBubbleHeight", () => {
  it("긴 텍스트는 짧은 텍스트보다 높다", () => {
    const short = estimateBubbleHeight("짧음", 300, 22);
    const long = estimateBubbleHeight("아주 길고 긴 대사를 적어 여러 줄로 늘어나게 만들면 높이가 커져야 한다 정말로 그래야 한다", 300, 22);
    expect(long).toBeGreaterThan(short);
  });

  it("명시적 줄바꿈을 반영한다", () => {
    const oneLine = estimateBubbleHeight("가", 300, 22);
    const threeLines = estimateBubbleHeight("가\n나\n다", 300, 22);
    expect(threeLines).toBeGreaterThan(oneLine);
  });

  it("최소 높이를 보장하고 항상 양수", () => {
    const h = estimateBubbleHeight("", 300, 22);
    expect(h).toBeGreaterThan(0);
    expect(Number.isFinite(h)).toBe(true);
  });

  it("좁은 폭은 더 많은 줄로 줄바꿈돼 높이가 커진다", () => {
    const wide = estimateBubbleHeight("같은 길이의 대사 같은 길이의 대사", 500, 22);
    const narrow = estimateBubbleHeight("같은 길이의 대사 같은 길이의 대사", 150, 22);
    expect(narrow).toBeGreaterThan(wide);
  });
});
