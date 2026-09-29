import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCREENTONE_LAYER,
  SCREENTONE_ANGLE_RANGE,
  SCREENTONE_DENSITY_RANGE,
  SCREENTONE_LAYER_PRESETS,
  SCREENTONE_LINES_RANGE,
  applyToneToSelection,
  isIdentityScreentoneLayer,
  normalizeScreentoneLayer,
  type ScreentoneLayer,
} from "./screentone-layer";
import {
  renderScreentone,
  screentoneCellSize,
  screentoneDensityAt,
  screentoneHash01,
  toBinaryThreshold,
  type ScreentoneRenderContext,
} from "./screentone-render";

// ---- 테스트용 가짜 2D 컨텍스트 ----
function makeFakeCtx(): ScreentoneRenderContext & { last: ImageData | null } {
  const box: { last: ImageData | null } = { last: null };
  return {
    last: null,
    createImageData(w: number, h: number): ImageData {
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as ImageData;
    },
    putImageData(img: ImageData): void {
      box.last = img;
      (this as { last: ImageData | null }).last = img;
    },
  };
}

function renderToPixels(
  params: ScreentoneLayer,
  width: number,
  height: number,
  mask?: ArrayLike<number> | null
): Uint8ClampedArray {
  const ctx = makeFakeCtx();
  renderScreentone(ctx, width, height, params, mask);
  expect(ctx.last).not.toBeNull();
  return ctx.last!.data;
}

function alphaAt(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  return data[(y * width + x) * 4 + 3];
}

function avgAlpha(data: Uint8ClampedArray): number {
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < n; i++) sum += data[i * 4 + 3];
  return sum / n;
}

// ---------------------------------------------------------------------------
// 정규화
// ---------------------------------------------------------------------------

describe("normalizeScreentoneLayer", () => {
  it("기본값은 30선·농도40·45°·도트·그라데이션 없음", () => {
    expect(DEFAULT_SCREENTONE_LAYER).toEqual({
      kind: "dot",
      lines: 30,
      density: 40,
      angle: 45,
      seed: 1,
      gradient: { kind: "none", direction: 0, fromDensity: 20, toDensity: 60 },
    });
  });

  it("null/undefined 입력은 기본값을 돌려준다", () => {
    expect(normalizeScreentoneLayer(null)).toEqual(DEFAULT_SCREENTONE_LAYER);
    expect(normalizeScreentoneLayer(undefined)).toEqual(DEFAULT_SCREENTONE_LAYER);
  });

  it("선 수는 10~60으로 클램프된다", () => {
    expect(normalizeScreentoneLayer({ lines: 5 }).lines).toBe(SCREENTONE_LINES_RANGE.min);
    expect(normalizeScreentoneLayer({ lines: 200 }).lines).toBe(SCREENTONE_LINES_RANGE.max);
    expect(normalizeScreentoneLayer({ lines: 42 }).lines).toBe(42);
  });

  it("농도는 0~100으로 클램프된다", () => {
    expect(normalizeScreentoneLayer({ density: -3 }).density).toBe(SCREENTONE_DENSITY_RANGE.min);
    expect(normalizeScreentoneLayer({ density: 150 }).density).toBe(SCREENTONE_DENSITY_RANGE.max);
  });

  it("각도는 0~180으로 클램프된다", () => {
    expect(normalizeScreentoneLayer({ angle: -10 }).angle).toBe(SCREENTONE_ANGLE_RANGE.min);
    expect(normalizeScreentoneLayer({ angle: 270 }).angle).toBe(SCREENTONE_ANGLE_RANGE.max);
  });

  it("숫자가 아니면 기본값으로 폴백한다", () => {
    const n = normalizeScreentoneLayer({ lines: NaN, density: "짙게" } as unknown as Partial<ScreentoneLayer>);
    expect(n.lines).toBe(DEFAULT_SCREENTONE_LAYER.lines);
    expect(n.density).toBe(DEFAULT_SCREENTONE_LAYER.density);
  });

  it("유효하지 않은 kind/gradient kind는 기본값으로 폴백한다", () => {
    const n = normalizeScreentoneLayer({
      kind: "watercolor",
      gradient: { kind: "spiral" },
    } as unknown as Partial<ScreentoneLayer>);
    expect(n.kind).toBe("dot");
    expect(n.gradient.kind).toBe("none");
  });

  it("그라데이션 서브 필드도 정규화된다", () => {
    const n = normalizeScreentoneLayer({
      gradient: { kind: "linear", direction: 720, fromDensity: -5, toDensity: 300 },
    });
    expect(n.gradient.direction).toBe(360);
    expect(n.gradient.fromDensity).toBe(0);
    expect(n.gradient.toDensity).toBe(100);
  });
});

