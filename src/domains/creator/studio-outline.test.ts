import { describe, expect, it } from "vitest";

import { type StudioImageDataLike } from "./studio-filters";
import {
  DEFAULT_OUTLINE,
  OUTLINE_OPACITY_RANGE,
  OUTLINE_PRESETS,
  OUTLINE_WIDTH_RANGE,
  applyOutline,
  isIdentityOutline,
  normalizeOutline,
  outlineCachePad,
  outlineKonvaFilter,
  type Outline,
} from "./studio-outline";

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

/**
 * 가운데 2x2가 불투명(opaqueColor, alpha=255)이고 둘레가 투명한 4x4 이미지.
 * 인덱스: (x,y) → y*4+x. 불투명 블록은 (1,1)(2,1)(1,2)(2,2).
 */
function makeBlockImage(opaqueColor: [number, number, number]): StudioImageDataLike {
  const pixels: number[][] = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const opaque = (x === 1 || x === 2) && (y === 1 || y === 2);
      pixels.push(opaque ? [...opaqueColor, 255] : [0, 0, 0, 0]);
    }
  }
  return makeImage(4, 4, pixels);
}

const at = (x: number, y: number) => y * 4 + x;

describe("DEFAULT_OUTLINE / isIdentityOutline", () => {
  it("기본값은 흰색·두께0·불투명100인 항등(두께0이라 아무것도 안 그림)", () => {
    expect(DEFAULT_OUTLINE).toEqual({ color: "#ffffff", width: 0, opacity: 100 });
    expect(isIdentityOutline(DEFAULT_OUTLINE)).toBe(true);
  });

  it("두께>0이고 불투명도>0이면 항등이 아니다", () => {
    expect(isIdentityOutline({ color: "#ffffff", width: 8, opacity: 100 })).toBe(false);
  });

  it("두께0 또는 불투명도0이면 항등", () => {
    expect(isIdentityOutline({ color: "#ffffff", width: 0, opacity: 100 })).toBe(true);
    expect(isIdentityOutline({ color: "#ffffff", width: 10, opacity: 0 })).toBe(true);
  });
});

describe("OUTLINE_WIDTH_RANGE / OUTLINE_OPACITY_RANGE", () => {
  it("두께 범위는 0..30, step 1", () => {
    expect(OUTLINE_WIDTH_RANGE).toEqual({ min: 0, max: 30, step: 1 });
  });
  it("불투명도 범위는 0..100, step 1", () => {
    expect(OUTLINE_OPACITY_RANGE).toEqual({ min: 0, max: 100, step: 1 });
  });
});

describe("normalizeOutline", () => {
  it("undefined/null → 기본값", () => {
    expect(normalizeOutline()).toEqual(DEFAULT_OUTLINE);
    expect(normalizeOutline(null)).toEqual(DEFAULT_OUTLINE);
  });

  it("누락 키는 기본값으로 채운다", () => {
    expect(normalizeOutline({ width: 8 })).toEqual({ color: "#ffffff", width: 8, opacity: 100 });
    expect(normalizeOutline({ color: "#123456" })).toEqual({ color: "#123456", width: 0, opacity: 100 });
  });

  it("범위 밖 width/opacity는 각 범위로 클램프", () => {
    expect(normalizeOutline({ width: 999, opacity: 999 })).toEqual({ color: "#ffffff", width: 30, opacity: 100 });
    expect(normalizeOutline({ width: -50, opacity: -50 })).toEqual({ color: "#ffffff", width: 0, opacity: 0 });
  });

  it("#rrggbb가 아닌 color는 기본 흰색으로 되돌린다", () => {
    expect(normalizeOutline({ color: "red" }).color).toBe("#ffffff");
    expect(normalizeOutline({ color: "#abc" }).color).toBe("#ffffff"); // 3자리 단축형은 거부
    expect(normalizeOutline({ color: 123 as unknown as string }).color).toBe("#ffffff");
    expect(normalizeOutline({ color: "#AABBCC" }).color).toBe("#AABBCC"); // 대문자 6자리는 허용
  });

  it("숫자가 아닌 width/opacity는 기본값", () => {
    const out = normalizeOutline({
      width: "8" as unknown as number,
      opacity: Number.NaN,
    });
    expect(out).toEqual({ color: "#ffffff", width: 0, opacity: 100 });
    expect(normalizeOutline({ width: Number.POSITIVE_INFINITY }).width).toBe(0);
  });
});

