import { describe, it, expect } from "vitest";

import { bubblePathData, type BubbleTailSpec } from "./studio-bubble-path";

const tail = (over: Partial<BubbleTailSpec> = {}): BubbleTailSpec => ({
  direction: "bottom",
  ratio: 0.35,
  length: 30,
  base: 36,
  side: "center",
  ...over,
});

describe("bubblePathData", () => {
  it("닫힌 path(M…Z)를 만든다", () => {
    const d = bubblePathData(200, 120, 18);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("꼬리가 없으면 둥근 사각형(바깥으로 안 나감)", () => {
    const d = bubblePathData(200, 120, 18, null);
    // 좌표는 0..200 / 0..120 범위 내(아크 포함)
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
  });

  it("아래 꼬리는 본체 아래(y>h)로 뻗는다", () => {
    const d = bubblePathData(200, 120, 18, tail({ direction: "bottom" }));
    expect(d).toContain("150"); // tip y = h(120) + length(30)
  });

  it("위 꼬리는 본체 위(y<0)로 뻗는다", () => {
    const d = bubblePathData(200, 120, 18, tail({ direction: "top" }));
    expect(d).toMatch(/-30\b/);
  });

  it("왼쪽 꼬리는 x<0, 오른쪽 꼬리는 x>w로 뻗는다", () => {
    const left = bubblePathData(200, 120, 18, tail({ direction: "left", ratio: 0.5, base: 30 }));
    expect(left).toMatch(/-30\b/);
    const right = bubblePathData(200, 120, 18, tail({ direction: "right", ratio: 0.5, base: 30 }));
    expect(right).toContain("230"); // w(200) + length(30)
  });

  it("같은 입력이면 항상 같은 결과(결정적)", () => {
    const a = bubblePathData(200, 120, 18, tail());
    const b = bubblePathData(200, 120, 18, tail());
    expect(a).toBe(b);
  });

  it("반지름은 (w,h)/2로 클램프돼 깨지지 않는다", () => {
    const d = bubblePathData(80, 60, 9999, tail());
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("Z");
  });

  it("side로 꼬리 끝이 기운다(center와 다름)", () => {
    const center = bubblePathData(200, 120, 18, tail({ side: "center" }));
    const leaned = bubblePathData(200, 120, 18, tail({ side: "right" }));
    expect(center).not.toBe(leaned);
  });
});
