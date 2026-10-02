import type * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import {
  buildStudioAmbientPatrolObstacles,
  buildStudioAmbientPatrolSpecs,
  studioAmbientAnimalFrame,
  studioAmbienceCondition,
  studioWeatherParticleRenderStyle,
  StudioVirtualAmbienceRenderRuntime,
  type StudioAmbienceRenderUpdateInput,
} from "./studio-virtual-space-ambience-render";
import type { StudioParticle } from "./studio-virtual-space-particles";
import type { StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  type StudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-manifest";

describe("studioAmbienceCondition", () => {
  it("비와 눈은 파티클과 순찰 대피를 함께 켠다", () => {
    expect(studioAmbienceCondition("rain")).toEqual({ particles: "rain", patrol: "rain" });
    expect(studioAmbienceCondition("snow")).toEqual({ particles: "snow", patrol: "snow" });
  });

  it("벚꽃잎은 파티클만 내고 순찰 배우를 대피시키지 않는다", () => {
    expect(studioAmbienceCondition("petals")).toEqual({ particles: "petals", patrol: null });
  });

  it("맑음과 알 수 없는 값은 둘 다 끈다", () => {
    expect(studioAmbienceCondition("clear")).toEqual({ particles: null, patrol: null });
    expect(studioAmbienceCondition("")).toEqual({ particles: null, patrol: null });
  });
});

describe("studioWeatherParticleRenderStyle", () => {
  const drop: StudioParticle = {
    id: 1, kind: "raindrop", x: 10, y: 20, vx: -40, vy: 600,
    ageMs: 0, lifeMs: 1200, size: 6, rotation: 2.4, spin: 0,
  };

  it("등장 직후에는 투명하고 페이드인 뒤 또렷해진다", () => {
    expect(studioWeatherParticleRenderStyle(drop).alpha).toBe(0);
    expect(studioWeatherParticleRenderStyle({ ...drop, ageMs: 300 }).alpha).toBeCloseTo(0.9);
  });

  it("소멸 직전에는 페이드아웃한다", () => {
    const style = studioWeatherParticleRenderStyle({ ...drop, ageMs: 1150 });
    expect(style.alpha).toBeLessThan(0.1);
    expect(style.alpha).toBeGreaterThan(0);
  });

  it("프레임은 경과 시간으로 순환하고 빗방울 회전은 기울기로 고정한다", () => {
    expect(studioWeatherParticleRenderStyle({ ...drop, ageMs: 0 }).frame).toBe(0);
    expect(studioWeatherParticleRenderStyle({ ...drop, ageMs: 130 }).frame).toBe(1);
    expect(studioWeatherParticleRenderStyle({ ...drop, ageMs: 260 }).frame).toBe(0);
    expect(studioWeatherParticleRenderStyle({ ...drop, ageMs: 500 }).rotation).toBe(-0.22);
  });

  it("크기는 파티클 크기에 비례하고 꽃잎은 엔진 회전을 쓴다", () => {
    expect(studioWeatherParticleRenderStyle(drop).displaySize).toBeCloseTo(10.8);
    const petal = studioWeatherParticleRenderStyle({
      ...drop, kind: "petal", ageMs: 300, lifeMs: 5000, rotation: 1.1,
    });
    expect(petal.rotation).toBe(1.1);
    expect(petal.frame).toBe(2); // 꽃잎 3프레임: floor(300/130)=2
  });
});

describe("studioAmbientAnimalFrame", () => {
  it("아래를 보며 걸으면 정면 행 걷기 프레임이 순환한다", () => {
    expect(studioAmbientAnimalFrame({ spriteDirection: "down", moving: true }, 0, false)).toEqual({ frame: 0, flipX: false });
    expect(studioAmbientAnimalFrame({ spriteDirection: "down", moving: true }, 140, false).frame).toBe(1);
    expect(studioAmbientAnimalFrame({ spriteDirection: "down", moving: true }, 560, false).frame).toBe(0);
  });

  it("위를 보면 후면 행, 옆을 보면 측면 행을 쓴다", () => {
    expect(studioAmbientAnimalFrame({ spriteDirection: "up", moving: false }, 0, false).frame).toBe(7 + 4);
    expect(studioAmbientAnimalFrame({ spriteDirection: "right", moving: true }, 0, false)).toEqual({ frame: 14, flipX: false });
    expect(studioAmbientAnimalFrame({ spriteDirection: "up-left", moving: true }, 0, false).frame).toBe(7);
  });

  it("왼쪽을 향하면 측면 행을 좌우 반전한다", () => {
    expect(studioAmbientAnimalFrame({ spriteDirection: "left", moving: true }, 0, false)).toEqual({ frame: 14, flipX: true });
  });

  it("reduced-motion이면 idle 첫 프레임으로 고정한다", () => {
    expect(studioAmbientAnimalFrame({ spriteDirection: "down", moving: true }, 5000, true)).toEqual({ frame: 4, flipX: false });
    expect(studioAmbientAnimalFrame({ spriteDirection: "left", moving: true }, 5000, true)).toEqual({ frame: 18, flipX: true });
  });
});

describe("buildStudioAmbientPatrolSpecs", () => {
  it("기본 월드는 가이드 NPC와 동물 5종을 만들고 모든 지점이 월드 안에 있다", () => {
    const specs = buildStudioAmbientPatrolSpecs(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(specs.map((spec) => spec.species)).toEqual(["npc", "cat", "fox", "rabbit", "bird", "butterfly"]);
    for (const spec of specs) {
      expect(spec.route.length).toBeGreaterThanOrEqual(3);
      for (const point of spec.route) {
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(DEFAULT_STUDIO_WORLD_MANIFEST.width);
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(DEFAULT_STUDIO_WORLD_MANIFEST.height);
      }
    }
  });

  it("웨이포인트가 분수와 카페 테이블 콜라이더 안에 들어가지 않는다", () => {
    const blockers = [
      { x: 746, y: 671, width: 68, height: 68 },   // 크리에이터 플라자 분수
      { x: 421, y: 652, width: 116, height: 34 },  // 카페 커뮤니티 테이블
    ];
    for (const spec of buildStudioAmbientPatrolSpecs(DEFAULT_STUDIO_WORLD_MANIFEST)) {
      for (const point of spec.route) {
        for (const rect of blockers) {
          const inside = point.x > rect.x && point.x < rect.x + rect.width
            && point.y > rect.y && point.y < rect.y + rect.height;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it("타일맵 월드는 방 중심에서 경로를 파생하고 방이 없으면 배우가 없다", () => {
    const tilemap = {
      orientation: "orthogonal", renderOrder: "right-down", width: 12, height: 8, tileWidth: 32, tileHeight: 32,
      tilesets: [], layers: [],
    } as unknown as StudioVirtualSpaceWorldManifest["tilemap"];
    const withRooms: StudioVirtualSpaceWorldManifest = { ...DEFAULT_STUDIO_WORLD_MANIFEST, tilemap };
    const specs = buildStudioAmbientPatrolSpecs(withRooms);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs[0]!.species).toBe("npc");
    const noRooms: StudioVirtualSpaceWorldManifest = { ...DEFAULT_STUDIO_WORLD_MANIFEST, tilemap, rooms: [] };
    expect(buildStudioAmbientPatrolSpecs(noRooms)).toEqual([]);
  });
});

describe("buildStudioAmbientPatrolObstacles", () => {
  it("매니페스트 콜라이더를 rect 장애물로 그대로 옮긴다", () => {
    const obstacles = buildStudioAmbientPatrolObstacles(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(obstacles.length).toBe(DEFAULT_STUDIO_WORLD_MANIFEST.colliders.length);
    expect(obstacles[0]).toEqual({ kind: "rect", ...DEFAULT_STUDIO_WORLD_MANIFEST.colliders[0] });
  });
});

/* ---------------- 런타임 하네스 ---------------- */

class MockSprite {
  x: number; y: number; frame: number; alpha = 1; visible = true; rotation = 0; flipX = false;
  destroyed = false;
  readonly data = new Map<string, unknown>();
  constructor(x: number, y: number, readonly texture: string, frame?: number) {
    this.x = x; this.y = y; this.frame = frame ?? 0;
  }
  setOrigin() { return this; }
  setData(key: string | Record<string, unknown>, value?: unknown) {
    if (typeof key === "string") this.data.set(key, value);
    else for (const [name, item] of Object.entries(key)) this.data.set(name, item);
    return this;
  }
  getData(key: string) { return this.data.get(key); }
  setDisplaySize() { return this; }
  setDepth() { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setFrame(frame: number) { this.frame = frame; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setRotation(rotation: number) { this.rotation = rotation; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setFlipX(flipX: boolean) { this.flipX = flipX; return this; }
  destroy() { this.destroyed = true; }
}

class MockEllipse {
  visible = true; destroyed = false;
  constructor(public x: number, public y: number) {}
  setDepth() { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  destroy() { this.destroyed = true; }
}

function harness() {
  const sprites: MockSprite[] = [];
  const ellipses: MockEllipse[] = [];
  const scene = {
    textures: { exists: () => true },
    add: {
      sprite: (x: number, y: number, texture: string, frame?: number) => {
        const sprite = new MockSprite(x, y, texture, frame); sprites.push(sprite); return sprite;
      },
      ellipse: (x: number, y: number) => {
        const ellipse = new MockEllipse(x, y); ellipses.push(ellipse); return ellipse;
      },
    },
  } as unknown as Pick<Phaser.Scene, "add" | "textures">;
  const applyVisual = vi.fn();
  const runtime = new StudioVirtualAmbienceRenderRuntime(scene, DEFAULT_STUDIO_WORLD_MANIFEST, {
    skin: { key: "npc-guide" } as unknown as StudioCharacterSkin,
    textureKey: "npc-guide-texture",
    textureFrame: 0,
    visualWidth: 66,
    visualHeight: 88,
    applyVisual,
  });
  const input = (overrides: Partial<StudioAmbienceRenderUpdateInput> = {}): StudioAmbienceRenderUpdateInput => ({
    time: 0, deltaMs: 50,
    viewport: { x: 0, y: 0, width: 1280, height: 960 },
    condition: null, particleRatio: 1, reducedMotion: false,
    patrolWeather: null, timeOfDay: 0.5,
    players: [{ x: 640, y: 500 }],
    ambientActorsEnabled: true,
    ...overrides,
  });
  return { runtime, sprites, ellipses, applyVisual, input };
}

describe("StudioVirtualAmbienceRenderRuntime", () => {
  it("생성하면 순찰 배우 6명의 스프라이트와 지상 배우 4명의 그림자가 생긴다", () => {
    const h = harness();
    expect(h.runtime.actorCount).toBe(6);
    expect(h.ellipses).toHaveLength(4); // NPC·고양이·여우·토끼 (새·나비는 그림자 없음)
    h.runtime.destroy();
  });

  it("비가 오면 빗방울 스프라이트가 목표 개수만큼 생기고 맑아지면 전부 정리된다", () => {
    const h = harness();
    h.runtime.update(h.input({ condition: "rain", time: 0 }));
    expect(h.runtime.weatherSpriteCount).toBe(320);
    const rainSprites = h.sprites.filter((sprite) => sprite.texture === "studio-weather-particle-raindrop");
    expect(rainSprites).toHaveLength(320);
    h.runtime.update(h.input({ condition: "rain", time: 100 }));
    expect(h.runtime.weatherSpriteCount).toBe(320); // 풀이 유지되고 중복 생성되지 않는다
    h.runtime.update(h.input({ condition: null, time: 200 }));
    expect(h.runtime.weatherSpriteCount).toBe(0);
    expect(rainSprites.every((sprite) => sprite.destroyed)).toBe(true);
    h.runtime.destroy();
  });

  it("reduced-motion이면 날씨 파티클을 만들지 않는다", () => {
    const h = harness();
    h.runtime.update(h.input({ condition: "snow", reducedMotion: true }));
    expect(h.runtime.weatherSpriteCount).toBe(0);
    h.runtime.destroy();
  });

  it("품질 비율이 낮으면 파티클 수도 비례해 줄어든다", () => {
    const h = harness();
    h.runtime.update(h.input({ condition: "petals", particleRatio: 0.5 }));
    expect(h.runtime.weatherSpriteCount).toBe(70);
    h.runtime.destroy();
  });

  it("순찰 배우가 시간이 지나면 집을 떠나 실제로 이동한다", () => {
    const h = harness();
    const cat = h.sprites.find((sprite) => sprite.texture === "studio-ambient-animal-cat")!;
    const start = { x: cat.x, y: cat.y };
    for (let step = 0; step < 120; step += 1) {
      h.runtime.update(h.input({ time: step * 50 }));
    }
    expect(Math.hypot(cat.x - start.x, cat.y - start.y)).toBeGreaterThan(10);
    h.runtime.destroy();
  });

  it("NPC 배우는 캔버스 비주얼 적용 함수를 스킨·모션 상태와 함께 호출한다", () => {
    const h = harness();
    h.runtime.update(h.input({ time: 0 }));
    expect(h.applyVisual).toHaveBeenCalled();
    const [, skin, , state] = h.applyVisual.mock.calls[0]!;
    expect((skin as StudioCharacterSkin).key).toBe("npc-guide");
    expect(["idle", "walk"]).toContain(state);
    h.runtime.destroy();
  });

  it("앰비언트 배우가 꺼진 등급에서는 배우를 숨긴다", () => {
    const h = harness();
    h.runtime.update(h.input({ ambientActorsEnabled: false }));
    const actors = h.sprites.filter((sprite) => sprite.texture.startsWith("studio-ambient-animal"));
    expect(actors.length).toBeGreaterThan(0);
    expect(actors.every((sprite) => !sprite.visible)).toBe(true);
    h.runtime.destroy();
  });

  it("destroy하면 만든 스프라이트와 그림자를 전부 해제한다", () => {
    const h = harness();
    h.runtime.update(h.input({ condition: "rain" }));
    h.runtime.destroy();
    expect(h.sprites.every((sprite) => sprite.destroyed)).toBe(true);
    expect(h.ellipses.every((ellipse) => ellipse.destroyed)).toBe(true);
    expect(h.runtime.weatherSpriteCount).toBe(0);
    expect(h.runtime.actorCount).toBe(0);
  });
});