describe("applyOutline — 항등/no-op", () => {
  it("두께0이면 no-op (데이터 불변)", () => {
    const img = makeBlockImage([200, 0, 0]);
    const before = Array.from(img.data);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 0, opacity: 100 }));
    expect(Array.from(img.data)).toEqual(before);
  });

  it("불투명도0이면 no-op (데이터 불변)", () => {
    const img = makeBlockImage([200, 0, 0]);
    const before = Array.from(img.data);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 6, opacity: 0 }));
    expect(Array.from(img.data)).toEqual(before);
  });

  it("불투명 픽셀이 하나도 없으면 자랄 실루엣이 없어 no-op", () => {
    const img = makeImage(3, 3, Array.from({ length: 9 }, () => [10, 20, 30, 0]));
    const before = Array.from(img.data);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 5, opacity: 100 }));
    expect(Array.from(img.data)).toEqual(before);
  });
});

describe("applyOutline — 실루엣 바깥 테두리(알파 팽창)", () => {
  it("width=1은 블록에 바로 붙은 투명 픽셀을 테두리 색으로 채운다(불투명 블록은 불변)", () => {
    const img = makeBlockImage([200, 0, 0]);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 1, opacity: 100 }));

    // 불투명 2x2 블록은 r/g/b·alpha 모두 그대로.
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]) {
      expect(pixelAt(img, at(x!, y!))).toEqual([200, 0, 0, 255]);
    }

    // 블록과 변을 맞댄(거리^2=1) 투명 픽셀은 테두리 초록·alpha>0.
    for (const [x, y] of [
      [0, 1],
      [0, 2], // 왼쪽 변
      [3, 1],
      [3, 2], // 오른쪽 변
      [1, 0],
      [2, 0], // 위쪽 변
      [1, 3],
      [2, 3], // 아래쪽 변
    ]) {
      const px = pixelAt(img, at(x!, y!));
      expect(px[0]).toBe(0);
      expect(px[1]).toBe(255);
      expect(px[2]).toBe(0);
      expect(px[3]).toBeGreaterThan(0);
      expect(px[3]).toBe(255); // opacity 100 → alpha 255
    }
  });

  it("width=1에서 대각 코너(거리^2=2)는 반경 밖이라 칠하지 않는다", () => {
    const img = makeBlockImage([200, 0, 0]);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 1, opacity: 100 }));
    // 네 코너는 가장 가까운 불투명 픽셀까지 거리^2=2 > 1^2 → 투명 유지.
    for (const [x, y] of [
      [0, 0],
      [3, 0],
      [0, 3],
      [3, 3],
    ]) {
      expect(pixelAt(img, at(x!, y!))).toEqual([0, 0, 0, 0]);
    }
  });

  it("width를 키우면 더 멀리(코너까지) 테두리가 자란다", () => {
    const img = makeBlockImage([200, 0, 0]);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 2, opacity: 100 }));
    // 거리^2=2 <= 2^2=4 → 코너도 이제 테두리.
    const corner = pixelAt(img, at(0, 0));
    expect(corner[1]).toBe(255);
    expect(corner[3]).toBeGreaterThan(0);
  });

  it("opacity가 테두리 링의 알파를 정한다(255*opacity/100)", () => {
    const img = makeBlockImage([200, 0, 0]);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 1, opacity: 40 }));
    // round(255*40/100)=round(102)=102.
    expect(pixelAt(img, at(0, 1))[3]).toBe(102);
    // 불투명 블록의 알파(255)는 영향 없음.
    expect(pixelAt(img, at(1, 1))[3]).toBe(255);
  });

  it("원본 불투명 픽셀의 색·알파를 절대 바꾸지 않는다(알파 보존)", () => {
    // 알파가 정확히 임계(128)인 픽셀도 불투명으로 간주되어 보존된다.
    const img = makeImage(3, 1, [
      [10, 20, 30, 0], // 투명
      [90, 110, 130, 128], // 불투명 경계
      [40, 50, 60, 0], // 투명
    ]);
    applyOutline(img, normalizeOutline({ color: "#ffffff", width: 1, opacity: 100 }));
    // 가운데 불투명(>=128)은 그대로.
    expect(pixelAt(img, 1)).toEqual([90, 110, 130, 128]);
    // 양옆 투명은 테두리 흰색으로.
    expect(pixelAt(img, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(img, 2)).toEqual([255, 255, 255, 255]);
  });

  it("반투명(<128) 픽셀도 테두리 후보다(불투명으로 안 침)", () => {
    const img = makeImage(3, 1, [
      [10, 20, 30, 127], // 반투명(임계 미만) → 후보
      [0, 0, 0, 255], // 불투명 시드
      [40, 50, 60, 100], // 반투명 → 후보
    ]);
    applyOutline(img, normalizeOutline({ color: "#00ff00", width: 1, opacity: 100 }));
    // 불투명 시드는 보존.
    expect(pixelAt(img, 1)).toEqual([0, 0, 0, 255]);
    // 양옆 반투명은 테두리로 덮인다.
    expect(pixelAt(img, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(img, 2)).toEqual([0, 255, 0, 255]);
  });

  it("0 크기 이미지에서도 throw 없이 no-op", () => {
    const img = makeImage(0, 0, []);
    expect(() => applyOutline(img, normalizeOutline({ width: 5, opacity: 100 }))).not.toThrow();
    expect(img.data.length).toBe(0);
  });
});

