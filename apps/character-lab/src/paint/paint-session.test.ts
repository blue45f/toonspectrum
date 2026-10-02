import { describe, expect, it } from "vitest";

import { DEFAULT_BRUSH } from "../contracts";
import { bytesEqual } from "../shared/typed-array";

import { readPixel } from "./paint-layer";
import { clampBrush, createPaintSession } from "./paint-session";

describe("createPaintSession", () => {
  it("브러시 패치는 범위를 클램프하고 잘못된 색은 무시한다", () => {
    const session = createPaintSession({ layerSize: 64 });
    session.setBrush({ radiusPx: 9999, opacity: 2, hardness: -1, color: "#ABCDEF" });
    expect(session.getState().brush).toEqual({ ...DEFAULT_BRUSH, radiusPx: 256, opacity: 1, hardness: 0, color: "#abcdef" });
    session.setBrush({ color: "nope", radiusPx: Number.NaN });
    expect(session.getState().brush.color).toBe("#abcdef");
    expect(session.getState().brush.radiusPx).toBe(256);
    expect(clampBrush(DEFAULT_BRUSH, { spacing: 0 }).spacing).toBe(0.02);
  });

  it("스트로크 시작~끝이 토큰 하나를 만들고 구독자에게 알린다", () => {
    const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1, color: "#ff0000" } });
    let notified = 0;
    const unsubscribe = session.subscribe(() => {
      notified += 1;
    });
    session.setActivePart("hair");
    session.beginStroke({ u: 0.3, v: 0.5, pressure: 1 });
    expect(session.getState().strokeActive).toBe(true);
    // 0.3 → 0.7은 랩 최단 경로도 정방향이라 중앙(0.5)을 지난다.
    session.extendStroke({ u: 0.7, v: 0.5, pressure: 1 });
    const token = session.endStroke();
    expect(token?.part).toBe("hair");
    expect(token?.tiles.length).toBe(1);
    expect(session.getState().strokeActive).toBe(false);
    expect(session.endStroke()).toBeNull();
    expect(notified).toBeGreaterThanOrEqual(4);
    unsubscribe();

    const layer = session.layer("hair");
    expect(readPixel(layer, 32, 32)).toEqual([255, 0, 0, 255]);
    const inverse = session.applyToken(token ?? { part: "hair", tiles: [], tileSize: 64 });
    expect(readPixel(layer, 32, 32)[3]).toBe(0);
    expect(inverse && session.applyToken(inverse)).not.toBeNull();
    expect(readPixel(layer, 32, 32)[3]).toBe(255);
    expect(session.applyToken({ part: "shoes", tiles: [], tileSize: 64 })).toBeNull();
  });

  it("페인트 불가 부위는 거부한다", () => {
    const session = createPaintSession();
    expect(() => session.setActivePart("eyeball")).toThrow(/페인트할 수 없습니다/u);
  });

  it("replaceLayers는 복사본을 보관하고 clearLayer는 비운다", () => {
    const session = createPaintSession({ layerSize: 16 });
    const source = session.layer("skin");
    source.rgba.fill(200);
    const other = createPaintSession({ layerSize: 16 });
    other.replaceLayers(session.layersForExport());
    const copy = other.layer("skin");
    expect(copy).not.toBe(source);
    expect(bytesEqual(copy.rgba, source.rgba)).toBe(true);
    const token = other.clearLayer("skin");
    expect(copy.rgba.every((b) => b === 0)).toBe(true);
    expect(copy.revision).toBe(1);
    expect(token?.tiles.length).toBe(1);
    expect(other.clearLayer("skin")).toBeNull();
    expect(other.clearLayer("hair")).toBeNull();
    expect(other.layersForExport()).toHaveLength(1);
    other.applyToken(token ?? { part: "skin", tiles: [], tileSize: 64 });
    expect(bytesEqual(copy.rgba, source.rgba)).toBe(true);
  });
});
