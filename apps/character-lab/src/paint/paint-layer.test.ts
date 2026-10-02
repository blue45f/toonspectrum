import { describe, expect, it } from "vitest";

import { DEFAULT_BRUSH, PAINT_TILE_SIZE } from "../contracts";
import { bytesEqual } from "../shared/typed-array";

import {
  applyUndoToken,
  createPaintLayer,
  createTileSnapshotSet,
  dabMask,
  isPaintLayerEmpty,
  mergeUndoTokens,
  readPixel,
  stampDab,
  toUndoToken,
  wrapUnit,
} from "./paint-layer";

import type { BrushSettings } from "../contracts";

const OPAQUE_HARD: BrushSettings = { radiusPx: 8, color: "#ff0000", opacity: 1, hardness: 1, spacing: 0.25 };

describe("dabMask", () => {
  it("하드 엣지(경도 1)는 반지름 안 1, 반지름+0.5px 밖 0이다", () => {
    expect(dabMask(0, 10, 1)).toBe(1);
    expect(dabMask(9.5, 10, 1)).toBe(1);
    expect(dabMask(10.5, 10, 1)).toBe(0);
    expect(dabMask(11, 10, 1)).toBe(0);
  });

  it("가우시안(경도 0)은 중심 1, 단조 감소, 반지름에서 0이다", () => {
    expect(dabMask(0, 10, 0)).toBeCloseTo(1, 10);
    let previous = 1;
    for (let d = 1; d <= 10; d += 1) {
      const value = dabMask(d, 10, 0);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
    expect(dabMask(10, 10, 0)).toBe(0);
    expect(dabMask(5, 10, 0)).toBeCloseTo((Math.exp(-4.5 * 0.25) - Math.exp(-4.5)) / (1 - Math.exp(-4.5)), 10);
  });

  it("중간 경도는 반지름×경도 안쪽이 평탄하다", () => {
    expect(dabMask(5, 10, 0.6)).toBe(1);
    expect(dabMask(6, 10, 0.6)).toBe(1);
    expect(dabMask(8, 10, 0.6)).toBeLessThan(1);
    expect(dabMask(8, 10, 0.6)).toBeGreaterThan(0);
  });
});

describe("stampDab", () => {
  it("dab 중심 알파 = opacity × pressure이고 색은 브러시 색이다", () => {
    const layer = createPaintLayer("skin", 64, 64);
    const brush: BrushSettings = { ...DEFAULT_BRUSH, color: "#1e90ff", opacity: 0.8, hardness: 1, radiusPx: 6 };
    stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, brush);
    const [r, g, b, a] = readPixel(layer, 32, 32);
    expect(a).toBe(Math.round(0.8 * 255));
    expect([r, g, b]).toEqual([0x1e, 0x90, 0xff]);
    expect(layer.revision).toBe(1);

    const half = createPaintLayer("skin", 64, 64);
    stampDab(half, { u: 0.5, v: 0.5, pressure: 0.5 }, brush);
    expect(readPixel(half, 32, 32)[3]).toBe(Math.round(0.4 * 255));
  });

  it("빈 레이어 위의 불투명 dab은 정확히 브러시 색이 된다(선형 합성 왕복)", () => {
    const layer = createPaintLayer("hair", 32, 32);
    stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, color: "#7a3b10" });
    expect(readPixel(layer, 16, 16)).toEqual([0x7a, 0x3b, 0x10, 255]);
  });

  it("경도 1은 반지름 밖을 건드리지 않고 경도 0은 가장자리로 갈수록 알파가 줄어든다", () => {
    const hard = createPaintLayer("skin", 64, 64);
    stampDab(hard, { u: 0.5, v: 0.5, pressure: 1 }, OPAQUE_HARD);
    expect(readPixel(hard, 32 + 6, 32)[3]).toBe(255);
    expect(readPixel(hard, 32 + 10, 32)[3]).toBe(0);
    expect(readPixel(hard, 32, 32 - 10)[3]).toBe(0);

    // 픽셀 중심(32.5, 32.5)에 dab 중심을 맞춘다.
    const soft = createPaintLayer("skin", 64, 64);
    stampDab(soft, { u: 32.5 / 64, v: 32.5 / 64, pressure: 1 }, { ...OPAQUE_HARD, hardness: 0 });
    const center = readPixel(soft, 32, 32)[3];
    const mid = readPixel(soft, 32 + 4, 32)[3];
    const edge = readPixel(soft, 32 + 7, 32)[3];
    expect(center).toBe(255);
    expect(mid).toBeLessThan(center);
    expect(edge).toBeLessThan(mid);
    expect(edge).toBeGreaterThan(0);
    expect(readPixel(soft, 32 + 8, 32)[3]).toBe(0);
  });

  it("선형 공간 source-over: 흰 바탕에 50% 검정은 sRGB 중간 회색(≈188)이 된다", () => {
    const layer = createPaintLayer("skin", 16, 16);
    stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, color: "#ffffff", radiusPx: 20 });
    stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, color: "#000000", opacity: 0.5, radiusPx: 20 });
    const [r, , , a] = readPixel(layer, 8, 8);
    expect(a).toBe(255);
    // 선형 0.5 → sRGB 0.735 → 188 (감마 무시 합성이면 128)
    expect(r).toBeGreaterThanOrEqual(186);
    expect(r).toBeLessThanOrEqual(190);
  });

  it("UV 랩: u=0 근처 dab이 반대편 열에도 칠해진다", () => {
    const layer = createPaintLayer("top", 64, 64);
    stampDab(layer, { u: 0, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, radiusPx: 4 });
    expect(readPixel(layer, 0, 32)[3]).toBe(255);
    expect(readPixel(layer, 63, 32)[3]).toBe(255);
    expect(readPixel(layer, 32, 32)[3]).toBe(0);

    const clamped = createPaintLayer("top", 64, 64);
    stampDab(clamped, { u: 0, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, radiusPx: 4 }, { wrap: false });
    expect(readPixel(clamped, 0, 32)[3]).toBe(255);
    expect(readPixel(clamped, 63, 32)[3]).toBe(0);
  });

  it("wrapUnit은 [0,1) 범위로 감는다", () => {
    expect(wrapUnit(1)).toBe(0);
    expect(wrapUnit(-0.25)).toBe(0.75);
    expect(wrapUnit(1.5)).toBe(0.5);
    expect(wrapUnit(0.999)).toBe(0.999);
  });

  it("잘못된 색은 throw한다", () => {
    const layer = createPaintLayer("skin", 8, 8);
    expect(() => stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, color: "red" })).toThrow(/#rrggbb/u);
  });
});

