/**
 * 투영 페인트 드라이버: 실제 paint 세션·레이어 + 가짜 투영 포트. 투영(GPU)은 가짜지만 **overlay를 PaintLayer에 합성하고 스트로크당 undo 토큰 1개를 만드는
 * 경로**는 실제 코드다. 결과가 CPU 스탬프 경로와 같은 `PaintLayer` RGBA이고 undo 토큰이 같은 계약임을 확인한다.
 */
import { describe, expect, it } from "vitest";

import { PAINT_TILE_SIZE } from "../../../contracts";
import { createPointerPaintDriver } from "../../../paint/paint-bridge";
import { compositePixelLinear, readPixel } from "../../../paint/paint-layer";
import { createPaintSession } from "../../../paint/paint-session";
import { bytesEqual } from "../../../shared/typed-array";

import { brushBitmapFor, compositeOverlayTiles, createProjectionStrokeDriver, createSwitchingPaintDriver, MAX_STAMPS_PER_MOVE } from "./projection-paint-driver";

import type { PaintLayer, PaintUndoToken, PartRole, PickHit } from "../../../contracts";
import type { ProjectionBrushBitmap, ProjectionOverlay, ProjectionPaintPort } from "../../../render/projection-paint";

const BRUSH = { radiusPx: 4, hardness: 1, opacity: 1, color: "#ff0000", spacing: 0.5 };
const LAYER = 128;

interface FakePortOptions {
  /** `flush()`가 돌려줄 overlay를 만든다(기본: 스탬프 위치마다 premultiplied 빨강 원) */
  readonly overlay?: (stamps: ReadonlyArray<{ x: number; y: number }>, width: number, height: number) => ProjectionOverlay | null;
  readonly hit?: (x: number, y: number) => boolean;
  readonly screenSizeNdc?: readonly [number, number];
}

interface FakePort extends ProjectionPaintPort {
  readonly calls: { begin: number; stamps: Array<{ x: number; y: number }>; flush: number; cancel: number; brushes: ProjectionBrushBitmap[] };
  resolveFlush(): void;
}

/** 가짜 투영 포트. `deferred`면 flush가 `resolveFlush()`를 부를 때까지 끝나지 않는다. */
function fakePort(part: PartRole, options: FakePortOptions = {}, deferred = false): FakePort {
  const calls = { begin: 0, stamps: [] as Array<{ x: number; y: number }>, flush: 0, cancel: 0, brushes: [] as ProjectionBrushBitmap[] };
  let width = 0;
  let height = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    calls,
    resolveFlush: () => release(),
    begin: (_part, w, h) => {
      calls.begin += 1;
      width = w;
      height = h;
      calls.stamps.length = 0;
      return true;
    },
    setBrush: (bitmap) => {
      calls.brushes.push(bitmap);
    },
    stamp: (x, y) => {
      if (options.hit && !options.hit(x, y)) return { hit: false, worldSizeM: 0, screenSizeNdc: [0, 0] };
      calls.stamps.push({ x, y });
      return { hit: true, worldSizeM: 0.03, screenSizeNdc: options.screenSizeNdc ?? [0.1, 0.1] };
    },
    flush: async () => {
      calls.flush += 1;
      if (deferred) await gate;
      if (options.overlay) return options.overlay(calls.stamps, width, height);
      return redCircles(part, calls.stamps, width, height);
    },
    cancel: () => {
      calls.cancel += 1;
    },
  };
}

/** NDC → 레이어 픽셀 선형 매핑으로 premultiplied 빨강 원을 찍은 overlay */
function redCircles(part: PartRole, stamps: ReadonlyArray<{ x: number; y: number }>, width: number, height: number, radius = 4, alpha = 255): ProjectionOverlay {
  const rgba = new Uint8Array(width * height * 4);
  for (const stamp of stamps) {
    const cx = ((stamp.x + 1) / 2) * width;
    const cy = ((1 - stamp.y) / 2) * height;
    for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
      for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) continue;
        rgba.set([alpha, 0, 0, alpha], (y * width + x) * 4);
      }
    }
  }
  return { part, width, height, rgba };
}

