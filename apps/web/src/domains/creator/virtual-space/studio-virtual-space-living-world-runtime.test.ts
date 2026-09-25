import { describe, expect, it, vi } from "vitest";
import {
  StudioLivingWorldRuntime,
  studioVirtualTerrainAt,
  type StudioLivingWorldScenePort,
  type StudioLivingWorldTextureKeys,
} from "./studio-virtual-space-living-world";
import { DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT } from "./studio-virtual-space-environment-preference";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

const keys: StudioLivingWorldTextureKeys = {
  cloudBack: "cloud-back", cloudFront: "cloud-front", water: "water", foliage: "foliage", lights: "lights",
  weather: "weather", terrain: "terrain", pathOverlay: "path", waterfall: "waterfall", waterfallSplash: "splash", interactionFx: "interaction",
};
const authored: StudioVirtualSpaceWorldManifest = {
  ...DEFAULT_STUDIO_WORLD_MANIFEST, id: "authored-map", width: 384, height: 256, rooms: [],
  tilemap: {
    orientation: "orthogonal", renderOrder: "right-down", width: 12, height: 8, tileWidth: 32, tileHeight: 32,
    tilesets: [{ firstGid: 1, name: "authored", imageUrl: "/authored.png", imageWidth: 32, imageHeight: 32, tileWidth: 32, tileHeight: 32, tileCount: 1, columns: 1, margin: 0, spacing: 0 }],
    layers: [{ id: "ground", name: "직접 만든 바닥", width: 12, height: 8, x: 0, y: 0, depth: -1000, visible: true, opacity: 1, data: Array.from({ length: 96 }, () => 1) }],
  },
};

