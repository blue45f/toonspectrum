import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { createStudioWorldTileRuntime, StudioWorldTileRuntime, type StudioTileRuntimeBackend, type StudioTileScenePort } from "./studio-virtual-space-tile-runtime";
import type { StudioTileWorld } from "./studio-virtual-space-tile-chunks";

// 브라우저 전체를 띄우지 않고 설치된 Phaser의 실제 Tiled GID 해석기를 사용한다.
const parseGid: (value: number) => { gid: number; rotation: number; flipped: boolean }
  = createRequire(import.meta.url)("phaser/src/tilemaps/parsers/tiled/ParseGID.js");
type MapPort = ReturnType<StudioTileScenePort["make"]["tilemap"]>;
type LayerPort = NonNullable<ReturnType<MapPort["createBlankLayer"]>>;

function world(cells: readonly (readonly [number, number])[] = [[0, 1]]): StudioTileWorld {
  const data = Array.from({ length: 48 * 32 }, () => 0);
  for (const [index, gid] of cells) data[index] = gid;
  return {
    orientation: "orthogonal", renderOrder: "right-down", width: 48, height: 32, tileWidth: 16, tileHeight: 24,
    tilesets: [
      { firstGid: 1, name: "floor", imageUrl: "/floor.png", imageWidth: 16, imageHeight: 24, tileWidth: 8, tileHeight: 12, columns: 2, tileCount: 4, margin: 0, spacing: 0 },
      { firstGid: 17, name: "props", imageUrl: "/props.png", imageWidth: 16, imageHeight: 24, tileWidth: 8, tileHeight: 12, columns: 2, tileCount: 4, margin: 0, spacing: 0 },
    ],
    layers: [{ id: "ground", name: "바닥", width: 48, height: 32, x: 32, y: 48, visible: true, opacity: 0.75, depth: 18, data }],
  };
}
const start = { x: 32, y: 48, width: 16, height: 24 };
const far = { x: 32 + 40 * 16, y: 48 + 24 * 24, width: 16, height: 24 };

class Loader extends EventEmitter {
  loading = false;
  image = vi.fn<(key: string, url: string) => void>();
  isLoading = () => this.loading;
  start = vi.fn(() => { this.loading = true; });
}
class Layer implements LayerPort {
  readonly tiles: { gid: number; x: number; y: number; rotation: number; flipX: boolean }[] = [];
  setScale = vi.fn((_x: number, _y: number) => this);
  setDepth = vi.fn((_depth: number) => this);
  setAlpha = vi.fn((_alpha: number) => this);
  putTileAt = vi.fn((gid: number, x: number, y: number, _recalculate: boolean) => {
    const tile = { gid, x, y, rotation: 0, flipX: false }; this.tiles.push(tile); return tile;
  });
}
function harness(mapWorld = world()) {
  const textures = new Map<string, { width: number; height: number }>();
  const calls: string[] = [];
  const maps: ReturnType<typeof makeMap>[] = [];
  const load = new Loader();
  const events = new EventEmitter();
  const textureEvents = new EventEmitter();
  let rejectLayer = false;
  function makeMap() {
    const layer = new Layer();
    const map = {
      layer,
      addTilesetImage: vi.fn<MapPort["addTilesetImage"]>(() => ({})),
      createBlankLayer: vi.fn<MapPort["createBlankLayer"]>(() => rejectLayer ? null : layer),
      destroy: vi.fn(() => { calls.push("map-destroy"); }),
    };
    maps.push(map); return map;
  }
  const scene = {
    textures: {
      once: (event: string, listener: () => void) => textureEvents.once(event, listener),
      off: (event: string, listener: () => void) => textureEvents.off(event, listener),
      exists: (key: string) => textures.has(key),
      get: (key: string) => ({ getSourceImage: () => {
        const image = textures.get(key); if (!image) throw new Error(`Missing fake texture: ${key}`); return image;
      } }),
      remove: vi.fn((key: string) => { calls.push(`texture-remove:${key}`); textures.delete(key); }),
    },
    make: { tilemap: vi.fn((_config: Parameters<StudioTileScenePort["make"]["tilemap"]>[0]) => makeMap()) },
    load, events,
  } satisfies StudioTileScenePort;
  const onError = vi.fn();
  const resolveUrl = vi.fn((url: string) => `blob:owned${url}`);
  const runtime = createStudioWorldTileRuntime(scene, mapWorld, "studio-world", { parseGid, onError, resolveUrl });
  const key = (id: number, occurrence = 0) => {
    const match = load.image.mock.calls.filter(([value]) => value.endsWith(`:tiles:${id}`))[occurrence];
    if (!match) throw new Error(`No texture request for ${id}`); return match[0];
  };
  const complete = (textureKey: string, width = 16, height = 24) => {
    textures.set(textureKey, { width, height }); textureEvents.emit(`addtexture-${textureKey}`); load.emit(`filecomplete-image-${textureKey}`);
  };
  return { runtime, mapWorld, scene, textures, textureEvents, calls, load, events, maps, key, complete, onError, resolveUrl, rejectLayer: () => { rejectLayer = true; } };
}

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error("필수 fixture 값 누락"); return value; }

