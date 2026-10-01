import { describe, expect, it } from "vitest";

import { bytesEqual } from "../shared/typed-array";

import { clientToNdc, createPaintUndoHandler, createPointerPaintDriver, normalizePointerPressure } from "./paint-bridge";
import { readPixel } from "./paint-layer";
import { createPaintSession } from "./paint-session";

import type { PaintLayer, PaintUndoToken, PartRole, PickHit } from "../contracts";

const BRUSH = { radiusPx: 3, hardness: 1, opacity: 1, color: "#ff0000", spacing: 0.5 };

/** NDC [-1,1] → UV [0,1] 선형 매핑. `roleAt`이 null이면 빈 공간. */
function linearPick(roleAt: (u: number, v: number) => PartRole | null): (ndcX: number, ndcY: number) => PickHit | null {
  return (ndcX, ndcY) => {
    const u = (ndcX + 1) / 2;
    const v = (1 - ndcY) / 2;
    const role = roleAt(u, v);
    if (!role) return null;
    return { partId: 1, role, uv: [u, v], worldPosition: [0, 0, 0], worldNormal: [0, 0, 1], distance: 1 };
  };
}

function harness(roleAt: (u: number, v: number) => PartRole | null) {
  const session = createPaintSession({ layerSize: 64, brush: BRUSH });
  const uploads: PaintLayer[] = [];
  const commits: PaintUndoToken[] = [];
  const driver = createPointerPaintDriver(session, { pick: linearPick(roleAt), upload: (layer) => uploads.push(layer), commit: (token) => commits.push(token) });
  return { session, uploads, commits, driver };
}

describe("createPaintUndoHandler", () => {
  it("토큰을 적용해 역토큰을 돌려주고 레이어를 업로드한다; 레이어가 없으면 undefined", () => {
    const session = createPaintSession({ layerSize: 64, brush: BRUSH });
    const uploads: PaintLayer[] = [];
    const handler = createPaintUndoHandler(session, (layer) => uploads.push(layer));
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    const token = session.endStroke();
    if (!token) throw new Error("토큰 없음");
    const layer = session.layer("skin");
    expect(readPixel(layer, 32, 32)[3]).toBe(255);

    const redo = handler(token, "undo");
    expect(redo).toBeDefined();
    expect(readPixel(layer, 32, 32)[3]).toBe(0);
    expect(uploads).toEqual([layer]);

    const undoAgain = redo ? handler(redo, "redo") : undefined;
    expect(undoAgain).toBeDefined();
    expect(readPixel(layer, 32, 32)[3]).toBe(255);
    expect(uploads).toHaveLength(2);

    expect(handler({ part: "hair", tiles: [], tileSize: 64 }, "undo")).toBeUndefined();
    expect(uploads).toHaveLength(2);
  });
});

