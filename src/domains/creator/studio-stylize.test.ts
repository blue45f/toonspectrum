import { describe, expect, it } from "vitest";

import { type StudioImageDataLike } from "./studio-filters";
import {
  DEFAULT_STYLIZE,
  STYLIZE_DETAIL_RANGE,
  STYLIZE_PRESETS,
  STYLIZE_STRENGTH_RANGE,
  STYLIZE_TYPES,
  applyStylize,
  isIdentityStylize,
  normalizeStylize,
  stylizeKonvaFilter,
  type Stylize,
  type StylizeType,
} from "./studio-stylize";

// ---- 테스트용 가짜 ImageData 빌더 ----

/** [r,g,b,a] 픽셀 배열로 StudioImageDataLike 생성(부분 채움 허용). */
function makeImage(width: number, height: number, pixels: number[][]): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((px, i) => data.set(px, i * 4));
  return { data, width, height };
}

function pixelAt(img: StudioImageDataLike, index: number): number[] {
  return Array.from(img.data.slice(index * 4, index * 4 + 4));
}

/** width*height 균일 단색 이미지 — 모든 픽셀 [r,g,b,a]. */
function makeSolid(width: number, height: number, rgba: [number, number, number, number]): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { data, width, height };
}

/**
 * 좌표 의존 패턴 이미지 — r/g/b가 x,y에 따라 변하는 결정적 그라디언트.
 * 균일색은 외곽선/엠보스/유화에서 평탄해 변화가 약하므로, 변형 감지는 패턴으로 한다(알파는 인자로).
 */
function makePattern(width: number, height: number, alpha = 255): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 17 + 13) % 256; // R: 가로 줄무늬
      data[i + 1] = (y * 23 + 7) % 256; // G: 세로 줄무늬
      data[i + 2] = (x * 7 + y * 11) % 256; // B: 대각
      data[i + 3] = alpha;
    }
  }
  return { data, width, height };
}

/** 두 이미지의 픽셀 데이터가 완전히 같은지. */
function dataEqual(a: StudioImageDataLike, b: StudioImageDataLike): boolean {
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

/** 모든 픽셀의 알파(+3)가 기대 배열과 일치하는지(원본 알파 보존 검증). */
function alphaPreserved(img: StudioImageDataLike, before: StudioImageDataLike): boolean {
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] !== before.data[i]) return false;
  }
  return true;
}

// 모든 종류(strength>0, opaque)에서 픽셀이 실제로 바뀌는지 검증할 때 쓰는 설정.
const ALL_TYPES: StylizeType[] = ["emboss", "findEdges", "solarize", "oilPaint"];

// ---------------------------------------------------------------------------

describe("DEFAULT_STYLIZE / isIdentityStylize", () => {
  it("기본값은 emboss·strength0·detail3 항등", () => {
    expect(DEFAULT_STYLIZE).toEqual({ type: "emboss", strength: 0, detail: 3 });
    expect(isIdentityStylize(DEFAULT_STYLIZE)).toBe(true);
  });

  it("strength<=0이면 항등, strength>0이면 항등 아님", () => {
    expect(isIdentityStylize({ type: "emboss", strength: 0, detail: 5 })).toBe(true);
    expect(isIdentityStylize({ type: "findEdges", strength: -5, detail: 1 })).toBe(true);
    expect(isIdentityStylize({ type: "solarize", strength: 1, detail: 3 })).toBe(false);
    expect(isIdentityStylize({ type: "oilPaint", strength: 80, detail: 4 })).toBe(false);
  });
});

