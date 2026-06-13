import { describe, expect, it } from "vitest";

import {
  buildTextPathData,
  DEFAULT_TEXT_PATH,
  isFlatTextPath,
  normalizeTextPath,
  TEXT_PATH_CURVE_RANGE,
  TEXT_PATH_PRESETS,
  TEXT_PATH_SHAPES,
  textPathShapeLabel,
  type TextPathConfig,
  type TextPathShape,
} from "./studio-text-path";

// 알려진 모양 id 전체(셀렉터/정규화가 받아들여야 하는 값들).
const ALL_SHAPES: TextPathShape[] = ["none", "arcUp", "arcDown", "wave", "circleUp", "circleDown"];

// path data에서 "M x y" 직후 mid 제어점 y(첫 Q/A 인자 뒤)를 뽑기 위한 숫자 추출 헬퍼.
function numbers(data: string): number[] {
  return (data.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

describe("TEXT_PATH_SHAPES", () => {
  it("lists all six shapes with the exact Korean labels", () => {
    expect(TEXT_PATH_SHAPES.map((s) => s.id)).toEqual(ALL_SHAPES);
    expect(TEXT_PATH_SHAPES).toEqual([
      { id: "none", label: "직선" },
      { id: "arcUp", label: "아치 ▲" },
      { id: "arcDown", label: "아치 ▼" },
      { id: "wave", label: "물결" },
      { id: "circleUp", label: "원 위" },
      { id: "circleDown", label: "원 아래" },
    ]);
  });

  it("has unique ids", () => {
    const ids = TEXT_PATH_SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("DEFAULT_TEXT_PATH / ranges", () => {
  it("defaults to a flat line at the mid curve", () => {
    expect(DEFAULT_TEXT_PATH).toEqual({ shape: "none", curve: 50 });
  });

  it("exposes the 0..100 step-1 curve range", () => {
    expect(TEXT_PATH_CURVE_RANGE).toEqual({ min: 0, max: 100, step: 1 });
  });
});

describe("textPathShapeLabel", () => {
  it("maps each shape to its label", () => {
    expect(textPathShapeLabel("none")).toBe("직선");
    expect(textPathShapeLabel("arcUp")).toBe("아치 ▲");
    expect(textPathShapeLabel("arcDown")).toBe("아치 ▼");
    expect(textPathShapeLabel("wave")).toBe("물결");
    expect(textPathShapeLabel("circleUp")).toBe("원 위");
    expect(textPathShapeLabel("circleDown")).toBe("원 아래");
  });

  it("falls back to 직선 for an unknown shape", () => {
    expect(textPathShapeLabel("spiral" as TextPathShape)).toBe("직선");
  });
});

describe("normalizeTextPath", () => {
  it("returns a copy of the default for nullish/invalid input", () => {
    expect(normalizeTextPath()).toEqual(DEFAULT_TEXT_PATH);
    expect(normalizeTextPath(null)).toEqual(DEFAULT_TEXT_PATH);
    expect(normalizeTextPath(undefined)).toEqual(DEFAULT_TEXT_PATH);
    // 새 객체여야 한다(공유 기본값 변형 방지).
    expect(normalizeTextPath()).not.toBe(DEFAULT_TEXT_PATH);
  });

  it("coerces an unknown shape to none", () => {
    expect(normalizeTextPath({ shape: "zigzag" as TextPathShape, curve: 40 }).shape).toBe("none");
    expect(normalizeTextPath({ shape: undefined, curve: 40 }).shape).toBe("none");
  });

  it("keeps every known shape", () => {
    for (const shape of ALL_SHAPES) {
      expect(normalizeTextPath({ shape, curve: 50 }).shape).toBe(shape);
    }
  });

  it("clamps curve into 0..100", () => {
    expect(normalizeTextPath({ shape: "arcUp", curve: -30 }).curve).toBe(0);
    expect(normalizeTextPath({ shape: "arcUp", curve: 999 }).curve).toBe(100);
    expect(normalizeTextPath({ shape: "arcUp", curve: 63 }).curve).toBe(63);
  });

  it("falls back to the default curve for a non-finite / non-number curve", () => {
    // 무한대·NaN·숫자가 아닌 값은 클램프가 아니라 기본값(50)으로 — 발산 방지.
    expect(normalizeTextPath({ shape: "wave", curve: Number.NaN }).curve).toBe(50);
    expect(normalizeTextPath({ shape: "wave", curve: Infinity }).curve).toBe(50);
    expect(normalizeTextPath({ shape: "wave", curve: -Infinity }).curve).toBe(50);
    expect(normalizeTextPath({ shape: "wave", curve: "80" as unknown as number }).curve).toBe(50);
  });
});

describe("isFlatTextPath", () => {
  it("is true only for the none shape", () => {
    expect(isFlatTextPath({ shape: "none", curve: 50 })).toBe(true);
    expect(isFlatTextPath({ shape: "none", curve: 0 })).toBe(true);
    for (const shape of ALL_SHAPES.filter((s) => s !== "none")) {
      expect(isFlatTextPath({ shape, curve: 50 })).toBe(false);
    }
  });
});

describe("buildTextPathData", () => {
  const W = 400;
  const FS = 48;

  it("none → a horizontal line with M 0 and L commands", () => {
    const data = buildTextPathData({ shape: "none", curve: 50 }, W, FS);
    expect(data).toContain("M 0");
    expect(data).toContain("L");
    expect(data).not.toContain("Q");
    expect(data).not.toContain("A");
    // 두 점의 y가 같아야 수평선이다.
    expect(data).toBe(`M 0 ${FS} L ${W} ${FS}`);
  });

  it("arcUp → a Q curve whose mid control-Y bows above the baseline", () => {
    const data = buildTextPathData({ shape: "arcUp", curve: 70 }, W, FS);
    expect(data).toContain("Q");
    const nums = numbers(data);
    // 숫자 시퀀스: [0]=M의 x(0) [1]=baseY [2]=midX [3]=midY [4]=endX [5]=endY.
    const baseY = nums[1]!; // M 뒤 y
    const midY = nums[3]!; // Q 첫 제어점 y
    expect(midY).toBeLessThan(baseY); // 위로 볼록 → 제어점이 baseline 위(작은 y).
  });

  it("arcDown → a Q curve whose mid control-Y bows below the baseline", () => {
    const data = buildTextPathData({ shape: "arcDown", curve: 70 }, W, FS);
    expect(data).toContain("Q");
    const nums = numbers(data);
    const baseY = nums[1]!;
    const midY = nums[3]!;
    expect(midY).toBeGreaterThan(baseY); // 아래로 볼록 → 제어점이 baseline 아래(큰 y).
  });

  it("wave → contains both Q and T commands", () => {
    const data = buildTextPathData({ shape: "wave", curve: 60 }, W, FS);
    expect(data).toContain("Q");
    expect(data).toContain("T");
  });

  it("circleUp / circleDown → contain an A (arc) command", () => {
    expect(buildTextPathData({ shape: "circleUp", curve: 60 }, W, FS)).toContain("A");
    expect(buildTextPathData({ shape: "circleDown", curve: 60 }, W, FS)).toContain("A");
  });

  it("uses opposite arc sweep flags for circleUp vs circleDown", () => {
    const up = buildTextPathData({ shape: "circleUp", curve: 60 }, W, FS);
    const down = buildTextPathData({ shape: "circleDown", curve: 60 }, W, FS);
    // A rx ry rot large sweep x y — sweep는 끝 좌표 앞 두 번째 플래그.
    const sweepOf = (data: string) => {
      const m = data.match(/A [^ ]+ [^ ]+ 0 0 ([01]) /);
      return m?.[1];
    };
    expect(sweepOf(up)).toBe("1");
    expect(sweepOf(down)).toBe("0");
  });

  it("bigger curve → bigger deviation from the baseline (arcUp)", () => {
    const baseYof = (curve: number) => numbers(buildTextPathData({ shape: "arcUp", curve }, W, FS));
    const low = baseYof(20);
    const high = baseYof(90);
    const baseY = low[1]!; // baseY는 curve와 무관하게 동일.
    const lowDev = baseY - low[3]!; // 위로 휜 깊이(baseY - midY).
    const highDev = baseY - high[3]!;
    expect(highDev).toBeGreaterThan(lowDev);
  });

  it("bigger curve → bigger amplitude for wave", () => {
    const ampOf = (curve: number) => {
      const nums = numbers(buildTextPathData({ shape: "wave", curve }, W, FS));
      return nums[1]! - nums[3]!; // baseY - 첫 제어점 y.
    };
    expect(ampOf(90)).toBeGreaterThan(ampOf(20));
  });

  it("bigger curve → rounder circle (smaller radius)", () => {
    const radiusOf = (curve: number) => {
      const m = buildTextPathData({ shape: "circleUp", curve }, W, FS).match(/A ([^ ]+) /);
      return Number(m?.[1]);
    };
    // curve가 클수록 새그가 커져 반지름이 작아진다(더 둥글다).
    expect(radiusOf(90)).toBeLessThan(radiusOf(30));
  });

  it("produces no NaN/Infinity for every shape", () => {
    for (const shape of ALL_SHAPES) {
      for (const curve of [0, 50, 100]) {
        const data = buildTextPathData({ shape, curve }, W, FS);
        expect(data).not.toMatch(/NaN|Infinity/);
        for (const n of numbers(data)) expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it("is safe (no NaN/Infinity) when width and fontSize are 0", () => {
    for (const shape of ALL_SHAPES) {
      for (const curve of [0, 50, 100]) {
        const data = buildTextPathData({ shape, curve }, 0, 0);
        expect(data).not.toMatch(/NaN|Infinity/);
        expect(data.length).toBeGreaterThan(0);
        for (const n of numbers(data)) expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it("is safe with negative / non-finite width and fontSize", () => {
    const data = buildTextPathData(
      { shape: "circleUp", curve: 80 },
      Number.NaN,
      Number.NEGATIVE_INFINITY,
    );
    expect(data).not.toMatch(/NaN|Infinity/);
    for (const n of numbers(data)) expect(Number.isFinite(n)).toBe(true);
  });

  it("normalizes an unknown shape to the none line", () => {
    const data = buildTextPathData({ shape: "spiral" as TextPathShape, curve: 50 }, W, FS);
    expect(data).toContain("M 0");
    expect(data).toContain("L");
    expect(data).not.toContain("Q");
  });

  it("clamps a circle's degenerate zero curve into a straight fallback", () => {
    // curve 0이면 새그가 0 — 반지름 발산 대신 직선으로 안전 폴백.
    const data = buildTextPathData({ shape: "circleUp", curve: 0 }, W, FS);
    expect(data).not.toContain("A");
    expect(data).toContain("L");
    for (const n of numbers(data)) expect(Number.isFinite(n)).toBe(true);
  });
});

describe("TEXT_PATH_PRESETS", () => {
  it("has the straight (none) preset first", () => {
    expect(TEXT_PATH_PRESETS[0]!.value.shape).toBe("none");
    expect(TEXT_PATH_PRESETS[0]!.label).toBe("직선");
  });

  it("has unique ids", () => {
    const ids = TEXT_PATH_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses valid shapes and in-range curves", () => {
    const shapeIds = new Set<TextPathShape>(ALL_SHAPES);
    for (const preset of TEXT_PATH_PRESETS) {
      expect(shapeIds.has(preset.value.shape)).toBe(true);
      expect(preset.value.curve).toBeGreaterThanOrEqual(TEXT_PATH_CURVE_RANGE.min);
      expect(preset.value.curve).toBeLessThanOrEqual(TEXT_PATH_CURVE_RANGE.max);
    }
  });

  it("survives normalization unchanged (already canonical)", () => {
    for (const preset of TEXT_PATH_PRESETS) {
      expect(normalizeTextPath(preset.value)).toEqual(preset.value);
    }
  });

  it("has non-empty labels and tips", () => {
    for (const preset of TEXT_PATH_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.tip.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers the documented preset set", () => {
    const byShapeCurve = TEXT_PATH_PRESETS.map((p) => `${p.value.shape}:${p.value.curve}`);
    const expected: (readonly [TextPathShape, number])[] = [
      ["none", 50],
      ["arcUp", 70],
      ["arcUp", 100],
      ["arcDown", 70],
      ["wave", 60],
      ["circleUp", 60],
    ];
    expect(byShapeCurve).toEqual(expected.map(([s, c]) => `${s}:${c}`));
  });
});

// 타입 가드용 — TextPathConfig가 정확히 두 필드를 갖는지 컴파일 시 확인.
const _typeCheck: TextPathConfig = { shape: "wave", curve: 10 };
void _typeCheck;
