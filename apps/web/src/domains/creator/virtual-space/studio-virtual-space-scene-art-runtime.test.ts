import type * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { StudioVirtualDecorationRuntime } from "./studio-virtual-space-decoration-runtime";
import { studioExperienceAssetUrl, studioExperienceAtlas } from "./studio-virtual-space-experience-art";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { STUDIO_EXPERIENCE_ATLAS, registerStudioSceneAtlas, studioSceneActorScale, studioSceneCameraFrame, studioSceneOverlayScale, StudioVirtualSetDressingRuntime } from "./studio-virtual-space-scene-art-runtime";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import { studioRenderViewport } from "./studio-virtual-space-presentation";
import { studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";

class ArtSprite {
  origin: readonly number[] = [];
  size: readonly number[] = [];
  depth = 0;
  alpha = 1;
  destroyed = false;
  constructor(readonly x: number, readonly y: number, readonly texture: string, public frame: number) {}
  setOrigin(x: number, y: number) { this.origin = [x, y]; return this; }
  setDisplaySize(width: number, height: number) { this.size = [width, height]; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  setFrame(frame: number) { this.frame = frame; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  destroy() { this.destroyed = true; }
}
class ArtFallback {
  readonly rects: number[][] = [];
  destroyed = false;
  setDepth() { return this; }
  fillStyle() { return this; }
  fillRoundedRect(...rect: number[]) { this.rects.push(rect); return this; }
  destroy() { this.destroyed = true; }
}
function sceneHarness(available: readonly string[]) {
  const sprites: ArtSprite[] = [];
  const graphics: ArtFallback[] = [];
  const scene = {
    textures: { exists: (key: string) => available.includes(key) },
    add: {
      sprite: (x: number, y: number, texture: string, frame: number) => {
        const sprite = new ArtSprite(x, y, texture, frame); sprites.push(sprite); return sprite;
      },
      graphics: () => { const graphic = new ArtFallback(); graphics.push(graphic); return graphic; },
    },
  } as unknown as Pick<Phaser.Scene, "add" | "textures">;
  return { scene, sprites, graphics };
}

describe("새 장면 아트의 원본 프레임 등록", () => {
  it("1254px 시트의 홀수 셀까지 원본 전체를 빠짐없이 등록하고 중복 호출은 프레임을 늘리지 않는다", () => {
    const frames = new Map<number, number[]>();
    const texture = { getSourceImage: () => ({ width: 1254, height: 1254 }), has: (index: string) => frames.has(Number(index)),
      add: (index: number, source: number, ...rect: number[]) => { expect(source).toBe(0); frames.set(index, rect); } };
    expect(registerStudioSceneAtlas(texture, STUDIO_EXPERIENCE_ATLAS)).toBe(true);
    expect(registerStudioSceneAtlas(texture, STUDIO_EXPERIENCE_ATLAS)).toBe(true);
    expect(frames.size).toBe(16);
    expect([...frames.values()].reduce((area, rect) => area + rect[2]! * rect[3]!, 0)).toBe(1254 * 1254);
    expect(frames.get(0)).toEqual([0, 0, 314, 314]);
    expect(frames.get(15)).toEqual([941, 941, 313, 313]);
  });

  it("CDN에서 다른 크기가 도착하면 숫자 프레임을 만들지 않는다", () => {
    const frames: number[] = [];
    expect(registerStudioSceneAtlas({ getSourceImage: () => ({ width: 1253, height: 1254 }), has: () => false,
      add: (frame: number) => frames.push(frame) }, STUDIO_EXPERIENCE_ATLAS)).toBe(false);
    expect(frames).toEqual([]);
  });

  it("불균등 캐릭터 원본은 명시한 객체 영역을 그대로 등록한다", () => {
    const registered: number[][] = [];
    const texture = { getSourceImage: () => ({ width: 100, height: 40 }), has: () => false,
      add: (...args: number[]) => registered.push(args) };
    expect(registerStudioSceneAtlas(texture, { slicing: "explicit-frames", width: 100, height: 40, columns: 2, rows: 1,
      frames: [{ index: 0, x: 3, y: 5, width: 29, height: 30 }, { index: 1, x: 52, y: 2, width: 43, height: 37 }] })).toBe(true);
    expect(registered).toEqual([[0, 0, 3, 5, 29, 30], [1, 0, 52, 2, 43, 37]]);
  });

  it("공중섬의 기존 파일명과 나머지 테마의 독립 파일명을 구분한다", () => {
    expect(studioExperienceAssetUrl("furniture", "sky-island")).toBe("/assets/virtual-studio/experience-v8/furniture.png");
    expect(studioExperienceAssetUrl("landmarks", "sky-island")).toBe("/assets/virtual-studio/experience-v8/landmarks-sky-island.png");
    expect(studioExperienceAssetUrl("furniture", "retro")).toBe("/assets/virtual-studio/experience-v8/furniture-retro.png");
    expect(studioExperienceAssetUrl("terrain", "neon")).toBe("/assets/virtual-studio/experience-v8/terrain-neon.png");
  });
});

describe("랜드마크·가구 장면 통합", () => {
  const palette = { room: 0xf1d9ad, wall: 0x726454 };
  it("manifest의 건축물 전부를 정확한 크기와 깊이로 표시하고 충돌 권위는 바꾸지 않는다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport");
    const colliders = world.colliders;
    const items = studioVirtualWorldSetDressing(world);
    const h = sceneHarness(["landmarks", "furniture", "cat"]);
    const runtime = new StudioVirtualSetDressingRuntime(h.scene, world, { landmarks: "landmarks", furniture: "furniture", cat: "cat" }, palette);
    expect(runtime.itemCount).toBe(items.length);
    expect(h.sprites).toHaveLength(items.length);
    for (const [index, item] of items.entries()) {
      const sprite = h.sprites[index]!;
      const petScale = item.atlas === "furniture" && item.frame === 11 ? .65 : 1;
      expect([sprite.x, sprite.y, ...sprite.size]).toEqual([item.x, item.y, item.width * petScale, item.height * petScale]);
      expect(sprite.depth).toBe(item.depth === "y-sort" ? Math.round(item.y) + 1000 : item.depth);
    }
    expect(world.colliders).toBe(colliders);
    expect(h.graphics).toEqual([]);
    runtime.destroy();
    expect(h.sprites.every((sprite) => sprite.destroyed)).toBe(true);
  });

  it("아트가 없더라도 충돌하는 건물·가구의 실제 바닥 면적은 보인다", () => {
    const world = studioVirtualPlaceWorldManifest("personal-atelier");
    const h = sceneHarness([]);
    const runtime = new StudioVirtualSetDressingRuntime(h.scene, world, { landmarks: "missing" }, palette);
    const colliders = studioVirtualWorldSetDressing(world).flatMap((item) => item.colliders);
    expect(h.sprites).toEqual([]);
    expect(h.graphics.flatMap((graphic) => graphic.rects)).toHaveLength(colliders.length * 2);
    runtime.destroy();
    expect(h.graphics.every((graphic) => graphic.destroyed)).toBe(true);
  });

  it("테마별 불균등 프레임으로 바꿔도 원본 픽셀 배율과 명시된 고정점을 유지한다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport");
    const items = studioVirtualWorldSetDressing(world);
    for (const artStyle of ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"] as const) {
      const h = sceneHarness(["landmarks", "furniture"]);
      const runtime = new StudioVirtualSetDressingRuntime(h.scene, world, { landmarks: "landmarks", furniture: "furniture", artStyle }, palette);
      for (const [index, item] of items.entries()) {
        const frame = studioCharacterAtlasGridFrames(studioExperienceAtlas(item.atlas, artStyle))[item.frame]!;
        const cellX = Math.round(item.frame % 4 * 1254 / 4), cellY = Math.round(Math.floor(item.frame / 4) * 1254 / 4);
        const cellWidth = Math.round((item.frame % 4 + 1) * 1254 / 4) - cellX;
        const cellHeight = Math.round((Math.floor(item.frame / 4) + 1) * 1254 / 4) - cellY;
        const petScale = item.atlas === "furniture" && item.frame === 11 ? .65 : 1;
        const sprite = h.sprites[index]!;
        expect(sprite.size[0]! / frame.width).toBeCloseTo(item.width * petScale / cellWidth);
        expect(sprite.size[1]! / frame.height).toBeCloseTo(item.height * petScale / cellHeight);
        expect(frame.x + sprite.origin[0]! * frame.width).toBeCloseTo(cellX + cellWidth * item.originX);
        expect(frame.y + sprite.origin[1]! * frame.height).toBeCloseTo(cellY + cellHeight * item.originY);
        expect([sprite.x, sprite.y]).toEqual([item.x, item.y]);
      }
      runtime.destroy();
    }
  });

  it("고양이는 빠른 접근에 반응하고 동작 줄이기에서는 정지하며 위치·크기를 유지한다", () => {
    const h = sceneHarness(["landmarks", "furniture", "cat"]);
    const runtime = new StudioVirtualSetDressingRuntime(h.scene, studioVirtualPlaceWorldManifest("skyport"),
      { landmarks: "landmarks", furniture: "furniture", cat: "cat" }, palette);
    const cat = h.sprites.find((sprite) => sprite.texture === "cat")!;
    const before = [cat.x, cat.y, ...cat.size];
    runtime.update(0, { x: cat.x, y: cat.y }, false, 200);
    expect(cat.frame).toBe(8);
    runtime.update(200, { x: cat.x, y: cat.y }, true, 200);
    expect(cat.frame).toBe(0);
    expect([cat.x, cat.y, ...cat.size]).toEqual(before);
    expect(cat.size[1]).toBeLessThanOrEqual(40);
    runtime.destroy();
  });

  it("입구 중앙에서 캐릭터를 덮는 아치만 비치고 통로를 벗어나면 원래 모습으로 돌아간다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport");
    const h = sceneHarness(["landmarks", "furniture"]);
    const runtime = new StudioVirtualSetDressingRuntime(h.scene, world, { landmarks: "landmarks", furniture: "furniture" }, palette);
    const arch = h.sprites.find((sprite) => sprite.texture === "landmarks" && sprite.frame === 6)!;
    const colliders = world.colliders;
    runtime.update(0, world.spawns[0]!.point, false, 0);
    expect(arch.alpha).toBeCloseTo(.28);
    expect(h.sprites.filter((sprite) => sprite !== arch).every((sprite) => sprite.alpha === 1)).toBe(true);
    runtime.update(200, { x: 650, y: 540 }, false, 120);
    expect(arch.alpha).toBe(1);
    expect(world.colliders).toBe(colliders);
    runtime.destroy();
  });

  it("데스크톱은 장소와 여백이 보이며 모바일은 기존 추적 카메라를 유지한다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport");
    for (const [width, height] of [[1192, 520], [1440, 900]]) {
      const frame = studioSceneCameraFrame(world, width!, height!)!;
      expect(width! / frame.zoom).toBeGreaterThanOrEqual(world.width + 47.99);
      expect((height! - frame.bottomInset) / frame.zoom).toBeGreaterThanOrEqual(world.height + 47.99);
      expect(frame.bounds.x + frame.bounds.width / 2).toBeCloseTo(world.width / 2);
      expect(frame.bounds.y + (height! - frame.bottomInset) / frame.zoom / 2).toBeCloseTo(world.height / 2);
      const highDpi = studioSceneCameraFrame(world, width!, height!, 2)!;
      expect(highDpi.zoom / studioRenderViewport(width!, height!, 2).ratio).toBeCloseTo(frame.zoom);
      expect(highDpi.bounds).toEqual(frame.bounds);
    }
    expect(studioSceneCameraFrame(structuredClone(world), 1192, 520)).toBeNull();
    expect(studioSceneCameraFrame(world, 390, 740)).toBeNull();
    expect(studioSceneCameraFrame(world, 759, 520)).toBeNull();
    expect(studioSceneCameraFrame(world, 1192, 520)?.bottomInset).toBe(70);
    expect(studioSceneCameraFrame(world, 1192, 390)?.bottomInset).toBe(0);
  });

  it("장면을 축소해도 이름표는 원래 CSS 크기를 유지하고 사용자 월드는 기존 표현을 유지한다", () => {
    for (const [zoom, ratio] of [[.65, 1], [1.3, 2], [.76, 1]]) {
      expect(11 * studioSceneOverlayScale(.65, zoom!, ratio!) * zoom! / ratio!).toBeCloseTo(11);
    }
    expect(studioSceneOverlayScale(1, .5, 1)).toBe(1);
    expect(studioSceneOverlayScale(.65, NaN, 1)).toBe(1);
  });

  it("캠퍼스(follow)는 고정 카메라 프레임을 쓰지 않고, 장소 월드는 기존 fit 프레임을 유지한다", () => {
    const campus = studioVirtualCampusManifest(true);
    for (const [width, height] of [[1440, 900], [1192, 520], [390, 844]]) {
      expect(studioSceneCameraFrame(campus, width!, height!)).toBeNull();
    }
    expect(studioSceneActorScale(campus)).toBe(.65);
    const place = studioVirtualPlaceWorldManifest("garden");
    expect(studioSceneCameraFrame(place, 1440, 900)).not.toBeNull();
  });

  it("캐릭터 축소와 기본 건축물은 등록된 내장 장소에만 적용한다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport");
    expect(studioSceneActorScale(world)).toBe(.65);
    const uploaded = structuredClone(world);
    expect(studioSceneActorScale(uploaded)).toBe(1);
    const h = sceneHarness(["landmarks", "furniture"]);
    const runtime = new StudioVirtualSetDressingRuntime(h.scene, uploaded, { landmarks: "landmarks", furniture: "furniture" }, palette);
    expect(runtime.itemCount).toBe(0);
    expect(h.sprites).toEqual([]);
  });
});