describe("범위·종류 상수", () => {
  it("세기 범위는 0..100, step 1", () => {
    expect(STYLIZE_STRENGTH_RANGE).toEqual({ min: 0, max: 100, step: 1 });
  });
  it("디테일 범위는 1..10, step 1", () => {
    expect(STYLIZE_DETAIL_RANGE).toEqual({ min: 1, max: 10, step: 1 });
  });
  it("STYLIZE_TYPES는 4종(emboss·findEdges·solarize·oilPaint)과 한글 라벨", () => {
    expect(STYLIZE_TYPES.map((t) => t.id)).toEqual(["emboss", "findEdges", "solarize", "oilPaint"]);
    const labels = new Map(STYLIZE_TYPES.map((t) => [t.id, t.label]));
    expect(labels.get("emboss")).toBe("엠보스");
    expect(labels.get("findEdges")).toBe("외곽선");
    expect(labels.get("solarize")).toBe("솔라리제이션");
    expect(labels.get("oilPaint")).toBe("유화");
  });
});

describe("normalizeStylize", () => {
  it("undefined/null → 기본값", () => {
    expect(normalizeStylize()).toEqual(DEFAULT_STYLIZE);
    expect(normalizeStylize(null)).toEqual(DEFAULT_STYLIZE);
  });

  it("누락 키는 기본값으로 채운다", () => {
    expect(normalizeStylize({ strength: 40 })).toEqual({ type: "emboss", strength: 40, detail: 3 });
    expect(normalizeStylize({ type: "oilPaint" })).toEqual({ type: "oilPaint", strength: 0, detail: 3 });
  });

  it("범위 밖 숫자는 각 범위로 클램프", () => {
    expect(normalizeStylize({ type: "findEdges", strength: 999, detail: 99 })).toEqual({
      type: "findEdges",
      strength: 100,
      detail: 10,
    });
    expect(normalizeStylize({ strength: -50, detail: -3 })).toEqual({
      type: "emboss",
      strength: 0,
      detail: 1,
    });
  });

  it("유효하지 않은 type은 기본 'emboss'로", () => {
    expect(normalizeStylize({ type: "bogus" as unknown as StylizeType }).type).toBe("emboss");
    expect(normalizeStylize({ type: 42 as unknown as StylizeType }).type).toBe("emboss");
    // 유효 type은 그대로 유지.
    for (const t of STYLIZE_TYPES) {
      expect(normalizeStylize({ type: t.id }).type).toBe(t.id);
    }
  });

  it("숫자가 아닌 값/NaN/Infinity는 기본값", () => {
    const out = normalizeStylize({
      strength: "50" as unknown as number,
      detail: Number.NaN,
    });
    expect(out).toEqual({ type: "emboss", strength: 0, detail: 3 });
    expect(normalizeStylize({ strength: Number.POSITIVE_INFINITY, detail: Number.NEGATIVE_INFINITY })).toEqual(
      DEFAULT_STYLIZE
    );
  });

  it("소수 detail은 정수로 내림", () => {
    expect(normalizeStylize({ detail: 5.9 }).detail).toBe(5);
    expect(normalizeStylize({ detail: 1.2 }).detail).toBe(1);
  });
});

describe("applyStylize — 항등/no-op", () => {
  it("strength0이면 no-op(데이터 불변)", () => {
    const img = makePattern(8, 8);
    const before = makePattern(8, 8);
    applyStylize(img, { type: "emboss", strength: 0, detail: 3 });
    expect(dataEqual(img, before)).toBe(true);
  });

  it("모든 종류가 strength0에서 정확한 no-op", () => {
    for (const type of ALL_TYPES) {
      const img = makePattern(8, 8);
      const before = makePattern(8, 8);
      applyStylize(img, { type, strength: 0, detail: 4 });
      expect(dataEqual(img, before)).toBe(true);
    }
  });

  it("strength<=0(음수)도 no-op", () => {
    const img = makePattern(6, 6);
    const before = makePattern(6, 6);
    applyStylize(img, { type: "oilPaint", strength: -10, detail: 3 });
    expect(dataEqual(img, before)).toBe(true);
  });

  it("폭/높이 0이면 no-op(throw 없음)", () => {
    const img: StudioImageDataLike = { data: new Uint8ClampedArray(0), width: 0, height: 0 };
    expect(() => applyStylize(img, { type: "findEdges", strength: 100, detail: 2 })).not.toThrow();
  });
});