describe("Phaser 타일 runtime 어댑터", () => {
  it("두 tileset 준비 뒤 실제 blank layer에 논리 스케일·원점·깊이·모든 Tiled flip 조합을 전달한다", () => {
    const raw = [1, 0x80000001, 0x40000001, 0xc0000001, 0x20000001, 0xa0000001, 0x60000001, 0xe0000011];
    const h = harness(world(raw.map((gid, index) => [index, gid] as const)));
    expect(h.runtime.diagnostics.ready).toBe(false);
    h.runtime.update(start);
    expect(h.load.image.mock.calls.map(([, url]) => url)).toEqual(["blob:owned/floor.png", "blob:owned/props.png"]);
    expect(h.load.start).toHaveBeenCalledTimes(1);
    h.complete(h.key(1));
    expect(h.maps).toHaveLength(0); expect(h.runtime.diagnostics.ready).toBe(false);
    h.complete(h.key(17));
    expect(h.runtime.diagnostics).toEqual({ chunks: 1, textures: 2, pending: 0, failures: 0, ready: true });
    const map = required(h.maps[0]);
    expect(h.scene.make.tilemap).toHaveBeenCalledWith({ width: 8, height: 8, tileWidth: 8, tileHeight: 12 });
    expect(map.addTilesetImage.mock.calls).toEqual([
      ["floor", h.key(1), 8, 12, 0, 0, 1], ["props", h.key(17), 8, 12, 0, 0, 17],
    ]);
    expect(map.createBlankLayer).toHaveBeenCalledWith("ground:0:0", ["floor", "props"], 32, 48);
    expect(map.layer.setScale).toHaveBeenCalledWith(2, 2);
    expect(map.layer.setDepth).toHaveBeenCalledWith(18); expect(map.layer.setAlpha).toHaveBeenCalledWith(0.75);
    expect(map.layer.tiles).toEqual([
      { gid: 1, x: 0, y: 0, rotation: 0, flipX: false },
      { gid: 1, x: 1, y: 0, rotation: 0, flipX: true },
      { gid: 1, x: 2, y: 0, rotation: Math.PI, flipX: true },
      { gid: 1, x: 3, y: 0, rotation: Math.PI, flipX: false },
      { gid: 1, x: 4, y: 0, rotation: 3 * Math.PI / 2, flipX: true },
      { gid: 1, x: 5, y: 0, rotation: Math.PI / 2, flipX: false },
      { gid: 1, x: 6, y: 0, rotation: 3 * Math.PI / 2, flipX: false },
      { gid: 17, x: 7, y: 0, rotation: Math.PI / 2, flipX: true },
    ]);
    expect(map.layer.putTileAt.mock.calls.every(([, , , recalculate]) => recalculate === false)).toBe(true);
    h.runtime.destroy();
  });

  it("화면 밖 map을 먼저 파괴한 뒤 마지막 사용자가 사라진 texture만 해제하고 다시 들어오면 재로딩한다", () => {
    const h = harness(world([[0, 1], [24 * 48 + 40, 17]]));
    h.textures.set("unrelated-avatar", { width: 16, height: 24 });
    h.runtime.update(start); h.complete(h.key(1));
    const first = required(h.maps[0]);
    h.runtime.update(far);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(h.calls.slice(0, 2)).toEqual(["map-destroy", `texture-remove:${h.key(1)}`]);
    expect(h.runtime.diagnostics.ready).toBe(false);
    h.complete(h.key(17));
    expect(required(h.maps[1]).createBlankLayer).toHaveBeenCalledWith("ground:5:3", ["props"], 672, 624);
    expect(h.runtime.diagnostics).toMatchObject({ chunks: 1, textures: 1, ready: true });
    h.runtime.update(start);
    expect(h.load.image.mock.calls.filter(([, url]) => url.endsWith("/floor.png"))).toHaveLength(2);
    h.complete(h.key(1, 1)); h.runtime.destroy(); h.runtime.destroy();
    expect(h.textures.has("unrelated-avatar")).toBe(true);
    expect(h.maps.every((map) => map.destroy.mock.calls.length === 1)).toBe(true);
    expect(h.events.eventNames()).toEqual([]);
  });

  it("두 청크가 공유하는 texture는 남은 청크가 사용하는 동안 유지한다", () => {
    const h = harness(world([[0, 1], [16, 1]]));
    h.runtime.update({ ...start, width: 128 }); h.complete(h.key(1));
    h.runtime.update({ ...start, x: 32 + 16 * 16, width: 128 });
    expect(h.scene.textures.remove).not.toHaveBeenCalled();
    expect(h.load.image).toHaveBeenCalledTimes(1);
    expect(h.runtime.diagnostics).toMatchObject({ chunks: 1, textures: 1, ready: true });
    h.runtime.destroy();
  });

  it("pending 중 떠난 viewport의 늦은 완료는 map을 만들지 않고 texture를 즉시 회수한다", () => {
    const h = harness(); h.runtime.update(start); h.runtime.update(far);
    expect(h.runtime.diagnostics.ready).toBe(true);
    h.complete(h.key(1));
    expect(h.maps).toHaveLength(0); expect(h.textures.size).toBe(0);
    expect(h.load.eventNames()).toEqual([]);
    expect(h.runtime.diagnostics).toMatchObject({ textures: 0, pending: 0, ready: true });
    h.runtime.destroy();
  });

  it("pending 중 떠났다가 돌아와도 같은 로딩을 재사용하고 새 viewport에만 mount한다", () => {
    const h = harness(); h.runtime.update(start); h.runtime.update(far); h.runtime.update(start);
    expect(h.load.image).toHaveBeenCalledTimes(1);
    h.complete(h.key(1)); expect(h.maps).toHaveLength(1); expect(h.runtime.diagnostics.ready).toBe(true);
    h.runtime.destroy();
  });

  it("선언한 이미지 크기 불일치와 해당 파일 오류는 ready를 거부하고 매 프레임 재시도하지 않는다", () => {
    const h = harness(); h.runtime.update(start);
    h.load.emit("loaderror", { key: "another-runtime-file" });
    expect(h.onError).not.toHaveBeenCalled(); expect(h.runtime.diagnostics.pending).toBe(1);
    h.complete(h.key(1), 17, 24);
    expect(h.textures.size).toBe(0); expect(h.runtime.diagnostics).toMatchObject({ failures: 1, ready: false });
    expect(h.onError).toHaveBeenCalledWith("타일 이미지 크기가 매니페스트와 다릅니다: floor");
    h.runtime.update(far); h.runtime.update(start);
    expect(h.load.image).toHaveBeenCalledTimes(1); h.runtime.destroy();
    const failed = harness(); failed.runtime.update(start);
    failed.load.emit("loaderror", { key: failed.key(1) });
    expect(failed.load.eventNames()).toEqual([]); expect(failed.runtime.diagnostics).toMatchObject({ pending: 0, failures: 1, ready: false });
    expect(failed.onError).toHaveBeenCalledWith("타일 이미지를 불러오지 못했습니다: floor"); failed.runtime.destroy();
  });

  it("destroy 후 늦은 완료는 구독과 texture를 회수하고 같은 namespace의 다음 runtime에 영향을 주지 않는다", () => {
    const h = harness(); h.runtime.update(start); const oldKey = h.key(1); h.runtime.destroy();
    const next = createStudioWorldTileRuntime(h.scene, h.mapWorld, "studio-world", { parseGid, onError: h.onError });
    next.update(start); const newKey = h.key(1, 1); expect(newKey).not.toBe(oldKey);
    h.complete(newKey); h.complete(oldKey);
    expect(h.textures.has(newKey)).toBe(true); expect(h.textures.has(oldKey)).toBe(false);
    expect(h.maps).toHaveLength(1); expect(h.onError).not.toHaveBeenCalled();
    expect(h.load.eventNames()).toEqual([]); expect(next.diagnostics.ready).toBe(true);
    next.destroy(); expect(h.textures.size).toBe(0); expect(h.events.eventNames()).toEqual([]);
  });

  it("HTTP 성공 뒤 PNG 해독이 실패하면 loaderror 없이 끝난 batch에서도 pending과 listener를 정리한다", () => {
    const h = harness(); h.runtime.update(start);
    // Phaser ImageFile.onProcessError는 loaderror 없이 전체 complete로 끝난다.
    h.load.emit("complete");
    expect(h.runtime.diagnostics).toMatchObject({ pending: 0, failures: 1, ready: false });
    expect(h.onError).toHaveBeenCalledExactlyOnceWith("타일 이미지를 불러오지 못했습니다: floor");
    expect(h.maps).toHaveLength(0); expect(h.textures.size).toBe(0);
    expect(h.load.eventNames()).toEqual([]); expect(h.textureEvents.eventNames()).toEqual([]);
    h.load.emit("complete"); expect(h.onError).toHaveBeenCalledTimes(1);
    h.runtime.destroy();
  });

  it("초기 ready 이후 새 viewport의 PNG 해독 실패도 영구 pending으로 남기지 않는다", () => {
    const h = harness(world([[0, 1], [24 * 48 + 40, 17]]));
    h.runtime.update(start); h.complete(h.key(1)); h.load.emit("complete");
    expect(h.runtime.diagnostics.ready).toBe(true); expect(h.onError).not.toHaveBeenCalled();
    h.runtime.update(far); h.load.emit("complete");
    expect(h.runtime.diagnostics).toMatchObject({ chunks: 0, textures: 0, pending: 0, failures: 1, ready: false });
    expect(h.onError).toHaveBeenCalledExactlyOnceWith("타일 이미지를 불러오지 못했습니다: props");
    expect(h.textureEvents.eventNames()).toEqual([]); expect(h.load.eventNames()).toEqual([]);
    h.runtime.destroy();
  });

  it("Scene shutdown 뒤 PNG 처리 실패의 complete는 새 오류 표시 없이 남은 listener만 회수한다", () => {
    const h = harness(); h.runtime.update(start);
    h.load.removeAllListeners(); h.events.emit("shutdown"); h.load.emit("complete");
    expect(h.onError).not.toHaveBeenCalled(); expect(h.runtime.diagnostics.pending).toBe(0);
    expect(h.load.eventNames()).toEqual([]); expect(h.textureEvents.eventNames()).toEqual([]);
    expect(h.events.eventNames()).toEqual([]);
  });

  it("destroy 뒤 실패와 Scene shutdown의 늦은 cache 등록을 회수하고 사용자 오류를 뒤늦게 표시하지 않는다", () => {
    const h = harness(); h.runtime.update(start); h.runtime.destroy();
    h.load.emit("loaderror", { key: h.key(1) });
    expect(h.onError).not.toHaveBeenCalled(); expect(h.load.eventNames()).toEqual([]); expect(h.events.eventNames()).toEqual([]);
    const stopping = harness(); stopping.runtime.update(start);
    // 실제 LoaderPlugin.shutdown은 Scene handler보다 먼저 listener를 비우며 XHR은 계속될 수 있다.
    stopping.load.removeAllListeners(); stopping.events.emit("shutdown");
    stopping.complete(stopping.key(1));
    expect(stopping.textures.size).toBe(0); expect(stopping.textureEvents.eventNames()).toEqual([]);
    expect(stopping.load.eventNames()).toEqual([]); expect(stopping.events.eventNames()).toEqual([]);
    stopping.runtime.update(start); expect(stopping.load.image).toHaveBeenCalledTimes(1);
    expect(stopping.runtime.diagnostics).toMatchObject({ chunks: 0, textures: 0, pending: 0, ready: false });
  });

  it("Scene shutdown 뒤 파일 오류와 최종 Scene destroy는 남은 전역 texture listener까지 해제한다", () => {
    const failed = harness(); failed.runtime.update(start);
    failed.load.removeAllListeners(); failed.events.emit("shutdown");
    failed.load.emit("loaderror", { key: failed.key(1) });
    expect(failed.onError).not.toHaveBeenCalled(); expect(failed.load.eventNames()).toEqual([]);
    expect(failed.textureEvents.eventNames()).toEqual([]); expect(failed.events.eventNames()).toEqual([]);
    const destroyed = harness(); destroyed.runtime.update(start); destroyed.events.emit("destroy");
    expect(destroyed.textureEvents.eventNames()).toEqual([]); expect(destroyed.load.eventNames()).toEqual([]);
    expect(destroyed.events.eventNames()).toEqual([]);
  });

  it("Phaser가 layer 생성을 거절하면 부분 map을 파괴하고 준비 완료로 표시하지 않는다", () => {
    const h = harness(); h.rejectLayer(); h.runtime.update(start); h.complete(h.key(1));
    expect(required(h.maps[0]).destroy).toHaveBeenCalledTimes(1);
    expect(h.runtime.diagnostics).toMatchObject({ chunks: 0, failures: 1, ready: false });
    expect(h.onError).toHaveBeenCalledWith("타일 레이어를 만들지 못했습니다: 바닥");
    h.runtime.update(far); h.runtime.update(start); h.complete(h.key(1, 1));
    expect(h.maps).toHaveLength(1); h.runtime.destroy();
  });
});