describe("OUTLINE_PRESETS", () => {
  it("첫 항목은 none/없음 항등(width0)", () => {
    const first = OUTLINE_PRESETS[0]!;
    expect(first.id).toBe("none");
    expect(first.label).toBe("없음");
    expect(first.value.width).toBe(0);
    expect(isIdentityOutline(first.value)).toBe(true);
  });

  it("나머지 프리셋은 모두 width>0(실제로 테두리가 그려짐)", () => {
    for (const p of OUTLINE_PRESETS.slice(1)) {
      expect(p.value.width).toBeGreaterThan(0);
      expect(isIdentityOutline(p.value)).toBe(false);
    }
  });

  it("프리셋이 6개 내외다", () => {
    expect(OUTLINE_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  it("id는 모두 고유하다", () => {
    const ids = OUTLINE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("value도 (색·width·opacity 조합으로) 모두 고유하다", () => {
    const keys = OUTLINE_PRESETS.map((p) => `${p.value.color}|${p.value.width}|${p.value.opacity}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("label/tip은 비어있지 않다", () => {
    for (const p of OUTLINE_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.tip.length).toBeGreaterThan(0);
    }
  });

  it("모든 value가 normalizeOutline와 동일(색 #rrggbb·범위 안)", () => {
    for (const p of OUTLINE_PRESETS) {
      expect(p.value).toEqual(normalizeOutline(p.value));
      expect(p.value.width).toBeGreaterThanOrEqual(OUTLINE_WIDTH_RANGE.min);
      expect(p.value.width).toBeLessThanOrEqual(OUTLINE_WIDTH_RANGE.max);
      expect(p.value.opacity).toBeGreaterThanOrEqual(OUTLINE_OPACITY_RANGE.min);
      expect(p.value.opacity).toBeLessThanOrEqual(OUTLINE_OPACITY_RANGE.max);
    }
  });

  it("명세된 대표 프리셋(흰/검정/두꺼운 흰/스티커/네온/핑크)을 담고 있다", () => {
    const byId = new Map(OUTLINE_PRESETS.map((p) => [p.id, p.value]));
    expect(byId.get("white")).toEqual({ color: "#ffffff", width: 8, opacity: 100 });
    expect(byId.get("black")).toEqual({ color: "#000000", width: 6, opacity: 100 });
    expect(byId.get("thick-white")).toEqual({ color: "#ffffff", width: 14, opacity: 100 });
    expect(byId.get("sticker")).toEqual({ color: "#ffffff", width: 10, opacity: 100 });
    expect(byId.get("neon")?.width).toBe(6);
    expect(byId.get("pink")?.width).toBe(6);
  });
});

describe("outlineCachePad", () => {
  it("활성(테두리 그려질 때)이면 ceil(width)", () => {
    expect(outlineCachePad(normalizeOutline({ width: 8 }))).toBe(8);
    expect(outlineCachePad(normalizeOutline({ width: 14 }))).toBe(14);
  });

  it("소수 width는 올림(테두리가 잘리지 않게 여유 확보)", () => {
    expect(outlineCachePad({ color: "#ffffff", width: 2.3, opacity: 100 })).toBe(3);
    expect(outlineCachePad({ color: "#ffffff", width: 0.1, opacity: 100 })).toBe(1);
  });

  it("항등(width0/opacity0)이면 0", () => {
    expect(outlineCachePad(DEFAULT_OUTLINE)).toBe(0);
    expect(outlineCachePad({ color: "#ffffff", width: 10, opacity: 0 })).toBe(0);
  });
});

describe("outlineKonvaFilter", () => {
  it("flat attrs(outlineColor/Width/Opacity)를 읽어 테두리를 그린다", () => {
    const img = makeBlockImage([200, 0, 0]);
    outlineKonvaFilter.call({ attrs: { outlineColor: "#00ff00", outlineWidth: 1, outlineOpacity: 100 } }, img);

    // applyOutline 직접 호출과 동일한 결과여야 한다.
    const ref = makeBlockImage([200, 0, 0]);
    applyOutline(ref, normalizeOutline({ color: "#00ff00", width: 1, opacity: 100 }));
    expect(Array.from(img.data)).toEqual(Array.from(ref.data));
    // 변 픽셀은 초록 테두리.
    expect(pixelAt(img, at(0, 1))).toEqual([0, 255, 0, 255]);
  });

  it("attrs가 비면 no-op(throw 없음)", () => {
    const img = makeBlockImage([200, 0, 0]);
    const before = Array.from(img.data);
    expect(() => outlineKonvaFilter.call({ attrs: {} }, img)).not.toThrow();
    expect(Array.from(img.data)).toEqual(before);
  });

  it("this.attrs 자체가 없어도 no-op", () => {
    const img = makeBlockImage([200, 0, 0]);
    const before = Array.from(img.data);
    expect(() => outlineKonvaFilter.call({}, img)).not.toThrow();
    expect(Array.from(img.data)).toEqual(before);
  });

  it("width0으로 정규화되는 attrs는 no-op", () => {
    const img = makeBlockImage([200, 0, 0]);
    const before = Array.from(img.data);
    outlineKonvaFilter.call({ attrs: { outlineColor: "#00ff00", outlineWidth: 0, outlineOpacity: 100 } }, img);
    expect(Array.from(img.data)).toEqual(before);
  });

  it("무효 attrs(숫자 아님/잘못된 색)는 안전하게 무시되어 no-op", () => {
    const img = makeBlockImage([200, 0, 0]);
    const before = Array.from(img.data);
    const attrs = { outlineColor: 123, outlineWidth: "x", outlineOpacity: Number.NaN };
    expect(() => outlineKonvaFilter.call({ attrs }, img)).not.toThrow();
    // width가 무효→0으로 정규화되어 항등 no-op.
    expect(Array.from(img.data)).toEqual(before);
  });
});

// 미사용 import 방지용 타입 참조.
const _typecheck: Outline = DEFAULT_OUTLINE;
void _typecheck;
