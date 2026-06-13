import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRAIN,
  GRAIN_AMOUNT_RANGE,
  GRAIN_PRESETS,
  GRAIN_SIZE_RANGE,
  GRAIN_TYPES,
  applyGrain,
  grainKonvaFilter,
  hash2,
  isIdentityGrain,
  normalizeGrain,
  type Grain,
  type GrainType,
} from "./studio-grain";
import { type StudioImageDataLike } from "./studio-filters";

// ---- 테스트용 가짜 ImageData 빌더 ----

/** [r,g,b,a] 픽셀 배열로 StudioImageDataLike 생성. */
function makeImage(width: number, height: number, pixels: number[][]): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((px, i) => data.set(px, i * 4));
  return { data, width, height };
}

function pixelAt(img: StudioImageDataLike, index: number): number[] {
  return Array.from(img.data.slice(index * 4, index * 4 + 4));
}

/** width*height 균일 중간회색(value) 이미지 — 알파는 지정값. */
function makeSolid(width: number, height: number, value: number, alpha = 255): StudioImageDataLike {
  const pixels = Array.from({ length: width * height }, () => [value, value, value, alpha]);
  return makeImage(width, height, pixels);
}

/** 두 이미지의 픽셀 데이터가 완전히 같은지. */
function dataEqual(a: StudioImageDataLike, b: StudioImageDataLike): boolean {
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------

describe("DEFAULT_GRAIN / isIdentityGrain", () => {
  it("기본값은 film·amount0·size1·seed1 항등", () => {
    expect(DEFAULT_GRAIN).toEqual({ type: "film", amount: 0, size: 1, seed: 1 });
    expect(isIdentityGrain(DEFAULT_GRAIN)).toBe(true);
  });

  it("amount<=0이면 항등, amount>0이면 항등 아님", () => {
    expect(isIdentityGrain({ type: "film", amount: 0, size: 3, seed: 9 })).toBe(true);
    expect(isIdentityGrain({ type: "paper", amount: -5, size: 1, seed: 1 })).toBe(true);
    expect(isIdentityGrain({ type: "film", amount: 1, size: 1, seed: 1 })).toBe(false);
    expect(isIdentityGrain({ type: "scanline", amount: 50, size: 2, seed: 1 })).toBe(false);
  });
});

describe("범위·종류 상수", () => {
  it("세기 범위는 0..100, step 1", () => {
    expect(GRAIN_AMOUNT_RANGE).toEqual({ min: 0, max: 100, step: 1 });
  });
  it("거칠기 범위는 1..8, step 1", () => {
    expect(GRAIN_SIZE_RANGE).toEqual({ min: 1, max: 8, step: 1 });
  });
  it("GRAIN_TYPES는 4종(film·paper·scanline·halftoneDot)과 한글 라벨", () => {
    expect(GRAIN_TYPES.map((t) => t.id)).toEqual(["film", "paper", "scanline", "halftoneDot"]);
    const labels = new Map(GRAIN_TYPES.map((t) => [t.id, t.label]));
    expect(labels.get("film")).toBe("필름");
    expect(labels.get("paper")).toBe("종이");
    expect(labels.get("scanline")).toBe("주사선");
    expect(labels.get("halftoneDot")).toBe("도트");
  });
});

describe("normalizeGrain", () => {
  it("undefined/null → 기본값", () => {
    expect(normalizeGrain()).toEqual(DEFAULT_GRAIN);
    expect(normalizeGrain(null)).toEqual(DEFAULT_GRAIN);
  });

  it("누락 키는 기본값으로 채운다", () => {
    expect(normalizeGrain({ amount: 40 })).toEqual({ type: "film", amount: 40, size: 1, seed: 1 });
    expect(normalizeGrain({ type: "paper" })).toEqual({ type: "paper", amount: 0, size: 1, seed: 1 });
  });

  it("범위 밖 숫자는 각 범위로 클램프", () => {
    expect(normalizeGrain({ type: "film", amount: 999, size: 99, seed: 99999 })).toEqual({
      type: "film",
      amount: 100,
      size: 8,
      seed: 9999,
    });
    expect(normalizeGrain({ amount: -50, size: -3, seed: -10 })).toEqual({
      type: "film",
      amount: 0,
      size: 1,
      seed: 0,
    });
  });

  it("유효하지 않은 type은 기본 'film'으로", () => {
    expect(normalizeGrain({ type: "bogus" as unknown as GrainType }).type).toBe("film");
    expect(normalizeGrain({ type: 42 as unknown as GrainType }).type).toBe("film");
    // 유효 type은 그대로 유지.
    for (const t of GRAIN_TYPES) {
      expect(normalizeGrain({ type: t.id }).type).toBe(t.id);
    }
  });

  it("숫자가 아닌 값/NaN/Infinity는 기본값", () => {
    const out = normalizeGrain({
      amount: "50" as unknown as number,
      size: Number.NaN,
      seed: Number.POSITIVE_INFINITY,
    });
    expect(out).toEqual({ type: "film", amount: 0, size: 1, seed: 1 });
  });

  it("소수 seed는 정수로 내림", () => {
    expect(normalizeGrain({ seed: 123.9 }).seed).toBe(123);
    expect(normalizeGrain({ seed: 0.7 }).seed).toBe(0);
  });
});

describe("hash2 — 결정적 해시", () => {
  it("같은 인자는 항상 같은 값(결정적)", () => {
    expect(hash2(3, 7, 42)).toBe(hash2(3, 7, 42));
    expect(hash2(0, 0, 0)).toBe(hash2(0, 0, 0));
    expect(hash2(999, 1234, 9999)).toBe(hash2(999, 1234, 9999));
  });

  it("항상 0..1 범위", () => {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const v = hash2(x, y, x * 7 + y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("인자가 다르면 대체로 값이 다르다(분포가 한 점에 뭉치지 않음)", () => {
    const seen = new Set<number>();
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        seen.add(hash2(x, y, 1));
      }
    }
    // 256개 좌표가 거의 전부 고유한 값(충돌이 극히 적음).
    expect(seen.size).toBeGreaterThan(250);
    // 시드만 바꿔도 같은 좌표 값이 달라진다.
    expect(hash2(5, 5, 1)).not.toBe(hash2(5, 5, 2));
    expect(hash2(0, 0, 0)).not.toBe(hash2(1, 0, 0));
    expect(hash2(0, 0, 0)).not.toBe(hash2(0, 1, 0));
  });

  it("소수/음수 좌표도 내림 처리되어 유한값", () => {
    expect(hash2(3.9, 7.1, 42)).toBe(hash2(3, 7, 42));
    expect(Number.isFinite(hash2(-2, -3, 5))).toBe(true);
  });
});

describe("applyGrain — 항등/no-op", () => {
  it("amount0이면 no-op(데이터 불변)", () => {
    const img = makeImage(2, 1, [
      [10, 20, 30, 40],
      [200, 100, 50, 255],
    ]);
    applyGrain(img, { type: "film", amount: 0, size: 2, seed: 9 });
    expect(pixelAt(img, 0)).toEqual([10, 20, 30, 40]);
    expect(pixelAt(img, 1)).toEqual([200, 100, 50, 255]);
  });

  it("amount<=0(음수)도 no-op", () => {
    const img = makeSolid(4, 4, 128);
    const before = makeSolid(4, 4, 128);
    applyGrain(img, { type: "scanline", amount: -10, size: 2, seed: 1 });
    expect(dataEqual(img, before)).toBe(true);
  });
});

describe("applyGrain — film(결정적 노이즈)", () => {
  it("픽셀을 바꾸되 같은 seed=같은 결과(결정적), 다른 seed=다른 결과", () => {
    const a = makeSolid(8, 8, 128);
    const b = makeSolid(8, 8, 128);
    const c = makeSolid(8, 8, 128);
    applyGrain(a, { type: "film", amount: 60, size: 1, seed: 7 });
    applyGrain(b, { type: "film", amount: 60, size: 1, seed: 7 });
    applyGrain(c, { type: "film", amount: 60, size: 1, seed: 8 });

    // 노이즈가 균일 회색을 실제로 흔든다.
    const base = makeSolid(8, 8, 128);
    expect(dataEqual(a, base)).toBe(false);
    // 같은 seed → 완전히 동일.
    expect(dataEqual(a, b)).toBe(true);
    // 다른 seed → 달라진다.
    expect(dataEqual(a, c)).toBe(false);
  });

  it("size가 클수록 노이즈 블록이 커진다(같은 블록 안 픽셀은 동일 노이즈)", () => {
    // size=2 → 2x2 블록이 같은 노이즈를 공유.
    const img = makeSolid(4, 2, 128);
    applyGrain(img, { type: "film", amount: 80, size: 2, seed: 3 });
    // (0,0)과 (1,0)은 같은 블록(bx=0) → 동일.
    expect(pixelAt(img, 0)).toEqual(pixelAt(img, 1));
    // (2,0)은 다른 블록(bx=1) → 대체로 다름.
    expect(pixelAt(img, 2)).not.toEqual(pixelAt(img, 0));
  });

  it("알파는 보존된다", () => {
    const img = makeImage(4, 1, [
      [128, 128, 128, 10],
      [128, 128, 128, 90],
      [128, 128, 128, 170],
      [128, 128, 128, 250],
    ]);
    applyGrain(img, { type: "film", amount: 70, size: 1, seed: 5 });
    expect(pixelAt(img, 0)[3]).toBe(10);
    expect(pixelAt(img, 1)[3]).toBe(90);
    expect(pixelAt(img, 2)[3]).toBe(170);
    expect(pixelAt(img, 3)[3]).toBe(250);
  });
});

describe("applyGrain — scanline(번갈아 어둡게)", () => {
  it("홀수 주기의 전반 행을 어둡게, 후반 행은 그대로 둔다", () => {
    // size=1 → period 2: y%2==0 행만 어둡게.
    const img = makeSolid(2, 4, 200);
    applyGrain(img, { type: "scanline", amount: 50, size: 1, seed: 1 });
    // y=0(어두운 행) < 200, y=1(밝은 행) == 200.
    expect(pixelAt(img, 0 * 2)[0]!).toBeLessThan(200);
    expect(pixelAt(img, 1 * 2)[0]!).toBe(200);
    expect(pixelAt(img, 2 * 2)[0]!).toBeLessThan(200);
    expect(pixelAt(img, 3 * 2)[0]!).toBe(200);
  });

  it("amount가 클수록 어두운 행이 더 어둡다", () => {
    const soft = makeSolid(1, 2, 200);
    const hard = makeSolid(1, 2, 200);
    applyGrain(soft, { type: "scanline", amount: 30, size: 1, seed: 1 });
    applyGrain(hard, { type: "scanline", amount: 90, size: 1, seed: 1 });
    expect(hard.data[0]!).toBeLessThan(soft.data[0]!);
  });

  it("알파는 보존된다", () => {
    const img = makeImage(1, 2, [
      [200, 200, 200, 33],
      [200, 200, 200, 222],
    ]);
    applyGrain(img, { type: "scanline", amount: 60, size: 1, seed: 1 });
    expect(pixelAt(img, 0)[3]).toBe(33);
    expect(pixelAt(img, 1)[3]).toBe(222);
  });
});

describe("applyGrain — paper(저주파 얼룩 변조)", () => {
  it("균일 회색을 변조하되 결정적(같은 seed=같은 결과)", () => {
    const a = makeSolid(20, 20, 128);
    const b = makeSolid(20, 20, 128);
    applyGrain(a, { type: "paper", amount: 80, size: 1, seed: 4 });
    applyGrain(b, { type: "paper", amount: 80, size: 1, seed: 4 });
    const base = makeSolid(20, 20, 128);
    // 얼룩이 실제로 톤을 바꾼다.
    expect(dataEqual(a, base)).toBe(false);
    // 결정적.
    expect(dataEqual(a, b)).toBe(true);
  });

  it("알파는 보존된다", () => {
    const img = makeImage(2, 1, [
      [128, 128, 128, 44],
      [128, 128, 128, 188],
    ]);
    applyGrain(img, { type: "paper", amount: 90, size: 1, seed: 2 });
    expect(pixelAt(img, 0)[3]).toBe(44);
    expect(pixelAt(img, 1)[3]).toBe(188);
  });
});

describe("applyGrain — halftoneDot(격자 점)", () => {
  it("점 패턴을 약하게 곱해 일부 픽셀만 어두워진다(결정적)", () => {
    const a = makeSolid(16, 16, 200);
    const b = makeSolid(16, 16, 200);
    applyGrain(a, { type: "halftoneDot", amount: 50, size: 3, seed: 1 });
    applyGrain(b, { type: "halftoneDot", amount: 50, size: 3, seed: 1 });
    const base = makeSolid(16, 16, 200);
    expect(dataEqual(a, base)).toBe(false); // 점이 톤을 바꾼다
    expect(dataEqual(a, b)).toBe(true); // 결정적

    // 어두워진 픽셀(점)도, 원본 그대로인 픽셀도 둘 다 존재(약한 곱).
    let darkened = 0;
    let kept = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (a.data[i]! < 200) darkened++;
      else kept++;
    }
    expect(darkened).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it("알파는 보존된다", () => {
    const img = makeImage(4, 1, [
      [200, 200, 200, 5],
      [200, 200, 200, 75],
      [200, 200, 200, 145],
      [200, 200, 200, 215],
    ]);
    applyGrain(img, { type: "halftoneDot", amount: 60, size: 1, seed: 1 });
    expect(pixelAt(img, 0)[3]).toBe(5);
    expect(pixelAt(img, 1)[3]).toBe(75);
    expect(pixelAt(img, 2)[3]).toBe(145);
    expect(pixelAt(img, 3)[3]).toBe(215);
  });
});

describe("applyGrain — 작은 이미지 / 클램프", () => {
  it("1x1 이미지(가장 작은 케이스)도 throw 없이 안전", () => {
    for (const type of GRAIN_TYPES) {
      const img = makeImage(1, 1, [[130, 90, 60, 200]]);
      expect(() => applyGrain(img, { type: type.id, amount: 100, size: 8, seed: 9 })).not.toThrow();
      expect(pixelAt(img, 0)[3]).toBe(200); // 알파 보존
    }
  });

  it("폭/높이 0이면 no-op(throw 없음)", () => {
    const img: StudioImageDataLike = { data: new Uint8ClampedArray(0), width: 0, height: 0 };
    expect(() => applyGrain(img, { type: "film", amount: 50, size: 2, seed: 1 })).not.toThrow();
  });

  it("강한 노이즈에도 채널은 유한 0..255로 클램프된다", () => {
    const img = makeSolid(8, 8, 250); // 거의 흰색 → 가산 노이즈가 255를 넘을 수 있음
    applyGrain(img, { type: "film", amount: 100, size: 1, seed: 13 });
    for (const v of img.data) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe("GRAIN_PRESETS", () => {
  it("첫 항목이 '없음/기본' 항등이 아니다(바로 효과)", () => {
    const first = GRAIN_PRESETS[0]!;
    expect(isIdentityGrain(first.value)).toBe(false);
    expect(first.id).not.toBe("none");
  });

  it("6개 내외다", () => {
    expect(GRAIN_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(GRAIN_PRESETS.length).toBeLessThanOrEqual(8);
  });

  it("id는 모두 고유하다", () => {
    const ids = GRAIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("label/tip은 비어있지 않다", () => {
    for (const p of GRAIN_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.tip.length).toBeGreaterThan(0);
    }
  });

  it("모든 value가 normalizeGrain과 동일(범위 안)", () => {
    for (const p of GRAIN_PRESETS) {
      expect(p.value).toEqual(normalizeGrain(p.value));
      expect(p.value.amount).toBeGreaterThanOrEqual(GRAIN_AMOUNT_RANGE.min);
      expect(p.value.amount).toBeLessThanOrEqual(GRAIN_AMOUNT_RANGE.max);
      expect(p.value.size).toBeGreaterThanOrEqual(GRAIN_SIZE_RANGE.min);
      expect(p.value.size).toBeLessThanOrEqual(GRAIN_SIZE_RANGE.max);
      expect(GRAIN_TYPES.some((t) => t.id === p.value.type)).toBe(true);
    }
  });

  it("명세된 대표 프리셋 값을 담고 있다", () => {
    const byId = new Map(GRAIN_PRESETS.map((p) => [p.id, p.value]));
    // 필름 그레인(film 30)
    const film = byId.get("film-grain")!;
    expect(film.type).toBe("film");
    expect(film.amount).toBe(30);
    // 거친 필름(film 60 size3)
    const rough = byId.get("film-rough")!;
    expect(rough.type).toBe("film");
    expect(rough.amount).toBe(60);
    expect(rough.size).toBe(3);
    // 오래된 종이(paper 40)
    const paper = byId.get("old-paper")!;
    expect(paper.type).toBe("paper");
    expect(paper.amount).toBe(40);
    // CRT(scanline 50 size2)
    const crt = byId.get("crt")!;
    expect(crt.type).toBe("scanline");
    expect(crt.amount).toBe(50);
    expect(crt.size).toBe(2);
    // 빈티지 도트(halftoneDot 35)
    const dot = byId.get("vintage-dot")!;
    expect(dot.type).toBe("halftoneDot");
    expect(dot.amount).toBe(35);
  });
});

describe("grainKonvaFilter", () => {
  it("flat attrs(grainType/grainAmount/grainSize/grainSeed)를 읽어 픽셀을 변형한다", () => {
    const img = makeSolid(8, 8, 128);
    grainKonvaFilter.call({ attrs: { grainType: "film", grainAmount: 60, grainSize: 1, grainSeed: 7 } }, img);

    // applyGrain 직접 호출과 동일해야 한다.
    const ref = makeSolid(8, 8, 128);
    applyGrain(ref, normalizeGrain({ type: "film", amount: 60, size: 1, seed: 7 }));
    expect(dataEqual(img, ref)).toBe(true);
    // 실제로 변형됐는지.
    expect(dataEqual(img, makeSolid(8, 8, 128))).toBe(false);
  });

  it("attrs가 비면 no-op(throw 없음)", () => {
    const img = makeImage(1, 1, [[10, 20, 30, 40]]);
    expect(() => grainKonvaFilter.call({ attrs: {} }, img)).not.toThrow();
    expect(pixelAt(img, 0)).toEqual([10, 20, 30, 40]);
  });

  it("this.attrs 자체가 없어도 no-op", () => {
    const img = makeImage(1, 1, [[10, 20, 30, 40]]);
    expect(() => grainKonvaFilter.call({}, img)).not.toThrow();
    expect(pixelAt(img, 0)).toEqual([10, 20, 30, 40]);
  });

  it("무효 attrs(숫자 아님)는 안전하게 무시 — type만 유효해도 amount 누락이면 항등 no-op", () => {
    const img = makeImage(1, 1, [[10, 20, 30, 255]]);
    const attrs = { grainType: "paper", grainAmount: Number.NaN, grainSize: "x" };
    expect(() => grainKonvaFilter.call({ attrs }, img)).not.toThrow();
    expect(pixelAt(img, 0)).toEqual([10, 20, 30, 255]);
  });

  it("amount0으로 정규화되는 attrs는 no-op", () => {
    const img = makeImage(1, 1, [[55, 110, 165, 220]]);
    grainKonvaFilter.call({ attrs: { grainType: "scanline", grainAmount: 0, grainSize: 2, grainSeed: 1 } }, img);
    expect(pixelAt(img, 0)).toEqual([55, 110, 165, 220]);
  });
});

// 미사용 import 방지용 타입 참조.
const _typecheck: Grain = DEFAULT_GRAIN;
void _typecheck;
