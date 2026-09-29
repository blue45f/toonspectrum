import { describe, expect, it } from "vitest";

import { createDefaultSubToolParams, normalizeSubToolParams } from "./subtool-params";
import { renderSubToolStrokePreview } from "./subtool-stroke-render";

/** canvas 2D 컨텍스트를 흉내 내는 fake. 모든 호출을 문자열 로그로 기록한다. */
function createFakeContext(): {
  ctx: CanvasRenderingContext2D;
  calls: string[];
} {
  const calls: string[] = [];
  const format = (value: unknown): string =>
    typeof value === "number" ? value.toFixed(4) : String(value);
  const ctx = new Proxy(
    {},
    {
      get: (_target, prop) => {
        return (...args: unknown[]) => {
          calls.push(`${String(prop)}(${args.map(format).join(",")})`);
        };
      },
      set: (_target, prop, value) => {
        calls.push(`set:${String(prop)}=${format(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe("renderSubToolStrokePreview", () => {
  it("null 컨텍스트에서는 조용히 종료된다", () => {
    expect(() =>
      renderSubToolStrokePreview(null, 560, 120, createDefaultSubToolParams()),
    ).not.toThrow();
  });

  it("같은 파라미터는 항상 같은 렌더 호출 순서를 만든다 (결정성)", () => {
    const params = normalizeSubToolParams({
      tip: { shape: "neon", size: 40, angle: 30, roundness: 0.6 },
      spacing: { percent: 40, jitter: 0.5 },
      texture: { strength: 0.5, scale: 2, mode: "overlay" },
      dualBrush: { enabled: true, sizeRatio: 0.5, spacingPercent: 60, blendMode: "screen" },
      colorJitter: { hue: 30, saturation: 0.2, value: 0.2, opacity: 0.3 },
      blending: { mode: "multiply", opacity: 0.9 },
    });
    const first = createFakeContext();
    const second = createFakeContext();
    renderSubToolStrokePreview(first.ctx, 560, 120, params);
    renderSubToolStrokePreview(second.ctx, 560, 120, params);
    expect(first.calls.length).toBeGreaterThan(100);
    expect(second.calls).toEqual(first.calls);
  });

  it("파라미터가 다르면 렌더 결과가 달라진다", () => {
    const base = createDefaultSubToolParams();
    const changed = normalizeSubToolParams({ tip: { size: 80 } });
    const first = createFakeContext();
    const second = createFakeContext();
    renderSubToolStrokePreview(first.ctx, 560, 120, base);
    renderSubToolStrokePreview(second.ctx, 560, 120, changed);
    expect(second.calls).not.toEqual(first.calls);
  });

  it("팁 모양별로 도장 렌더 경로가 실행된다", () => {
    for (const shape of ["round", "flat", "textured", "particle", "neon"] as const) {
      const fake = createFakeContext();
      expect(() =>
        renderSubToolStrokePreview(
          fake.ctx,
          560,
          120,
          normalizeSubToolParams({ tip: { shape, size: 32 } }),
        ),
      ).not.toThrow();
      expect(fake.calls.some((call) => call.startsWith("ellipse(") || call.startsWith("arc("))).toBe(true);
    }
  });

  it("도장 개수는 상한을 넘지 않는다", () => {
    const fake = createFakeContext();
    renderSubToolStrokePreview(
      fake.ctx,
      560,
      120,
      normalizeSubToolParams({ tip: { size: 8 }, spacing: { percent: 1 } }),
    );
    const ellipseCalls = fake.calls.filter((call) => call.startsWith("ellipse(")).length;
    expect(ellipseCalls).toBeLessThanOrEqual(800);
  });
});
