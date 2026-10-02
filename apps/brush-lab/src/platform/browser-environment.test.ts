// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createBrowserLaneEnvironment, performanceClock } from "./browser-environment";

describe("browser-environment", () => {
  it("브라우저 전역을 레인 환경으로 포장한다(jsdom에는 navigator.gpu가 없어 gpu는 null)", () => {
    const env = createBrowserLaneEnvironment();
    expect(env.gpu).toBeNull();
    expect(typeof env.userAgent).toBe("string");
    expect(env.userAgent?.length).toBeGreaterThan(0);
    const canvas = env.createCanvas?.(12, 7);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas?.width).toBe(12);
    expect(canvas?.height).toBe(7);
  });

  it("시계는 performance.now 기반이며 단조 증가한다", () => {
    const clock = performanceClock();
    const a = clock.now();
    const b = clock.now();
    expect(Number.isFinite(a)).toBe(true);
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