describe("applyStylize — 각 종류가 픽셀을 눈에 띄게 바꾼다", () => {
  it("모든 종류가 패턴(불투명)을 실제로 변형한다", () => {
    for (const type of ALL_TYPES) {
      const img = makePattern(16, 16, 255);
      const before = makePattern(16, 16, 255);
      applyStylize(img, { type, strength: 100, detail: 3 });
      expect(dataEqual(img, before)).toBe(false);
    }
  });

  it("모든 종류가 결정적 — 같은 입력 두 번이 완전히 동일", () => {
    for (const type of ALL_TYPES) {
      const a = makePattern(20, 16, 255);
      const b = makePattern(20, 16, 255);
      applyStylize(a, { type, strength: 70, detail: 4 });
      applyStylize(b, { type, strength: 70, detail: 4 });
      expect(dataEqual(a, b)).toBe(true);
    }
  });

  it("모든 종류가 알파(+3)를 보존한다(불투명·반투명 모두)", () => {
    for (const alpha of [255, 120]) {
      for (const type of ALL_TYPES) {
        const img = makePattern(16, 16, alpha);
        const before = makePattern(16, 16, alpha);
        applyStylize(img, { type, strength: 90, detail: 3 });
        expect(alphaPreserved(img, before)).toBe(true);
      }
    }
  });

  it("모든 종류가 채널을 유한 0..255로 클램프한다(강한 설정)", () => {
    for (const type of ALL_TYPES) {
      const img = makePattern(16, 16, 255);
      applyStylize(img, { type, strength: 100, detail: 10 });
      for (const v of img.data) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("applyStylize — emboss(엠보스 양각)", () => {
  it("평탄 영역은 흰색이 아니라 중립 회색 128로 수렴한다(제로섬 커널, 강한 strength)", () => {
    // 제로섬 커널이라 경사 없는 균일색은 acc=0 → v=128 회색이 된다.
    // (과거 합=1 버그에선 밝은 단색의 휘도가 그대로 더해져 255로 포화했다 — 회귀 방지.)
    const img = makeSolid(8, 8, [80, 140, 210, 255]); // 밝은 단색(luma≈140)
    applyStylize(img, { type: "emboss", strength: 100, detail: 1 });
    const center = pixelAt(img, 4 * 8 + 4);
    expect(center[0]).toBe(center[1]);
    expect(center[1]).toBe(center[2]);
    expect(Math.abs(center[0]! - 128)).toBeLessThanOrEqual(2); // 255 포화가 아니라 128 부근
  });

  it("완전 투명(alpha 0) 픽셀은 효과를 더하지 않아 r/g/b가 원본 그대로다(헤일로 없음)", () => {
    // 투명 픽셀은 (alpha/255)=0 스케일이라 블렌드 강도 0 → 원본 유지.
    const img = makeImage(3, 3, [
      [10, 20, 30, 0],
      [40, 50, 60, 0],
      [70, 80, 90, 0],
      [100, 110, 120, 0],
      [130, 140, 150, 0],
      [160, 170, 180, 0],
      [190, 200, 210, 0],
      [220, 230, 240, 0],
      [250, 5, 15, 0],
    ]);
    const before = makeImage(3, 3, [
      [10, 20, 30, 0],
      [40, 50, 60, 0],
      [70, 80, 90, 0],
      [100, 110, 120, 0],
      [130, 140, 150, 0],
      [160, 170, 180, 0],
      [190, 200, 210, 0],
      [220, 230, 240, 0],
      [250, 5, 15, 0],
    ]);
    applyStylize(img, { type: "emboss", strength: 100, detail: 2 });
    expect(dataEqual(img, before)).toBe(true);
  });

  it("detail이 다르면 결과가 달라진다(샘플 거리)", () => {
    const a = makePattern(20, 20, 255);
    const b = makePattern(20, 20, 255);
    applyStylize(a, { type: "emboss", strength: 100, detail: 1 });
    applyStylize(b, { type: "emboss", strength: 100, detail: 4 });
    expect(dataEqual(a, b)).toBe(false);
  });
});

describe("applyStylize — findEdges(외곽선)", () => {
  it("평탄 영역(균일색)은 거의 흰 바탕(255)으로 간다", () => {
    // 기울기 0 → out = 255 - 0 = 255.
    const img = makeSolid(8, 8, [60, 90, 120, 255]);
    applyStylize(img, { type: "findEdges", strength: 100, detail: 1 });
    const center = pixelAt(img, 4 * 8 + 4);
    expect(center[0]).toBe(255);
    expect(center[1]).toBe(255);
    expect(center[2]).toBe(255);
  });

  it("경계가 있는 패턴은 어두운 외곽선이 생긴다(평탄보다 어두운 픽셀 존재)", () => {
    const img = makePattern(24, 24, 255);
    applyStylize(img, { type: "findEdges", strength: 100, detail: 1 });
    let hasDark = false;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i]! < 255) {
        hasDark = true;
        break;
      }
    }
    expect(hasDark).toBe(true);
  });

  it("강한 외곽선에도 채널은 유한 0..255", () => {
    const img = makePattern(16, 16, 255);
    applyStylize(img, { type: "findEdges", strength: 100, detail: 5 });
    for (const v of img.data) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe("applyStylize — solarize(솔라리제이션)", () => {
  it("임계 초과 채널은 반전, 이하 채널은 유지(부분 반전)", () => {
    // detail 3 → threshold 128. r=200(>128)은 55로 반전, b=50(<128)은 유지.
    const img = makeSolid(1, 1, [200, 128, 50, 255]);
    applyStylize(img, { type: "solarize", strength: 100, detail: 3 });
    const px = pixelAt(img, 0);
    expect(px[0]).toBe(255 - 200); // 55, 반전
    expect(px[1]).toBe(128); // 임계와 같음(>아님) → 유지
    expect(px[2]).toBe(50); // 임계 이하 유지
  });

  it("detail이 클수록 임계가 낮아져 더 많은 톤이 반전된다", () => {
    // r=110: detail 3(thr128)에선 유지(110<=128), detail 8(thr<110)에선 반전.
    const lo = makeSolid(1, 1, [110, 110, 110, 255]);
    const hi = makeSolid(1, 1, [110, 110, 110, 255]);
    applyStylize(lo, { type: "solarize", strength: 100, detail: 3 });
    applyStylize(hi, { type: "solarize", strength: 100, detail: 8 });
    expect(pixelAt(lo, 0)[0]).toBe(110); // 유지
    expect(pixelAt(hi, 0)[0]).toBe(255 - 110); // 145, 반전
  });

  it("strength 부분 적용은 원본과 반전 사이로 블렌드된다", () => {
    // r=200 → 반전 55. strength 50이면 200과 55의 중간(약 127.5 → 클램프 반올림).
    const img = makeSolid(1, 1, [200, 0, 0, 255]);
    applyStylize(img, { type: "solarize", strength: 50, detail: 3 });
    const r = pixelAt(img, 0)[0]!;
    expect(r).toBeGreaterThan(55);
    expect(r).toBeLessThan(200);
  });
});

describe("applyStylize — oilPaint(유화)", () => {
  it("패턴을 평탄화하되 결정적(같은 입력=같은 결과)", () => {
    const a = makePattern(24, 24, 255);
    const b = makePattern(24, 24, 255);
    const base = makePattern(24, 24, 255);
    applyStylize(a, { type: "oilPaint", strength: 100, detail: 3 });
    applyStylize(b, { type: "oilPaint", strength: 100, detail: 3 });
    expect(dataEqual(a, base)).toBe(false); // 붓 터치로 색이 뭉친다
    expect(dataEqual(a, b)).toBe(true); // 결정적
  });

  it("균일색은 유화로도 변하지 않는다(모든 이웃 같은 빈·같은 색)", () => {
    // 이웃이 전부 같은 색이면 평균도 같은 색 → 결과 불변.
    const img = makeSolid(16, 16, [90, 140, 210, 255]);
    const before = makeSolid(16, 16, [90, 140, 210, 255]);
    applyStylize(img, { type: "oilPaint", strength: 100, detail: 4 });
    expect(dataEqual(img, before)).toBe(true);
  });

  it("detail(반경)이 다르면 결과가 달라진다", () => {
    const a = makePattern(24, 24, 255);
    const b = makePattern(24, 24, 255);
    applyStylize(a, { type: "oilPaint", strength: 100, detail: 1 });
    applyStylize(b, { type: "oilPaint", strength: 100, detail: 5 });
    expect(dataEqual(a, b)).toBe(false);
  });

  it("알파는 보존된다(반투명 포함)", () => {
    const img = makePattern(16, 16, 88);
    const before = makePattern(16, 16, 88);
    applyStylize(img, { type: "oilPaint", strength: 100, detail: 4 });
    expect(alphaPreserved(img, before)).toBe(true);
  });
});

describe("applyStylize — 작은 이미지 안전성", () => {
  it("1x1 이미지(가장 작은 케이스)도 throw 없이 안전하고 알파 보존", () => {
    for (const type of ALL_TYPES) {
      const img = makeImage(1, 1, [[130, 90, 60, 200]]);
      expect(() => applyStylize(img, { type, strength: 100, detail: 10 })).not.toThrow();
      expect(pixelAt(img, 0)[3]).toBe(200); // 알파 보존
      for (const v of img.data) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });

  it("2x2 작은 이미지도 모든 종류에서 throw 없이 유한 출력", () => {
    for (const type of ALL_TYPES) {
      const img = makeImage(2, 2, [
        [10, 20, 30, 255],
        [200, 100, 50, 255],
        [80, 160, 240, 255],
        [128, 128, 128, 255],
      ]);
      expect(() => applyStylize(img, { type, strength: 100, detail: 8 })).not.toThrow();
      for (const v of img.data) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("STYLIZE_PRESETS", () => {
  it("첫 항목이 '없음/기본' 항등이 아니다(바로 효과)", () => {
    const first = STYLIZE_PRESETS[0]!;
    expect(isIdentityStylize(first.value)).toBe(false);
    expect(first.id).not.toBe("none");
  });

  it("전부 실효(strength>0) 프리셋이고 5개 내외다", () => {
    expect(STYLIZE_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(STYLIZE_PRESETS.length).toBeLessThanOrEqual(8);
    for (const p of STYLIZE_PRESETS) {
      expect(isIdentityStylize(p.value)).toBe(false);
      expect(p.value.strength).toBeGreaterThan(0);
    }
  });

  it("id는 모두 고유하다", () => {
    const ids = STYLIZE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("label/tip은 비어있지 않다", () => {
    for (const p of STYLIZE_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.tip.length).toBeGreaterThan(0);
    }
  });

  it("모든 value가 normalizeStylize와 동일(범위 안·type 유효)", () => {
    for (const p of STYLIZE_PRESETS) {
      expect(p.value).toEqual(normalizeStylize(p.value));
      expect(p.value.strength).toBeGreaterThanOrEqual(STYLIZE_STRENGTH_RANGE.min);
      expect(p.value.strength).toBeLessThanOrEqual(STYLIZE_STRENGTH_RANGE.max);
      expect(p.value.detail).toBeGreaterThanOrEqual(STYLIZE_DETAIL_RANGE.min);
      expect(p.value.detail).toBeLessThanOrEqual(STYLIZE_DETAIL_RANGE.max);
      expect(STYLIZE_TYPES.some((t) => t.id === p.value.type)).toBe(true);
    }
  });

  it("명세된 대표 프리셋 값을 담고 있다(엠보스/라인아트/솔라리/유화/강한 유화)", () => {
    const byId = new Map(STYLIZE_PRESETS.map((p) => [p.id, p.value]));
    expect(byId.get("emboss")!.type).toBe("emboss");
    const lineart = byId.get("lineart")!;
    expect(lineart.type).toBe("findEdges");
    expect(lineart.strength).toBe(100);
    expect(byId.get("solar")!.type).toBe("solarize");
    const oil = byId.get("oil")!;
    expect(oil.type).toBe("oilPaint");
    const oilStrong = byId.get("oil-strong")!;
    expect(oilStrong.type).toBe("oilPaint");
    // 강한 유화는 더 큰 detail(반경).
    expect(oilStrong.detail).toBeGreaterThan(oil.detail);
  });
});

describe("stylizeKonvaFilter", () => {
  it("flat attrs(stType/stStrength/stDetail)를 읽어 applyStylize와 동일하게 변형", () => {
    const img = makePattern(16, 16, 255);
    stylizeKonvaFilter.call({ attrs: { stType: "findEdges", stStrength: 100, stDetail: 2 } }, img);

    // applyStylize 직접 호출과 동일해야 한다.
    const ref = makePattern(16, 16, 255);
    applyStylize(ref, normalizeStylize({ type: "findEdges", strength: 100, detail: 2 }));
    expect(dataEqual(img, ref)).toBe(true);
    // 실제로 변형됐는지.
    expect(dataEqual(img, makePattern(16, 16, 255))).toBe(false);
  });

  it("oilPaint attrs도 동일하게 적용", () => {
    const img = makePattern(20, 20, 255);
    stylizeKonvaFilter.call({ attrs: { stType: "oilPaint", stStrength: 90, stDetail: 3 } }, img);
    const ref = makePattern(20, 20, 255);
    applyStylize(ref, normalizeStylize({ type: "oilPaint", strength: 90, detail: 3 }));
    expect(dataEqual(img, ref)).toBe(true);
  });

  it("attrs가 비면 no-op(throw 없음)", () => {
    const img = makeImage(2, 2, [[10, 20, 30, 40]]);
    const before = Array.from(img.data);
    expect(() => stylizeKonvaFilter.call({ attrs: {} }, img)).not.toThrow();
    expect(Array.from(img.data)).toEqual(before);
  });

  it("this.attrs 자체가 없어도 no-op", () => {
    const img = makeImage(2, 2, [[10, 20, 30, 40]]);
    const before = Array.from(img.data);
    expect(() => stylizeKonvaFilter.call({}, img)).not.toThrow();
    expect(Array.from(img.data)).toEqual(before);
  });

  it("strength0으로 정규화되는 attrs는 no-op", () => {
    const img = makePattern(8, 8);
    const before = Array.from(img.data);
    stylizeKonvaFilter.call({ attrs: { stType: "solarize", stStrength: 0, stDetail: 4 } }, img);
    expect(Array.from(img.data)).toEqual(before);
  });

  it("무효 attrs(숫자 아님)는 안전하게 무시 — type만 유효해도 strength 누락이면 항등 no-op", () => {
    const img = makePattern(8, 8);
    const before = Array.from(img.data);
    const attrs = { stType: "oilPaint", stStrength: Number.NaN, stDetail: "x" };
    expect(() => stylizeKonvaFilter.call({ attrs }, img)).not.toThrow();
    expect(Array.from(img.data)).toEqual(before);
  });
});

// 모든 종류가 완전 투명(알파 0) 픽셀의 RGB까지 보존하는지(헤일로 없음) — 알파 가드 회귀 방지.
// findEdges는 평탄 영역을 흰색(255)으로 보내므로 알파 가드가 없으면 투명 영역이 흰색으로 샌다.
describe("applyStylize — 완전 투명 픽셀 RGB 보존(전 종류)", () => {
  it("알파 0 패턴은 모든 종류에서 RGB까지 그대로다", () => {
    for (const type of ALL_TYPES) {
      const img = makePattern(8, 8, 0); // 알파 0(투명)
      const before = makePattern(8, 8, 0);
      applyStylize(img, { type, strength: 100, detail: 3 });
      expect(dataEqual(img, before)).toBe(true);
    }
  });
});

// 미사용 import 방지용 타입 참조.
const _typecheck: Stylize = DEFAULT_STYLIZE;
void _typecheck;