describe("createPointerPaintDriver", () => {
  it("down→move→up은 토큰 하나를 commit하고 undo하면 바이트가 원복된다", () => {
    const { session, uploads, commits, driver } = harness(() => "skin");
    const layer = session.layer("skin");
    const original = new Uint8ClampedArray(layer.rgba);
    expect(driver.down({ ndcX: -0.5, ndcY: 0, pressure: 1 })).toBe(true);
    expect(driver.active).toBe(true);
    expect(driver.touching).toBe(true);
    const added = driver.move({ ndcX: 0, ndcY: 0, pressure: 1 }) + driver.move({ ndcX: 0.5, ndcY: 0, pressure: 1 });
    expect(added).toBeGreaterThan(10);
    expect(driver.dabCount).toBe(added + 1);
    expect(readPixel(layer, 32, 32)[3]).toBe(255);
    expect(uploads.length).toBeGreaterThanOrEqual(3);
    expect(uploads.every((u) => u === layer)).toBe(true);

    const token = driver.up();
    expect(driver.active).toBe(false);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toBe(token);
    expect(token?.part).toBe("skin");
    expect(session.getState().strokeActive).toBe(false);

    session.applyToken(token ?? { part: "skin", tiles: [], tileSize: 64 });
    expect(bytesEqual(layer.rgba, original)).toBe(true);
    expect(driver.up()).toBeNull();
    expect(commits).toHaveLength(1);
  });

  it("빈 공간·다른 부위를 지나면 세그먼트를 끊어 가로지르는 선이 없고 토큰은 하나다", () => {
    // 가운데 세로 띠(u 0.4..0.6)는 헤어, 나머지는 피부.
    const { session, commits, driver } = harness((u) => (u > 0.4 && u < 0.6 ? "hair" : "skin"));
    const layer = session.layer("skin");
    const original = new Uint8ClampedArray(layer.rgba);
    driver.down({ ndcX: -0.8, ndcY: 0, pressure: 1 });
    driver.move({ ndcX: -0.5, ndcY: 0, pressure: 1 });
    expect(driver.move({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(0);
    expect(driver.touching).toBe(false);
    expect(driver.active).toBe(true);
    driver.move({ ndcX: 0.5, ndcY: 0, pressure: 1 });
    expect(driver.touching).toBe(true);
    driver.move({ ndcX: 0.8, ndcY: 0, pressure: 1 });
    const token = driver.up();
    expect(commits).toHaveLength(1);
    // 띠 중앙(u=0.5 → x=32)은 칠해지지 않았고 양쪽은 칠해졌다.
    expect(readPixel(layer, 32, 32)[3]).toBe(0);
    expect(readPixel(layer, 10, 32)[3]).toBe(255);
    expect(readPixel(layer, 54, 32)[3]).toBe(255);
    expect(session.layersForExport().map((l) => l.part)).toEqual(["skin"]);
    const keys = (token?.tiles ?? []).map((t) => `${t.x},${t.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    // 두 세그먼트가 병합된 토큰 하나로 양쪽 모두 원복된다(64×64 레이어는 타일이 1개라 타일 수로는 구분할 수 없다).
    session.applyToken(token ?? { part: "skin", tiles: [], tileSize: 64 });
    expect(bytesEqual(layer.rgba, original)).toBe(true);
  });

  it("활성 부위가 아니거나 pick이 null이면 칠하지 않고 up은 null·commit 없음", () => {
    const { session, uploads, commits, driver } = harness(() => "hair");
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(false);
    expect(driver.move({ ndcX: 0.1, ndcY: 0, pressure: 1 })).toBe(0);
    expect(driver.up()).toBeNull();
    expect(commits).toHaveLength(0);
    expect(uploads).toHaveLength(0);
    expect(session.layersForExport()).toHaveLength(0);

    const none = harness(() => null);
    none.driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    expect(none.driver.up()).toBeNull();
    expect(none.driver.move({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(0);

    // 활성 부위를 바꾸면 그 부위에 칠한다.
    session.setActivePart("hair");
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(true);
    expect(driver.up()?.part).toBe("hair");
  });

  it("cancel은 되돌리고 업로드하되 commit하지 않으며, down 중 재-down은 이전 스트로크를 commit한다", () => {
    const { session, uploads, commits, driver } = harness(() => "skin");
    const layer = session.layer("skin");
    const original = new Uint8ClampedArray(layer.rgba);
    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.move({ ndcX: 0.3, ndcY: 0, pressure: 1 });
    expect(readPixel(layer, 32, 32)[3]).toBe(255);
    const uploadsBefore = uploads.length;
    driver.cancel();
    expect(commits).toHaveLength(0);
    expect(bytesEqual(layer.rgba, original)).toBe(true);
    expect(uploads.length).toBe(uploadsBefore + 1);
    expect(driver.active).toBe(false);
    driver.cancel();

    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.down({ ndcX: 0.5, ndcY: 0.5, pressure: 1 });
    expect(commits).toHaveLength(1);
    expect(driver.active).toBe(true);
    driver.up();
    expect(commits).toHaveLength(2);
  });

  it("압력은 dab 알파에 반영된다", () => {
    const { session, driver } = harness(() => "skin");
    driver.down({ ndcX: 0, ndcY: 0, pressure: 0.5 });
    driver.up();
    expect(readPixel(session.layer("skin"), 32, 32)[3]).toBe(Math.round(0.5 * 255));
  });
});

describe("clientToNdc / normalizePointerPressure", () => {
  it("클라이언트 좌표를 NDC(y 위쪽 양수)로 바꾸고 크기 0이면 null", () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    expect(clientToNdc(10, 20, rect)).toEqual([-1, 1]);
    expect(clientToNdc(210, 120, rect)).toEqual([1, -1]);
    expect(clientToNdc(110, 70, rect)).toEqual([0, 0]);
    expect(clientToNdc(0, 0, { left: 0, top: 0, width: 0, height: 10 })).toBeNull();
  });

  it("펜은 압력을 클램프하고 마우스·터치는 1이다", () => {
    expect(normalizePointerPressure({ pointerType: "pen", pressure: 0.3 })).toBe(0.3);
    expect(normalizePointerPressure({ pointerType: "pen", pressure: 2 })).toBe(1);
    expect(normalizePointerPressure({ pointerType: "pen", pressure: Number.NaN })).toBe(0);
    expect(normalizePointerPressure({ pointerType: "mouse", pressure: 0.5 })).toBe(1);
    expect(normalizePointerPressure({ pointerType: "touch", pressure: 0 })).toBe(1);
  });
});