it("가구 아트가 늦게 도착해도 기존 스프라이트 크기와 충돌 body를 교체하지 않는다", () => {
  const available = new Set(["legacy"]);
  const data = new Map<string, unknown>();
  const sprite = {
    texture: { key: "legacy" }, frame: 0, displayWidth: 0, displayHeight: 0, scaleX: 1, scaleY: 1,
    setTexture(key: string, frame: number) { this.texture.key = key; this.frame = frame; return this; },
    setDisplaySize(width: number, height: number) { this.displayWidth = width; this.displayHeight = height; return this; },
    setAngle: vi.fn().mockReturnThis(), setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    setData(key: string, value: unknown) { data.set(key, value); return this; },
    getData: (key: string) => data.get(key), destroy: vi.fn(),
  };
  const body = { setOrigin: vi.fn().mockReturnThis(), destroy: vi.fn() };
  const collider = { destroy: vi.fn() };
  const addBody = vi.fn(), addCollider = vi.fn(() => collider);
  const scene = {
    textures: { exists: (key: string) => available.has(key) },
    add: { sprite: (_x: number, _y: number, key: string, frame: number) => sprite.setTexture(key, frame), zone: () => body },
    physics: { add: { existing: addBody, collider: addCollider } },
  } as unknown as Phaser.Scene;
  const runtime = new StudioVirtualDecorationRuntime(scene, {} as Phaser.GameObjects.GameObject,
    { decor: "legacy", accessory: "accessory", furniture: "new-furniture", illustratedFurniture: true });
  runtime.syncDecorations({ revision: 1, presetKey: "minimal", districtKey: "sky-port", presentationMode: "decorated", placements: [
    { id: "desk", type: "drawing-desk", x: 250, y: 320, rotation: 90, scale: 1.25 },
  ] });
  expect(sprite.texture.key).toBe("legacy");
  expect(sprite.frame).toBe(5);
  expect(addBody).toHaveBeenCalledTimes(1);
  const size = [sprite.displayWidth, sprite.displayHeight];
  available.add("new-furniture");
  runtime.refreshTextures();
  expect(sprite.texture.key).toBe("new-furniture");
  expect(sprite.frame).toBe(12);
  expect([sprite.displayWidth, sprite.displayHeight]).toEqual(size);
  expect(addBody).toHaveBeenCalledTimes(1);
  expect(addCollider).toHaveBeenCalledTimes(1);
  expect(body.destroy).not.toHaveBeenCalled();
  expect(sprite.destroy).not.toHaveBeenCalled();
  runtime.destroy();
  expect(body.destroy).toHaveBeenCalledOnce();
  expect(collider.destroy).toHaveBeenCalledOnce();
});