function harness(port: FakePort, part: PartRole = "skin") {
  const session = createPaintSession({ layerSize: LAYER, brush: BRUSH, activePart: part });
  const uploads: PaintLayer[] = [];
  const commits: PaintUndoToken[] = [];
  const notices: Array<string | null> = [];
  const shared = { finalizing: false };
  const driver = createProjectionStrokeDriver(session, port, { upload: (layer) => uploads.push(layer), commit: (token) => commits.push(token), notify: (message) => notices.push(message) }, shared);
  return { session, uploads, commits, notices, shared, driver };
}

/** 마이크로태스크가 비워질 때까지 기다린다(flush 뒤 반영) */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("brushBitmapFor", () => {
  it("premultiplied sRGB 원: 가운데는 색×강도, 모서리는 투명, 크기는 8~64로 제한된다", () => {
    const bitmap = brushBitmapFor({ ...BRUSH, radiusPx: 6, opacity: 0.5 }, 1);
    expect(bitmap.size).toBe(14);
    expect(bitmap.rgba).toHaveLength(14 * 14 * 4);
    const center = (7 * 14 + 7) * 4;
    expect([...bitmap.rgba.subarray(center, center + 4)]).toEqual([128, 0, 0, 128]);
    expect([...bitmap.rgba.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(brushBitmapFor({ ...BRUSH, radiusPx: 0.5 }, 1).size).toBe(8);
    expect(brushBitmapFor({ ...BRUSH, radiusPx: 200 }, 1).size).toBe(64);
  });

  it("압력은 강도에 곱해지고 키가 달라진다; 소프트 브러시는 가장자리가 투명으로 감쇠한다", () => {
    const full = brushBitmapFor(BRUSH, 1);
    const half = brushBitmapFor(BRUSH, 0.5);
    expect(half.key).not.toBe(full.key);
    const center = (Math.floor(full.size / 2) * full.size + Math.floor(full.size / 2)) * 4;
    expect(half.rgba[center + 3]).toBe(128);
    const soft = brushBitmapFor({ ...BRUSH, radiusPx: 8, hardness: 0 }, 1);
    const mid = Math.floor(soft.size / 2);
    const edge = (mid * soft.size + 1) * 4;
    expect(soft.rgba[edge + 3]).toBeLessThan((soft.rgba[(mid * soft.size + mid) * 4 + 3] ?? 0));
  });

  it("잘못된 색은 한글 오류", () => {
    expect(() => brushBitmapFor({ ...BRUSH, color: "red" }, 1)).toThrow("#rrggbb");
  });
});

describe("compositeOverlayTiles", () => {
  it("빈 레이어 위: 불투명 overlay는 straight 색·알파 그대로(CPU 경로와 같은 RGBA)이고 칠한 타일만 담는다", () => {
    const session = createPaintSession({ layerSize: LAYER, brush: BRUSH });
    const layer = session.layer("skin");
    const overlay = redCircles("skin", [{ x: -0.5, y: 0.5 }], LAYER, LAYER, 3);
    const token = compositeOverlayTiles(layer, overlay);
    expect(token).not.toBeNull();
    expect(token?.tiles).toHaveLength(1);
    const tile = token?.tiles[0];
    expect(tile?.x).toBe(0);
    expect(tile?.y).toBe(0);
    // (-0.5, 0.5) → 레이어 (32, 32) → 타일 (0,0)의 (32,32)
    expect([...(tile?.data.subarray((32 * PAINT_TILE_SIZE + 32) * 4, (32 * PAINT_TILE_SIZE + 32) * 4 + 4) ?? [])]).toEqual([255, 0, 0, 255]);
    // 합성 전에는 레이어를 건드리지 않는다
    expect(readPixel(layer, 32, 32)[3]).toBe(0);
  });

  it("반투명 overlay를 기존 색 위에 얹으면 CPU 경로와 같은 선형 source-over다", () => {
    const session = createPaintSession({ layerSize: LAYER, brush: { ...BRUSH, color: "#0000ff" } });
    session.beginStroke({ u: 0.25, v: 0.25, pressure: 1 });
    session.endStroke();
    const layer = session.layer("skin");
    const before = readPixel(layer, 32, 32);
    expect(before).toEqual([0, 0, 255, 255]);
    const overlay = redCircles("skin", [{ x: -0.5, y: 0.5 }], LAYER, LAYER, 3, 128);
    const token = compositeOverlayTiles(layer, overlay);
    const index = (32 * PAINT_TILE_SIZE + 32) * 4;
    const expected = new Uint8ClampedArray(before);
    compositePixelLinear(expected, 0, [1, 0, 0], 128 / 255);
    const actual = token?.tiles[0]?.data.subarray(index, index + 4) ?? new Uint8ClampedArray(4);
    for (let c = 0; c < 4; c += 1) expect(Math.abs((actual[c] ?? 0) - (expected[c] ?? 0))).toBeLessThanOrEqual(1);
  });

  it("칠한 것이 없으면 null, 부위·크기가 다르면 한글 오류", () => {
    const session = createPaintSession({ layerSize: LAYER, brush: BRUSH });
    const layer = session.layer("skin");
    expect(compositeOverlayTiles(layer, { part: "skin", width: LAYER, height: LAYER, rgba: new Uint8Array(LAYER * LAYER * 4) })).toBeNull();
    expect(() => compositeOverlayTiles(layer, { part: "hair", width: LAYER, height: LAYER, rgba: new Uint8Array(LAYER * LAYER * 4) })).toThrow("부위");
    expect(() => compositeOverlayTiles(layer, { part: "skin", width: 64, height: 64, rgba: new Uint8Array(64 * 64 * 4).fill(255) })).toThrow("크기");
  });

  it("타일 경계를 가로지르는 overlay는 걸친 타일을 모두 담는다", () => {
    const session = createPaintSession({ layerSize: LAYER, brush: BRUSH });
    const layer = session.layer("skin");
    const overlay = redCircles("skin", [{ x: 0, y: 0 }], LAYER, LAYER, 5);
    const token = compositeOverlayTiles(layer, overlay);
    expect(token?.tiles.map((tile) => `${tile.x},${tile.y}`).sort()).toEqual(["0,0", "0,64", "64,0", "64,64"]);
  });
});

describe("투영 스트로크 드라이버", () => {
  it("down→move→up: 스트로크 하나가 레이어에 반영되고 undo 토큰이 정확히 1개 commit된다", async () => {
    const port = fakePort("skin");
    const { session, uploads, commits, driver } = harness(port);
    expect(driver.down({ ndcX: -0.5, ndcY: 0.5, pressure: 1 })).toBe(true);
    expect(driver.active).toBe(true);
    expect(driver.move({ ndcX: -0.4, ndcY: 0.5, pressure: 1 })).toBeGreaterThan(0);
    expect(driver.up()).toBeNull(); // 반영은 비동기
    expect(driver.active).toBe(false);
    await settle();
    expect(port.calls.flush).toBe(1);
    expect(commits).toHaveLength(1);
    expect(uploads).toHaveLength(1);
    const layer = session.layer("skin");
    expect(readPixel(layer, 32, 32)).toEqual([255, 0, 0, 255]);
    expect(commits[0]?.part).toBe("skin");
  });

  it("commit된 토큰을 적용하면 레이어가 칠하기 전 바이트로 돌아가고 역토큰으로 redo하면 다시 칠해진다", async () => {
    const port = fakePort("skin");
    const { session, commits, driver } = harness(port);
    const before = new Uint8ClampedArray(session.layer("skin").rgba);
    driver.down({ ndcX: -0.5, ndcY: 0.5, pressure: 1 });
    driver.up();
    await settle();
    const painted = new Uint8ClampedArray(session.layer("skin").rgba);
    expect(bytesEqual(painted, before)).toBe(false);
    const token = commits[0];
    if (!token) throw new Error("토큰 없음");
    const redo = session.applyToken(token);
    expect(bytesEqual(session.layer("skin").rgba, before)).toBe(true);
    if (!redo) throw new Error("역토큰 없음");
    session.applyToken(redo);
    expect(bytesEqual(session.layer("skin").rgba, painted)).toBe(true);
  });

  it("CPU 스탬프 경로와 같은 계약: 같은 부위에 칠하면 토큰의 부위·타일 크기가 같다", async () => {
    const port = fakePort("skin");
    const { commits, driver } = harness(port);
    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.up();
    await settle();
    const cpuSession = createPaintSession({ layerSize: LAYER, brush: BRUSH });
    const cpuCommits: PaintUndoToken[] = [];
    const cpu = createPointerPaintDriver(cpuSession, {
      pick: (x, y): PickHit => ({ partId: 1, role: "skin", uv: [(x + 1) / 2, (1 - y) / 2], worldPosition: [0, 0, 0], worldNormal: [0, 0, 1], distance: 1 }),
      upload: () => undefined,
      commit: (token) => cpuCommits.push(token),
    });
    cpu.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    cpu.up();
    expect(commits[0]?.tileSize).toBe(cpuCommits[0]?.tileSize);
    expect(commits[0]?.part).toBe(cpuCommits[0]?.part);
  });

  it("이동 거리를 브러시 크기×간격으로 나눠 보간하고 한 번에 상한을 넘지 않는다", () => {
    const port = fakePort("skin", { screenSizeNdc: [0.1, 0.1] });
    const { driver } = harness(port);
    driver.down({ ndcX: -0.8, ndcY: 0, pressure: 1 });
    expect(port.calls.stamps).toHaveLength(1);
    // 간격 = spacing 0.5 → 지름의 0.25 = 0.025 NDC. 0.1 이동 → 4개
    expect(driver.move({ ndcX: -0.7, ndcY: 0, pressure: 1 })).toBe(4);
    expect(port.calls.stamps).toHaveLength(5);
    expect(driver.move({ ndcX: 0.9, ndcY: 0, pressure: 1 })).toBe(MAX_STAMPS_PER_MOVE);
  });

  it("표면을 벗어난 점은 스탬프하지 않고(touching=false) 다시 닿으면 이어서 칠한다", () => {
    const port = fakePort("skin", { hit: (x) => x < 0 });
    const { driver } = harness(port);
    expect(driver.down({ ndcX: -0.5, ndcY: 0, pressure: 1 })).toBe(true);
    driver.move({ ndcX: 0.5, ndcY: 0, pressure: 1 });
    expect(driver.touching).toBe(false);
    expect(driver.move({ ndcX: -0.3, ndcY: 0, pressure: 1 })).toBeGreaterThan(0);
    expect(driver.touching).toBe(true);
  });

  it("처음부터 표면에 닿지 못하면 false이고 up은 아무것도 commit하지 않는다", async () => {
    const port = fakePort("skin", { hit: () => false });
    const { commits, driver, shared } = harness(port);
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(false);
    driver.up();
    await settle();
    expect(commits).toHaveLength(0);
    expect(port.calls.flush).toBe(0);
    expect(shared.finalizing).toBe(false);
  });

  it("cancel은 포트를 비우고 commit하지 않는다", async () => {
    const port = fakePort("skin");
    const { session, commits, driver } = harness(port);
    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.cancel();
    await settle();
    expect(port.calls.cancel).toBe(1);
    expect(port.calls.flush).toBe(0);
    expect(commits).toHaveLength(0);
    expect(readPixel(session.layer("skin"), 64, 64)[3]).toBe(0);
  });

  it("읽기 중에는 새 스트로크를 거절하고 한글로 알린다(포트 RTT 공유) — 끝나면 다시 칠할 수 있다", async () => {
    const port = fakePort("skin", {}, true);
    const { commits, notices, shared, driver } = harness(port);
    driver.down({ ndcX: -0.5, ndcY: 0.5, pressure: 1 });
    driver.up();
    expect(shared.finalizing).toBe(true);
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(false);
    expect(notices.at(-1)).toContain("반영하는 중");
    port.resolveFlush();
    await settle();
    expect(shared.finalizing).toBe(false);
    expect(commits).toHaveLength(1);
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(true);
  });

  it("읽기 실패는 한글로 알리고 레이어를 바꾸지 않으며 commit하지 않는다", async () => {
    const port = fakePort("skin");
    const failing: ProjectionPaintPort = { ...port, flush: () => Promise.reject(new Error("이 엔진은 렌더 타깃 readback을 지원하지 않아 투영 결과를 읽을 수 없습니다.")) };
    const { session, commits, notices, shared, driver } = harness(failing as FakePort);
    const before = new Uint8ClampedArray(session.layer("skin").rgba);
    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.up();
    await settle();
    expect(commits).toHaveLength(0);
    expect(notices.at(-1)).toContain("투영 페인트 결과를 레이어에 반영하지 못했습니다");
    expect(notices.at(-1)).toContain("readback");
    expect(bytesEqual(session.layer("skin").rgba, before)).toBe(true);
    expect(shared.finalizing).toBe(false);
  });

  it("스트로크 중 레이어 크기가 바뀌어 overlay와 맞지 않으면 한글 오류로 알린다", async () => {
    const port = fakePort("skin", { overlay: (_stamps, _w, _h) => ({ part: "skin", width: 32, height: 32, rgba: new Uint8Array(32 * 32 * 4).fill(255) }) });
    const { commits, notices, driver } = harness(port);
    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.up();
    await settle();
    expect(commits).toHaveLength(0);
    expect(notices.at(-1)).toContain("크기");
  });

  it("압력이 다르면 다른 브러시 비트맵을 올리고 같은 압력은 재사용한다", () => {
    const port = fakePort("skin");
    const { driver } = harness(port);
    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.move({ ndcX: 0.001, ndcY: 0, pressure: 0.5 });
    const keys = new Set(port.calls.brushes.map((bitmap) => bitmap.key));
    expect(keys.size).toBe(2);
  });
});

describe("전환 드라이버", () => {
  const pick = (x: number, y: number): PickHit => ({ partId: 1, role: "skin", uv: [(x + 1) / 2, (1 - y) / 2], worldPosition: [0, 0, 0], worldNormal: [0, 0, 1], distance: 1 });

  function switching(port: ProjectionPaintPort | null) {
    const session = createPaintSession({ layerSize: LAYER, brush: BRUSH });
    const commits: PaintUndoToken[] = [];
    const notices: Array<string | null> = [];
    const driver = createSwitchingPaintDriver(session, { pick, upload: () => undefined, commit: (token) => commits.push(token), projection: () => port, notify: (message) => notices.push(message) });
    return { session, commits, notices, driver };
  }

  it("투영 포트가 없으면 기존 CPU 스탬프 경로로 칠하고 토큰을 동기로 commit한다", () => {
    const { session, commits, driver } = switching(null);
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(true);
    expect(driver.dabCount).toBe(1);
    const token = driver.up();
    expect(token).not.toBeNull();
    expect(commits).toHaveLength(1);
    expect(readPixel(session.layer("skin"), 64, 64)[3]).toBe(255);
  });

  it("투영 포트가 있으면 그 스트로크는 투영 경로(포트 호출, up은 null, 반영은 비동기)다", async () => {
    const port = fakePort("skin");
    const { session, commits, driver } = switching(port);
    expect(driver.down({ ndcX: -0.5, ndcY: 0.5, pressure: 1 })).toBe(true);
    expect(port.calls.begin).toBe(1);
    expect(driver.up()).toBeNull();
    await settle();
    expect(commits).toHaveLength(1);
    expect(readPixel(session.layer("skin"), 32, 32)).toEqual([255, 0, 0, 255]);
  });

  it("경로는 스트로크마다 고른다: 포트가 꺼지면 다음 스트로크는 CPU 경로", async () => {
    let port: ProjectionPaintPort | null = fakePort("skin");
    const session = createPaintSession({ layerSize: LAYER, brush: BRUSH });
    const commits: PaintUndoToken[] = [];
    const driver = createSwitchingPaintDriver(session, { pick, upload: () => undefined, commit: (token) => commits.push(token), projection: () => port });
    driver.down({ ndcX: -0.5, ndcY: 0.5, pressure: 1 });
    driver.up();
    await settle();
    expect(commits).toHaveLength(1);
    port = null;
    driver.down({ ndcX: 0.5, ndcY: -0.5, pressure: 1 });
    expect(driver.up()).not.toBeNull();
    expect(commits).toHaveLength(2);
  });

  it("투영 반영 중에는 CPU 경로 스트로크도 시작하지 않는다(타일 undo 순서 보존)", async () => {
    const port = fakePort("skin", {}, true);
    let current: ProjectionPaintPort | null = port;
    const session = createPaintSession({ layerSize: LAYER, brush: BRUSH });
    const notices: Array<string | null> = [];
    const commits: PaintUndoToken[] = [];
    const driver = createSwitchingPaintDriver(session, { pick, upload: () => undefined, commit: (token) => commits.push(token), projection: () => current, notify: (message) => notices.push(message) });
    driver.down({ ndcX: -0.5, ndcY: 0.5, pressure: 1 });
    driver.up();
    current = null;
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(false);
    expect(notices.at(-1)).toContain("반영하는 중");
    port.resolveFlush();
    await settle();
    expect(commits).toHaveLength(1);
  });

  it("cancel은 현재 경로를 취소한다", () => {
    const port = fakePort("skin");
    const { driver } = switching(port);
    driver.down({ ndcX: 0, ndcY: 0, pressure: 1 });
    driver.cancel();
    expect(port.calls.cancel).toBe(1);
    expect(driver.active).toBe(false);
  });
});
