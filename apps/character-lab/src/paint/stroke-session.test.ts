import { describe, expect, it } from "vitest";

import { bytesEqual } from "../shared/typed-array";

import { applyUndoToken, createPaintLayer, readPixel } from "./paint-layer";
import { createStrokeSession } from "./stroke-session";

import type { BrushSettings } from "../contracts";

const BRUSH: BrushSettings = { radiusPx: 6, color: "#336699", opacity: 1, hardness: 1, spacing: 0.5 };

describe("createStrokeSession", () => {
  it("1 스트로크 = 1 토큰이며 undo 후 바이트가 같다", () => {
    const layer = createPaintLayer("skin", 256, 256);
    const original = new Uint8ClampedArray(layer.rgba);
    const session = createStrokeSession(layer, BRUSH);
    session.begin({ u: 0.1, v: 0.5, pressure: 1 });
    const added = session.extend({ u: 0.4, v: 0.5, pressure: 1 }) + session.extend({ u: 0.7, v: 0.5, pressure: 1 }) + session.extend({ u: 0.7, v: 0.8, pressure: 1 });
    expect(added).toBeGreaterThan(10);
    expect(session.dabCount).toBe(added + 1);
    expect(readPixel(layer, 128, 128)[3]).toBe(255);

    const token = session.end();
    expect(session.ended).toBe(true);
    const keys = token.tiles.map((t) => `${t.x},${t.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(token.tiles.length).toBeGreaterThan(3);
    expect(token.tiles.length).toBeLessThan(16);

    applyUndoToken(layer, token);
    expect(bytesEqual(layer.rgba, original)).toBe(true);
  });

  it("끝난 세션은 더 쓸 수 없고 begin은 한 번만 허용한다", () => {
    const layer = createPaintLayer("skin", 64, 64);
    const session = createStrokeSession(layer, BRUSH);
    session.begin({ u: 0.5, v: 0.5, pressure: 1 });
    expect(() => session.begin({ u: 0.5, v: 0.5, pressure: 1 })).toThrow(/한 번/u);
    session.end();
    expect(() => session.extend({ u: 0.6, v: 0.5, pressure: 1 })).toThrow(/끝난/u);
    expect(() => session.end()).toThrow(/한 번/u);
  });

  it("begin 없이 extend하면 첫 dab으로 시작한다", () => {
    const layer = createPaintLayer("hair", 64, 64);
    const session = createStrokeSession(layer, BRUSH);
    expect(session.extend({ u: 0.5, v: 0.5, pressure: 1 })).toBe(1);
    expect(session.dabCount).toBe(1);
  });
});
