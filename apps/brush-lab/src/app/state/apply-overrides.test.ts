import { describe, expect, it } from "vitest";

import { brushConfigHashSync, normalizeProgram } from "../../engine/presets/program-schema";

import { applyOverrides, hasOverrides, stabilizerToOneEuro } from "./apply-overrides";

const base = normalizeProgram({ id: "t", name: "테스트", family: "pencil" });

describe("applyOverrides", () => {
  it("오버라이드가 없으면 같은 프로그램(해시 동일)을 돌려준다", () => {
    const out = applyOverrides(base, {});
    expect(brushConfigHashSync(out)).toBe(brushConfigHashSync(base));
    expect(hasOverrides({})).toBe(false);
    expect(hasOverrides({ sizePx: undefined })).toBe(false);
    expect(hasOverrides({ sizePx: 3 })).toBe(true);
  });

  it("팁·도포·그레인·필터·산포·베타 토글·안정화가 각 필드에 반영되고 해시가 바뀐다", () => {
    const out = applyOverrides(base, {
      sizePx: 40,
      hardness: 0.25,
      spacing: 0.5,
      timeDabsPerSecond: 24,
      opacity: 0.7,
      flow: 0.4,
      kind: "noise",
      grain: false,
      filter: "anisotropic",
      scatterPx: 6,
      wetBeta: true,
      kmBeta: true,
      stabilizer: 1,
    });
    expect(out.tip.sizePx).toBe(40);
    expect(out.tip.hardness).toBe(0.25);
    expect(out.tip.kind).toBe("noise");
    expect(out.deposition.spacing).toBe(0.5);
    expect(out.deposition.timeDabsPerSecond).toBe(24);
    expect(out.deposition.opacity).toBe(0.7);
    expect(out.deposition.flow).toBe(0.4);
    expect(out.paper.enabled).toBe(false);
    expect(out.paper.filter).toBe("anisotropic");
    expect(out.strokeDynamics.scatter.positionPx).toBe(6);
    expect(out.wet).not.toBeNull();
    expect(out.colorDynamics.kmMixing).toBe(true);
    expect(out.input.oneEuro?.position).toEqual({ minCutoff: 0.5, beta: 0.005, dCutoff: 1 });
    expect(brushConfigHashSync(out)).not.toBe(brushConfigHashSync(base));
    // wetBeta false는 wet을 null로 되돌린다
    expect(applyOverrides(out, { wetBeta: false }).wet).toBeNull();
  });

  it("범위 밖 값은 ZodError로 드러난다(무음 보정 없음)", () => {
    expect(() => applyOverrides(base, { hardness: 2 })).toThrow();
    expect(() => applyOverrides(base, { spacing: 0 })).toThrow();
  });

  it("안정화 강도 매핑은 0에서 (3.0, 0.05), 1에서 (0.5, 0.005)이며 단조 감소한다", () => {
    expect(stabilizerToOneEuro(0)).toEqual({ minCutoff: 3.0, beta: 0.05, dCutoff: 1.0 });
    expect(stabilizerToOneEuro(1)).toEqual({ minCutoff: 0.5, beta: 0.005, dCutoff: 1.0 });
    const mid = stabilizerToOneEuro(0.5);
    expect(mid.minCutoff).toBeCloseTo(1.75, 6);
    expect(stabilizerToOneEuro(-1).minCutoff).toBe(3.0);
    expect(stabilizerToOneEuro(2).minCutoff).toBe(0.5);
  });
});