describe("타일 runtime 순수 자원 소유", () => {
  it("첫 빈 viewport만 준비 완료이고 invalid viewport와 초기 상태는 준비 완료가 아니다", () => {
    const h = harness(); expect(h.runtime.diagnostics.ready).toBe(false);
    h.runtime.update({ ...start, width: 0 }); expect(h.runtime.diagnostics.ready).toBe(false);
    h.runtime.update(far); expect(h.runtime.diagnostics.ready).toBe(true);
    expect(h.load.image).not.toHaveBeenCalled(); h.runtime.destroy();
  });

  it("같은 layer 청크 범위 안에서는 descriptor 배열을 새로 읽지 않지만 offset 경계를 넘으면 갱신한다", () => {
    const map = world(); const layer = required(map.layers[0]); const dataRead = vi.fn(() => layer.data);
    const offsetWorld = { ...map, layers: [{ ...layer, x: 32.5, get data() { return dataRead(); } }] };
    const backend: StudioTileRuntimeBackend = { requestTexture: vi.fn(), removeTexture: vi.fn(), mountChunk: vi.fn(() => vi.fn()), onError: vi.fn() };
    const runtime = new StudioWorldTileRuntime(offsetWorld, backend);
    runtime.update({ ...start, x: 32.1, width: 128 });
    const initial = dataRead.mock.calls.length;
    runtime.update({ ...start, x: 32.2, width: 128 });
    expect(dataRead).toHaveBeenCalledTimes(initial);
    runtime.update({ ...start, x: 32.6, width: 128 });
    expect(dataRead.mock.calls.length).toBeGreaterThan(initial);
    expect(backend.requestTexture).toHaveBeenCalledTimes(1); runtime.destroy();
  });
});