class Visual {
  alpha = 1;
  depth = 0;
  frame = 0;
  visible = true;
  tilePositionX = 0;
  tilePositionY = 0;
  tint: number | undefined;
  fillColor: number | undefined;
  readonly data = new Map<string, number>();
  readonly destroy = vi.fn();
  constructor(readonly kind: string, public x: number, public y: number, readonly texture?: string, readonly width?: number, readonly height?: number) {}
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  setScale(_x: number, _y?: number) { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setOrigin(_x: number, _y?: number) { return this; }
  setScrollFactor(_x: number, _y?: number) { return this; }
  setBlendMode(_value: string) { return this; }
  setDisplaySize(_width: number, _height: number) { return this; }
  setFrame(frame: number) { this.frame = frame; return this; }
  setTint(tint: number) { this.tint = tint; return this; }
  setData(key: string, value: number) { this.data.set(key, value); return this; }
  getData(key: string) { return this.data.get(key); }
  setFillStyle(color: number, _alpha: number) { this.fillColor = color; return this; }
  setStrokeStyle(_width: number, _color: number, _alpha: number) { return this; }
  lineStyle(_width: number, _color: number, _alpha: number) { return this; }
  lineBetween(_x1: number, _y1: number, _x2: number, _y2: number) { return this; }
}

function harness(manifest = authored) {
  const objects: Visual[] = [];
  const create = (kind: string, x: number, y: number, texture?: string, width?: number, height?: number) => {
    const item = new Visual(kind, x, y, texture, width, height); objects.push(item); return item;
  };
  const scene = {
    add: {
      ellipse: (x: number, y: number, w: number, h: number, _color: number, _alpha: number) => create("ellipse", x, y, undefined, w, h),
      circle: (x: number, y: number, r: number, _color: number, _alpha: number) => create("circle", x, y, undefined, r * 2, r * 2),
      rectangle: (x: number, y: number, w: number, h: number, _color: number, _alpha: number) => create("rectangle", x, y, undefined, w, h),
      tileSprite: (x: number, y: number, w: number, h: number, texture: string) => create("tileSprite", x, y, texture, w, h),
      sprite: (x: number, y: number, texture: string, frame: number) => create("sprite", x, y, texture).setFrame(frame),
      image: (x: number, y: number, texture: string, frame?: number) => create("image", x, y, texture).setFrame(frame ?? 0),
      graphics: () => create("graphics", 0, 0),
    },
    tweens: { add: vi.fn<StudioLivingWorldScenePort["tweens"]["add"]>() },
    cameras: { main: { flash: vi.fn(), shake: vi.fn() } },
  } satisfies StudioLivingWorldScenePort;
  const runtime = new StudioLivingWorldRuntime(scene, manifest, "sky-island", keys);
  return { runtime, scene, objects, textured: (texture: string) => objects.filter((item) => item.texture === texture) };
}
function required<T>(item: T | undefined): T { if (item === undefined) throw new Error("필수 fixture 객체 누락"); return item; }

const forbidden = [keys.water, keys.foliage, keys.lights, keys.terrain, keys.pathOverlay, keys.waterfall, keys.waterfallSplash];

describe("직접 작성한 타일 월드의 환경 표현", () => {
  it("create와 반복 update 뒤에도 legacy 지형·폭포·물·길·나무·고정 조명을 생성하지 않는다", () => {
    const h = harness();
    expect(h.objects.filter((item) => item.texture && forbidden.includes(item.texture))).toEqual([]);
    expect(h.objects.filter((item) => item.kind === "graphics")).toEqual([]);
    // ellipse는 bounds 상대의 작은 ambient actor/shadow뿐이며, 고정 fountain/portal/tree aura가 아니다.
    expect(h.objects.filter((item) => item.kind === "ellipse")).toHaveLength(20);
    expect(h.objects.filter((item) => item.kind === "ellipse").every((item) => item.width === 9 || item.width === 13)).toBe(true);
    for (const time of [0, 500, 20_000, 600_000]) h.runtime.update(time, 16, { x: 150, y: 100 }, 0);
    expect(h.objects.filter((item) => item.texture && forbidden.includes(item.texture))).toEqual([]);
    h.runtime.destroy();
    expect(h.objects.every((item) => item.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("작은 월드에서도 cloud·날씨·주야·ambient를 자체 bounds에 맞추고 사용자 설정을 유지한다", () => {
    const h = harness();
    expect(h.textured(keys.cloudBack)[0]).toMatchObject({ width: 384, height: 256 });
    expect(h.textured(keys.cloudFront)[0]).toMatchObject({ width: 384, height: 256 });
    expect(h.objects.filter((item) => item.kind === "ellipse" || item.texture === keys.weather)
      .every((item) => item.x >= 0 && item.x < 384 && item.y >= 0 && item.y < 256)).toBe(true);
    h.runtime.update(1000, 16, { x: 100, y: 100 }, 0, false, undefined, "balanced", {
      ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, dayPhase: "night", weather: "rain",
    });
    expect(required(h.objects.find((item) => item.kind === "rectangle"))).toMatchObject({ alpha: 0.32, width: 384, height: 256 });
    expect(h.textured(keys.weather)).toHaveLength(12);
    expect(h.textured(keys.weather).every((item) => item.visible && item.tint === 0xaedcff)).toBe(true);
    expect(required(h.textured(keys.cloudBack)[0]).tilePositionX).toBeGreaterThan(0);
    h.runtime.update(1100, 16, { x: 100, y: 100 }, 0, false, undefined, "balanced", {
      ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, dayPhase: "day", weather: "clear",
    });
    expect(required(h.objects.find((item) => item.kind === "rectangle"))).toMatchObject({ alpha: 0 });
    expect(h.textured(keys.weather).every((item) => !item.visible)).toBe(true);
    h.runtime.destroy();
  });

  it("reduced motion에서 환경 이동을 멈추며 명시 효과만 요청한 좌표에 생성한다", () => {
    const h = harness();
    const before = h.objects.map((item) => ({ x: item.x, y: item.y, tx: item.tilePositionX, ty: item.tilePositionY }));
    h.runtime.update(5000, 16, { x: 100, y: 100 }, 0, true);
    for (const [index, item] of h.objects.entries()) expect({ x: item.x, y: item.y, tx: item.tilePositionX, ty: item.tilePositionY }).toEqual(before[index]);
    h.runtime.triggerEnvironmentEffect("petals", { x: 110, y: 70 }, 5000);
    expect(h.textured(keys.interactionFx)[0]).toMatchObject({ x: 110, y: 58 });
    expect(h.scene.tweens.add).toHaveBeenCalledTimes(12);
    expect(h.objects.filter((item) => item.texture && forbidden.includes(item.texture))).toEqual([]);
    h.runtime.update(6000, 16, { x: 110, y: 70 }, 0, true);
    expect(required(h.textured(keys.interactionFx)[0]).destroy).toHaveBeenCalledTimes(1);
    for (const [tween] of h.scene.tweens.add.mock.calls) tween.onComplete();
    h.runtime.destroy();
    expect(h.objects.every((item) => item.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("타일맵은 예전 물웅덩이 좌표에서 보이지 않는 물 감속이나 ripple을 적용받지 않는다", () => {
    const legacyWater = { x: 585, y: 550 };
    expect(studioVirtualTerrainAt(DEFAULT_STUDIO_WORLD_MANIFEST, legacyWater)).toMatchObject({ kind: "shallow-water", speedMultiplier: 0.62, footprint: "ripple" });
    expect(studioVirtualTerrainAt({ ...DEFAULT_STUDIO_WORLD_MANIFEST, tilemap: authored.tilemap }, legacyWater))
      .toMatchObject({ kind: "path", speedMultiplier: 1, dragMultiplier: 1, footprint: "dust" });
  });

  it("기존 월드는 legacy 장식 개수·좌표와 update에서 살아 있는 길 효과를 보존한다", () => {
    const h = harness(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(h.textured(keys.water).map((item) => [item.x, item.y])).toEqual([[588, 559], [937, 565]]);
    expect(h.textured(keys.foliage)).toHaveLength(13); expect(h.textured(keys.lights)).toHaveLength(10);
    expect(h.textured(keys.waterfall).length).toBeGreaterThan(0);
    expect(h.textured(keys.waterfallSplash)).toHaveLength(h.textured(keys.waterfall).length);
    expect(h.textured(keys.terrain).length).toBeGreaterThan(0);
    expect(h.objects.filter((item) => item.kind === "graphics")).toHaveLength(1);
    expect(h.objects.filter((item) => item.kind === "ellipse")).toHaveLength(23);
    h.runtime.update(1000, 16, { x: 600, y: 500 }, 0);
    expect(required(h.textured(keys.pathOverlay)[0]).alpha).toBeCloseTo(0.84 + Math.sin(0.8) * 0.04);
    h.runtime.destroy(); expect(h.objects.every((item) => item.destroy.mock.calls.length === 1)).toBe(true);
  });
});
