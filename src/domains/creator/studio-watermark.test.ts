import { describe, it, expect } from "vitest";

import {
  DEFAULT_WATERMARK,
  WATERMARK_POSITIONS,
  normalizeWatermark,
  shouldDrawWatermark,
  watermarkPlacement,
} from "./studio-watermark";

describe("normalizeWatermark", () => {
  it("객체 아니면 기본값", () => {
    expect(normalizeWatermark(null)).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark("x")).toEqual(DEFAULT_WATERMARK);
  });

  it("유효 값을 읽고 잘못된 값은 보정", () => {
    const w = normalizeWatermark({ enabled: true, text: "© 작가", position: "tl", opacity: 0.3, size: 0.04 });
    expect(w).toEqual({ enabled: true, text: "© 작가", position: "tl", opacity: 0.3, size: 0.04 });
  });

  it("잘못된 position은 br, opacity·size는 클램프", () => {
    const w = normalizeWatermark({ enabled: true, text: "a", position: "zzz", opacity: 9, size: 99 });
    expect(w.position).toBe("br");
    expect(w.opacity).toBe(1);
    expect(w.size).toBe(0.08);
  });

  it("텍스트는 60자로 자른다", () => {
    expect(normalizeWatermark({ text: "가".repeat(100) }).text).toHaveLength(60);
  });
});

describe("shouldDrawWatermark", () => {
  it("켜짐 + 텍스트 있어야 true", () => {
    expect(shouldDrawWatermark(DEFAULT_WATERMARK)).toBe(false);
    expect(shouldDrawWatermark({ ...DEFAULT_WATERMARK, enabled: true })).toBe(false); // 텍스트 없음
    expect(shouldDrawWatermark({ ...DEFAULT_WATERMARK, enabled: true, text: "  " })).toBe(false);
    expect(shouldDrawWatermark({ ...DEFAULT_WATERMARK, enabled: true, text: "©" })).toBe(true);
  });
});

describe("watermarkPlacement", () => {
  const s = { ...DEFAULT_WATERMARK, size: 0.03 };

  it("모든 위치 id에 대해 배치를 만든다", () => {
    for (const p of WATERMARK_POSITIONS) {
      const pl = watermarkPlacement(1000, 2000, { ...s, position: p.id });
      expect(Number.isFinite(pl.x)).toBe(true);
      expect(Number.isFinite(pl.y)).toBe(true);
      expect(pl.fontPx).toBeGreaterThan(0);
    }
  });

  it("오른쪽 아래(br)는 우측 하단·우정렬·하단기준", () => {
    const pl = watermarkPlacement(1000, 2000, { ...s, position: "br" });
    expect(pl.textAlign).toBe("right");
    expect(pl.textBaseline).toBe("bottom");
    expect(pl.x).toBe(1000 - pl.margin);
    expect(pl.y).toBe(2000 - pl.margin);
  });

  it("왼쪽 위(tl)는 좌상단·좌정렬·상단기준", () => {
    const pl = watermarkPlacement(1000, 2000, { ...s, position: "tl" });
    expect(pl.textAlign).toBe("left");
    expect(pl.textBaseline).toBe("top");
    expect(pl.x).toBe(pl.margin);
    expect(pl.y).toBe(pl.margin);
  });

  it("가운데는 중앙·가운데정렬", () => {
    const pl = watermarkPlacement(1000, 2000, { ...s, position: "center" });
    expect(pl).toMatchObject({ x: 500, y: 1000, textAlign: "center", textBaseline: "middle" });
  });

  it("fontPx는 폭×size, margin은 폭의 ~2.5%", () => {
    const pl = watermarkPlacement(1000, 2000, { ...s, size: 0.03 });
    expect(pl.fontPx).toBe(30);
    expect(pl.margin).toBe(25);
  });

  it("아주 작은 캔버스도 최소 글자/여백 보장", () => {
    const pl = watermarkPlacement(100, 100, { ...s, size: 0.02 });
    expect(pl.fontPx).toBeGreaterThanOrEqual(11);
    expect(pl.margin).toBeGreaterThanOrEqual(12);
  });
});