describe("isIdentityScreentoneLayer", () => {
  it("농도 0 + 그라데이션 없음이면 항등", () => {
    expect(isIdentityScreentoneLayer(normalizeScreentoneLayer({ density: 0 }))).toBe(true);
  });

  it("농도가 있으면 항등이 아니다", () => {
    expect(isIdentityScreentoneLayer(normalizeScreentoneLayer({ density: 1 }))).toBe(false);
  });

  it("농도 0이어도 그라데이션 농도가 있으면 항등이 아니다", () => {
    const n = normalizeScreentoneLayer({
      density: 0,
      gradient: { kind: "linear", direction: 0, fromDensity: 0, toDensity: 50 },
    });
    expect(isIdentityScreentoneLayer(n)).toBe(false);
  });
});

describe("SCREENTONE_LAYER_PRESETS", () => {
  it("모든 프리셋이 정규화 범위를 만족한다", () => {
    for (const p of SCREENTONE_LAYER_PRESETS) {
      expect(normalizeScreentoneLayer(p.value)).toEqual(p.value);
    }
  });
});

// ---------------------------------------------------------------------------
// applyToneToSelection
// ---------------------------------------------------------------------------

describe("applyToneToSelection", () => {
  it("rect 선택을 래스터화한다 — 안은 1, 밖은 0", () => {
    const inst = applyToneToSelection(
      { kind: "rect", x: 2, y: 1, width: 3, height: 2, canvasWidth: 8, canvasHeight: 6 },
      { kind: "dot" }
    );
    expect(inst.width).toBe(8);
    expect(inst.height).toBe(6);
    expect(inst.mask.length).toBe(48);
    expect(inst.layer.kind).toBe("dot");
    // (3,2) 중심은 rect 안, (0,0)은 밖
    expect(inst.mask[2 * 8 + 3]).toBe(1);
    expect(inst.mask[0]).toBe(0);
    // rect 안 픽셀 수 = 3*2 = 6
    let ones = 0;
    for (const v of inst.mask) ones += v;
    expect(ones).toBe(6);
  });

  it("rect가 캔버스를 벗어나면 경계에서 잘린다", () => {
    const inst = applyToneToSelection({
      kind: "rect",
      x: -2,
      y: -2,
      width: 4,
      height: 4,
      canvasWidth: 8,
      canvasHeight: 8,
    });
    let ones = 0;
    for (const v of inst.mask) ones += v;
    expect(ones).toBe(4); // (0..1, 0..1) 2x2만 살아남는다
  });

  it("mask 선택은 0..1로 클램프해 그대로 쓴다", () => {
    const inst = applyToneToSelection({
      kind: "mask",
      mask: [0, 0.5, 2, -1],
      width: 2,
      height: 2,
    });
    expect(Array.from(inst.mask)).toEqual([0, 0.5, 1, 0]);
  });

  it("params가 없으면 기본 톤으로 정규화된다", () => {
    const inst = applyToneToSelection({ kind: "rect", x: 0, y: 0, width: 1, height: 1, canvasWidth: 2, canvasHeight: 2 });
    expect(inst.layer).toEqual(DEFAULT_SCREENTONE_LAYER);
  });

  it("잘못된 크기는 RangeError", () => {
    expect(() =>
      applyToneToSelection({ kind: "rect", x: 0, y: 0, width: 1, height: 1, canvasWidth: 0, canvasHeight: 4 })
    ).toThrow(RangeError);
    expect(() =>
      applyToneToSelection({ kind: "mask", mask: [1, 2, 3], width: 2, height: 2 })
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// 렌더러
// ---------------------------------------------------------------------------

describe("screentoneCellSize", () => {
  it("선 수가 클수록 셀이 작아지고 최소 2px", () => {
    expect(screentoneCellSize(10)).toBe(30);
    expect(screentoneCellSize(60)).toBe(5);
    expect(screentoneCellSize(30)).toBe(10);
    expect(screentoneCellSize(10)).toBeGreaterThan(screentoneCellSize(60));
    expect(screentoneCellSize(100000)).toBe(2);
  });
});

describe("screentoneHash01", () => {
  it("같은 입력은 같은 값, 다른 시드는 다른 값", () => {
    expect(screentoneHash01(3, 7, 42)).toBe(screentoneHash01(3, 7, 42));
    expect(screentoneHash01(3, 7, 42)).not.toBe(screentoneHash01(3, 7, 43));
    const v = screentoneHash01(0, 0, 0);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe("screentoneDensityAt", () => {
  const base = normalizeScreentoneLayer({ density: 50 });

  it("그라데이션 없음이면 균일 농도", () => {
    expect(screentoneDensityAt(base, 0, 0, 100, 100)).toBeCloseTo(0.5, 6);
    expect(screentoneDensityAt(base, 99, 99, 100, 100)).toBeCloseTo(0.5, 6);
  });

  it("선형 그라데이션: 방향 0°이면 왼쪽이 from, 오른쪽이 to", () => {
    const p = normalizeScreentoneLayer({
      gradient: { kind: "linear", direction: 0, fromDensity: 10, toDensity: 90 },
    });
    const left = screentoneDensityAt(p, 0, 50, 100, 100);
    const right = screentoneDensityAt(p, 99, 50, 100, 100);
    expect(left).toBeLessThan(0.2);
    expect(right).toBeGreaterThan(0.8);
    expect(left).toBeLessThan(right);
  });

  it("방사형 그라데이션: 중심이 from, 모서리가 to", () => {
    const p = normalizeScreentoneLayer({
      gradient: { kind: "radial", direction: 0, fromDensity: 80, toDensity: 20 },
    });
    const center = screentoneDensityAt(p, 50, 50, 100, 100);
    const corner = screentoneDensityAt(p, 0, 0, 100, 100);
    expect(center).toBeGreaterThan(corner);
  });
});

describe("renderScreentone", () => {
  it("ctx가 null이면 no-op (예외 없음)", () => {
    expect(() =>
      renderScreentone(null, 16, 16, normalizeScreentoneLayer({ density: 50 }))
    ).not.toThrow();
    expect(() =>
      renderScreentone(undefined, 16, 16, normalizeScreentoneLayer({ density: 50 }))
    ).not.toThrow();
  });

  it("크기가 0 이하면 no-op", () => {
    const ctx = makeFakeCtx();
    renderScreentone(ctx, 0, 16, normalizeScreentoneLayer({ density: 50 }));
    expect(ctx.last).toBeNull();
  });

  it("농도 0%면 완전 투명, 100%면 완전 불투명", () => {
    const clear = renderToPixels(normalizeScreentoneLayer({ density: 0, kind: "dot" }), 24, 24);
    expect(avgAlpha(clear)).toBe(0);
    const solid = renderToPixels(normalizeScreentoneLayer({ density: 100, kind: "dot" }), 24, 24);
    expect(avgAlpha(solid)).toBe(255);
  });

  it("농도가 높을수록 평균 alpha가 커진다 (도트)", () => {
    const light = renderToPixels(normalizeScreentoneLayer({ density: 20, kind: "dot" }), 48, 48);
    const dark = renderToPixels(normalizeScreentoneLayer({ density: 80, kind: "dot" }), 48, 48);
    expect(avgAlpha(dark)).toBeGreaterThan(avgAlpha(light));
    expect(avgAlpha(light)).toBeGreaterThan(0);
  });

  it("사선/격자도 농도에 따라 그려진다", () => {
    for (const kind of ["line", "cross"] as const) {
      const px = renderToPixels(normalizeScreentoneLayer({ density: 50, kind }), 48, 48);
      const a = avgAlpha(px);
      expect(a).toBeGreaterThan(40);
      expect(a).toBeLessThan(220);
    }
  });

  it("모래망점: 같은 시드는 같은 픽셀 (결정성)", () => {
    const a = renderToPixels(normalizeScreentoneLayer({ density: 50, kind: "sand", seed: 123 }), 48, 48);
    const b = renderToPixels(normalizeScreentoneLayer({ density: 50, kind: "sand", seed: 123 }), 48, 48);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("모래망점: 다른 시드는 다른 픽셀", () => {
    const a = renderToPixels(normalizeScreentoneLayer({ density: 50, kind: "sand", seed: 1 }), 48, 48);
    const b = renderToPixels(normalizeScreentoneLayer({ density: 50, kind: "sand", seed: 2 }), 48, 48);
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] !== b[i + 3]) diff++;
    expect(diff).toBeGreaterThan(100);
  });

  it("모래망점 50%는 대략 절반의 픽셀이 잉크", () => {
    const px = renderToPixels(normalizeScreentoneLayer({ density: 50, kind: "sand", seed: 9 }), 64, 64);
    let inked = 0;
    const n = px.length / 4;
    for (let i = 0; i < n; i++) if (px[i * 4 + 3] === 255) inked++;
    const ratio = inked / n;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
  });

  it("마스크가 있으면 선택 영역 밖이 잘린다", () => {
    const mask = new Float32Array(16 * 16);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) mask[y * 16 + x] = 1;
    const px = renderToPixels(normalizeScreentoneLayer({ density: 100, kind: "dot" }), 16, 16, mask);
    expect(alphaAt(px, 16, 4, 2)).toBe(255); // 마스크 안
    expect(alphaAt(px, 16, 4, 12)).toBe(0); // 마스크 밖
  });

  it("마스크 길이 불일치는 RangeError", () => {
    const ctx = makeFakeCtx();
    expect(() =>
      renderScreentone(ctx, 16, 16, normalizeScreentoneLayer({ density: 50 }), new Float32Array(10))
    ).toThrow(RangeError);
  });

  it("그라데이션 톤: 왼쪽과 오른쪽 농도가 다르다", () => {
    const px = renderToPixels(
      normalizeScreentoneLayer({
        kind: "sand",
        seed: 5,
        gradient: { kind: "linear", direction: 0, fromDensity: 10, toDensity: 90 },
      }),
      100,
      20
    );
    let leftInk = 0;
    let rightInk = 0;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) if (px[(y * 100 + x) * 4 + 3] === 255) leftInk++;
      for (let x = 80; x < 100; x++) if (px[(y * 100 + x) * 4 + 3] === 255) rightInk++;
    }
    expect(rightInk).toBeGreaterThan(leftInk * 2);
  });

  it("잉크 색상 옵션이 RGB에 반영된다", () => {
    const ctx = makeFakeCtx();
    renderScreentone(ctx, 8, 8, normalizeScreentoneLayer({ density: 100 }), null, { ink: [255, 0, 0] });
    const d = ctx.last!.data;
    expect(d[0]).toBe(255);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// toBinaryThreshold
// ---------------------------------------------------------------------------

describe("toBinaryThreshold", () => {
  function solidSource(w: number, h: number, r: number, g: number, b: number, a: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([r, g, b, a], i * 4);
    return { data, width: w, height: h };
  }

  it("불투명 검정은 전부 잉크(1), 투명은 전부 종이(0)", () => {
    const black = toBinaryThreshold(solidSource(4, 4, 0, 0, 0, 255));
    expect(Array.from(black.bitmap)).toEqual(new Array(16).fill(1));
    const clear = toBinaryThreshold(solidSource(4, 4, 0, 0, 0, 0));
    expect(Array.from(clear.bitmap)).toEqual(new Array(16).fill(0));
  });

  it("불투명 흰색은 전부 종이(0)", () => {
    const white = toBinaryThreshold(solidSource(4, 4, 255, 255, 255, 255));
    expect(Array.from(white.bitmap)).toEqual(new Array(16).fill(0));
  });

  it("임계값 경계: 중간 회색은 threshold에 따라 갈린다", () => {
    // 회색 128의 어두움 = 1 - 128/255 ≈ 0.498 → *255 ≈ 127
    const gray = solidSource(2, 2, 128, 128, 128, 255);
    const low = toBinaryThreshold(gray, 100);
    const high = toBinaryThreshold(gray, 200);
    expect(Array.from(low.bitmap)).toEqual([1, 1, 1, 1]);
    expect(Array.from(high.bitmap)).toEqual([0, 0, 0, 0]);
  });

  it("반투명 검정은 alpha가 반영된다", () => {
    // alpha 128 → 어두움 = 0.502*1 ≈ 0.502 → *255 ≈ 128
    const half = solidSource(2, 2, 0, 0, 0, 128);
    expect(Array.from(toBinaryThreshold(half, 100).bitmap)).toEqual([1, 1, 1, 1]);
    expect(Array.from(toBinaryThreshold(half, 200).bitmap)).toEqual([0, 0, 0, 0]);
  });

  it("렌더 결과와 이어진다 — 톤 렌더 → 2치화", () => {
    const px = renderToPixels(normalizeScreentoneLayer({ density: 100, kind: "dot" }), 16, 16);
    const bin = toBinaryThreshold({ data: px, width: 16, height: 16 });
    expect(bin.width).toBe(16);
    expect(bin.height).toBe(16);
    expect(Array.from(bin.bitmap).every((v) => v === 1)).toBe(true);
  });

  it("잘못된 크기는 RangeError", () => {
    expect(() => toBinaryThreshold({ data: new Uint8ClampedArray(0), width: 0, height: 4 })).toThrow(
      RangeError
    );
    expect(() =>
      toBinaryThreshold({ data: new Uint8ClampedArray(4), width: 4, height: 4 })
    ).toThrow(RangeError);
  });
});
