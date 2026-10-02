import { describe, expect, it } from "vitest";

import { campusSoftGroundShadow, campusSoftShadowStops } from "./studio-virtual-space-campus-shadow";

type ShadowContext = Parameters<typeof campusSoftGroundShadow>[0];

function createFakeContext() {
  const stops: { offset: number; color: string }[] = [];
  const calls: string[] = [];
  const gradient = {
    addColorStop(offset: number, color: string) {
      stops.push({ offset, color });
    },
  };
  const context: ShadowContext = {
    save() {
      calls.push("save");
    },
    restore() {
      calls.push("restore");
    },
    translate(x: number, y: number) {
      calls.push(`translate:${x},${y}`);
    },
    scale(x: number, y: number) {
      calls.push(`scale:${x},${y}`);
    },
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
      calls.push(`gradient:${x0},${y0},${r0},${x1},${y1},${r1}`);
      return gradient as unknown as CanvasGradient;
    },
    fillStyle: "#000000",
    beginPath() {
      calls.push("beginPath");
    },
    arc(x: number, y: number, radius: number) {
      calls.push(`arc:${x},${y},${radius}`);
    },
    fill() {
      calls.push("fill");
    },
  };
  return { context, stops, calls };
}

describe("campusSoftShadowStops", () => {
  it("중심에서 가장자리로 단조 감소해 0으로 끝난다", () => {
    const stops = campusSoftShadowStops(0.25);
    expect(stops[0]).toEqual({ offset: 0, alpha: 0.25 });
    expect(stops[stops.length - 1]).toEqual({ offset: 1, alpha: 0 });
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i]!.offset).toBeGreaterThan(stops[i - 1]!.offset);
      expect(stops[i]!.alpha).toBeLessThan(stops[i - 1]!.alpha);
    }
  });

  it("alpha를 0~1로 clamp한다", () => {
    expect(campusSoftShadowStops(1.4)[0]!.alpha).toBe(1);
    expect(campusSoftShadowStops(-0.2)[0]!.alpha).toBe(0);
  });
});

describe("campusSoftGroundShadow", () => {
  it("ry/rx로 눌린 라디얼 그라디언트 타원을 그리고 stops를 그대로 전달한다", () => {
    const fake = createFakeContext();
    campusSoftGroundShadow(fake.context, 0x0b0d1a, 100, 50, 40, 8, 0.25);
    expect(fake.calls).toContain("translate:100,50");
    expect(fake.calls).toContain("scale:1,0.2");
    expect(fake.calls).toContain("gradient:0,0,0,0,0,40");
    expect(fake.calls).toContain("arc:0,0,40");
    expect(fake.calls[0]).toBe("save");
    expect(fake.calls[fake.calls.length - 1]).toBe("restore");
    expect(fake.stops.map((stop) => stop.offset)).toEqual([0, 0.55, 0.8, 1]);
    expect(fake.stops[0]!.color).toBe("rgba(11,13,26,0.25)");
    expect(fake.stops[fake.stops.length - 1]!.color).toBe("rgba(11,13,26,0)");
    expect(fake.context.fillStyle).not.toBe("#000000");
  });

  it("반경이 0 이하이면 아무것도 그리지 않는다", () => {
    const fake = createFakeContext();
    campusSoftGroundShadow(fake.context, 0x0b0d1a, 0, 0, 0, 8, 0.25);
    campusSoftGroundShadow(fake.context, 0x0b0d1a, 0, 0, 40, -1, 0.25);
    expect(fake.calls).toEqual([]);
  });
});