describe("undo 토큰", () => {
  it("dab 하나는 건드린 타일만 담은 토큰을 돌려주고 적용하면 바이트가 같아진다", () => {
    const layer = createPaintLayer("skin", 128, 128);
    stampDab(layer, { u: 0.1, v: 0.1, pressure: 1 }, OPAQUE_HARD);
    const original = new Uint8ClampedArray(layer.rgba);
    const token = stampDab(layer, { u: 0.49, v: 0.49, pressure: 1 }, OPAQUE_HARD);
    expect(token.tileSize).toBe(PAINT_TILE_SIZE);
    expect(token.part).toBe("skin");
    // 중심 (62.7, 62.7) 반지름 8 → 4개 타일 경계에 걸친다.
    expect(token.tiles.map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [64, 0],
      [0, 64],
      [64, 64],
    ]);
    for (const tile of token.tiles) expect(tile.data.length).toBe(64 * 64 * 4);
    expect(bytesEqual(layer.rgba, original)).toBe(false);

    const redo = applyUndoToken(layer, token);
    expect(bytesEqual(layer.rgba, original)).toBe(true);
    expect(layer.revision).toBe(3);

    applyUndoToken(layer, redo);
    expect(readPixel(layer, 62, 62)[3]).toBe(255);
  });

  it("가장자리 타일은 잘린 크기다", () => {
    const layer = createPaintLayer("skin", 96, 80);
    const token = stampDab(layer, { u: 0.95, v: 0.95, pressure: 1 }, OPAQUE_HARD);
    const edge = token.tiles.find((t) => t.x === 64 && t.y === 64);
    expect(edge).toBeDefined();
    expect(edge?.data.length).toBe(32 * 16 * 4);
    expect(() => applyUndoToken(layer, token)).not.toThrow();
  });

  it("공유 스냅샷은 같은 타일을 한 번만 저장하고 병합 토큰은 첫 상태를 우선한다", () => {
    const layer = createPaintLayer("skin", 64, 64);
    const original = new Uint8ClampedArray(layer.rgba);
    const snapshots = createTileSnapshotSet(layer);
    const first = stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, OPAQUE_HARD, { snapshots });
    const second = stampDab(layer, { u: 0.55, v: 0.5, pressure: 1 }, OPAQUE_HARD, { snapshots });
    expect(first.tiles).toHaveLength(1);
    expect(second.tiles).toHaveLength(0);
    const merged = toUndoToken(snapshots);
    expect(merged.tiles).toHaveLength(1);
    applyUndoToken(layer, merged);
    expect(bytesEqual(layer.rgba, original)).toBe(true);

    const a = stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, OPAQUE_HARD);
    const b = stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, color: "#00ff00" });
    const mergedAb = mergeUndoTokens([a, b]);
    expect(mergedAb?.tiles).toHaveLength(1);
    expect(mergedAb && bytesEqual(mergedAb.tiles[0]?.data ?? [], a.tiles[0]?.data ?? [1])).toBe(true);
    expect(mergeUndoTokens([])).toBeNull();
  });

  it("부위가 다른 토큰은 적용·병합할 수 없다", () => {
    const skin = createPaintLayer("skin", 64, 64);
    const hair = createPaintLayer("hair", 64, 64);
    const token = stampDab(hair, { u: 0.5, v: 0.5, pressure: 1 }, OPAQUE_HARD);
    expect(() => applyUndoToken(skin, token)).toThrow(/부위/u);
    const skinToken = stampDab(skin, { u: 0.5, v: 0.5, pressure: 1 }, OPAQUE_HARD);
    expect(() => mergeUndoTokens([token, skinToken])).toThrow(/부위/u);
  });

  it("isPaintLayerEmpty는 alpha>0 픽셀 유무로 판단한다", () => {
    const layer = createPaintLayer("skin", 8, 8);
    expect(isPaintLayerEmpty(layer)).toBe(true);
    stampDab(layer, { u: 0.5, v: 0.5, pressure: 1 }, { ...OPAQUE_HARD, radiusPx: 1 });
    expect(isPaintLayerEmpty(layer)).toBe(false);
  });
});
