import { describe, expect, it } from "vitest";

import { CAMPUS_TERRAIN } from "./studio-virtual-space-campus-blueprint";
import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import {
  createStudioMotionFeelFrame,
  STUDIO_MOTION_FEEL_REFERENCE_SPRINT,
  StudioMotionFeelRuntime,
  studioCampusFloorSurface,
  studioMotionFeelTerrainSurface,
} from "./studio-virtual-space-motion-feel-runtime";

interface FakeSprite {
  visible: boolean;
  alpha: number;
  depth: number;
  x: number;
  y: number;
  textureKey: string;
  setVisible(value: boolean): FakeSprite;
  setTint(value: number): FakeSprite;
  setTexture(key: string): FakeSprite;
  setOrigin(): FakeSprite;
  setDisplaySize(): FakeSprite;
  setFlipX(): FakeSprite;
  setPosition(x: number, y: number): FakeSprite;
  setDepth(value: number): FakeSprite;
  setAlpha(value: number): FakeSprite;
  destroy(): void;
}

function fakeSprite(): FakeSprite {
  const sprite: FakeSprite = {
    visible: true, alpha: 1, depth: 0, x: 0, y: 0, textureKey: "",
    setVisible(value) { sprite.visible = value; return sprite; },
    setTint() { return sprite; },
    setTexture(key) { sprite.textureKey = key; return sprite; },
    setOrigin() { return sprite; },
    setDisplaySize() { return sprite; },
    setFlipX() { return sprite; },
    setPosition(x, y) { sprite.x = x; sprite.y = y; return sprite; },
    setDepth(value) { sprite.depth = value; return sprite; },
    setAlpha(value) { sprite.alpha = value; return sprite; },
    destroy() { sprite.visible = false; },
  };
  return sprite;
}

function fakeScene() {
  const bursts: { count: number; x: number; y: number; tint: number }[] = [];
  const sprites: FakeSprite[] = [];
  let tint = 0;
  const emitter = {
    setDepth() { return emitter; },
    setParticleTint(value: number) { tint = value; return emitter; },
    explode(count: number, x: number, y: number) { bursts.push({ count, x, y, tint }); },
    destroy() { /* fake */ },
  };
  const graphics = { fillStyle() { return graphics; }, fillCircle() { return graphics; }, generateTexture() { /* fake */ }, destroy() { /* fake */ } };
  const textures = new Set<string>();
  const scene = {
    textures: { exists: (key: string) => textures.has(key) },
    make: { graphics: () => { textures.add("studio-move-dust"); return graphics; } },
    add: {
      particles: () => emitter,
      sprite: () => { const sprite = fakeSprite(); sprites.push(sprite); return sprite; },
    },
  };
  return { scene, bursts, sprites };
}

/** 잔상 복제 원본(내 캐릭터)처럼 텍스처·프레임·원점을 가진 스프라이트. */
function sourceSprite() {
  return Object.assign(fakeSprite(), {
    texture: { key: "self-walk" }, frame: { name: 3 }, originX: 0.5, originY: 0.92,
    displayWidth: 60, displayHeight: 80, flipX: false, depth: 1_501,
  });
}

function runtimeFor() {
  const fake = fakeScene();
  const runtime = new StudioMotionFeelRuntime(fake.scene as unknown as ConstructorParameters<typeof StudioMotionFeelRuntime>[0]);
  return { runtime, ...fake };
}

describe("캠퍼스 발밑 재질", () => {
  it("구역 바닥을 먼저 읽고 비었으면 섬 잔디를 읽는다", () => {
    const tilemap = studioVirtualCampusManifest(false).tilemap;
    expect(tilemap).toBeDefined();
    if (!tilemap) return;
    // 로비(대리석) 한가운데
    expect(studioCampusFloorSurface(tilemap, 448, 500)?.surface).toBe("tile");
    // 카페(붉은 나무)
    expect(studioCampusFloorSurface(tilemap, 2688, 420)?.surface).toBe("wood");
    // 토크(카펫)
    expect(studioCampusFloorSurface(tilemap, 448, 1000)?.surface).toBe("carpet");
    // 섬 가장자리 잔디(구역 바닥 없음)
    expect(studioCampusFloorSurface(tilemap, 100, 1500)?.color).toBe(studioCampusFloorSurface(tilemap, 2950, 1500)?.color);
    expect(studioCampusFloorSurface(tilemap, -10, 10)).toBeNull();
    expect(CAMPUS_TERRAIN.marble).toBe(5);
  });

  it("일반 지형은 main 캔버스와 같은 분류를 쓴다", () => {
    expect(studioMotionFeelTerrainSurface("stone").surface).toBe("tile");
    expect(studioMotionFeelTerrainSurface("bridge").surface).toBe("wood");
    expect(studioMotionFeelTerrainSurface("grass").surface).toBe("carpet");
  });
});

describe("이동 게임필 런타임", () => {
  it("달리다 멈추면 먼지·퍼프를 내고 달리기 최고속에서만 잔상을 남긴다", () => {
    const { runtime, bursts, sprites } = runtimeFor();
    const source = sourceSprite();
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { deltaSeconds: 1 / 60, sprintSpeed: 208, depth: 1_500, particleDensity: 1 });
    const ghosts = () => sprites.filter((sprite) => sprite.visible).length;
    // 걷기(160px/s): 달리기 최고속 80% 미만이라 잔상이 없다.
    for (let index = 0; index < 30; index += 1) {
      Object.assign(frame, { time: index * 16, x: 100 + index * 2.6, y: 200, speed: 160, inputSpeed: 160 });
      runtime.step(frame, source as never);
    }
    expect(ghosts()).toBe(0);
    // 달리기(208px/s): 90ms마다 잔상.
    for (let index = 30; index < 60; index += 1) {
      Object.assign(frame, { time: index * 16, x: 100 + index * 3.4, y: 200, speed: 208, inputSpeed: 208 });
      runtime.step(frame, source as never);
    }
    expect(ghosts()).toBeGreaterThan(0);
    const before = bursts.length;
    // 입력을 놓아 급정지: 미끄럼 먼지와 착지 퍼프.
    Object.assign(frame, { time: 1_000, speed: 40, inputSpeed: 0 });
    runtime.step(frame, source as never);
    expect(bursts.length).toBeGreaterThan(before);
    expect(bursts.at(-1)!.tint).toBe(0xe8e4da);
    // 잔상은 수명이 지나면 숨는다.
    Object.assign(frame, { time: 2_000, speed: 0 });
    runtime.step(frame, source as never);
    expect(ghosts()).toBe(0);
  });

  it("모션 줄이기면 아무것도 내지 않는다", () => {
    const { runtime, bursts, sprites } = runtimeFor();
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { deltaSeconds: 1 / 30, sprintSpeed: STUDIO_MOTION_FEEL_REFERENCE_SPRINT, reducedMotion: true });
    for (let index = 0; index < 40; index += 1) {
      Object.assign(frame, { time: index * 33, x: 100 + index * 9, y: 200, speed: index < 30 ? 276 : 0, inputSpeed: index < 30 ? 276 : 0 });
      runtime.step(frame, sourceSprite() as never);
    }
    expect(bursts).toEqual([]);
    expect(sprites.some((sprite) => sprite.visible)).toBe(false);
  });
});
