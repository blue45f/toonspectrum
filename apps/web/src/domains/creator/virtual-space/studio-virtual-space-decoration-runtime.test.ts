import { describe, expect, it, vi } from "vitest";

import { StudioVirtualDecorationRuntime } from "./studio-virtual-space-decoration-runtime";
import type { StudioVirtualDecorationState } from "./studio-virtual-space-customization";

/**
 * 이 런타임이 실제로 중요한 성질은 두 가지다.
 *
 * 1. 아틀라스 가구는 기존 프레임 경로를 그대로 탄다. (회귀 방지)
 * 2. 커스텀 가구는 아틀라스 키를 건드리지 않고 자기 텍스처를 쓰고, 아직 로드되지
 *    않았으면 아예 그리지 않는다.
 *
 * 아틀라스 키 계약(테마별 키가 아틀라스 전체를 가리켜야 한다)이 깨지면 이전 테마의
 * 사각형이 남는다. 그래서 1번을 여기서 다시 확인한다.
 */
function fakeSprite(texture: string, frame: number) {
  return {
    texture: { key: texture },
    frame,
    x: 0,
    y: 0,
    depth: 0,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    data: new Map<string, unknown>(),
    destroyed: false,
    setDisplaySize: vi.fn().mockReturnThis(),
    setAngle: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis().mockReturnThis(),
    setData(key: string, value: unknown) { this.data.set(key, value); return this; },
    getData(key: string) { return this.data.get(key); },
    setFrame: vi.fn().mockReturnThis(),
    setTexture: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setTint: vi.fn().mockReturnThis(),
    destroy() { this.destroyed = true; },
  };
}

function fakeScene(loaded: readonly string[]) {
  const sprites: ReturnType<typeof fakeSprite>[] = [];
  return {
    textures: { exists: (key: string) => loaded.includes(key) },
    add: {
      sprite: (x: number, y: number, texture: string, frame: number) => {
        const sprite = fakeSprite(texture, frame);
        sprite.x = x;
        sprite.y = y;
        sprites.push(sprite);
        return sprite;
      },
      // 나무 같은 가구는 발밑 충돌 영역을 가진다. 그 경로도 최소한만 흉내 낸다.
      zone: (x: number, y: number) => ({
        x,
        y,
        setOrigin: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      }),
    },
    physics: {
      add: {
        existing: vi.fn(),
        collider: vi.fn().mockReturnValue({ destroy: vi.fn() }),
      },
    },
    sprites,
  };
}

const DECOR_KEY = "studio-experience-v8-decor";
const ATLAS_KEY = "studio-experience-v8-furniture-pastel";
const CUSTOM_KEY = "studio-virtual-custom-furniture-asset-1";

function state(placements: StudioVirtualDecorationState["placements"][number][]): StudioVirtualDecorationState {
  return {
    presetKey: "minimal",
    districtKey: "story-terrace",
    presentationMode: "minimal",
    placements,
    revision: 1,
    layoutWidth: 1280,
    layoutHeight: 960,
  } as StudioVirtualDecorationState;
}

const player = { destroy: vi.fn() };

describe("custom furniture rendering", () => {
  it("uses the asset's own texture, never an atlas frame", () => {
    const scene = fakeScene([DECOR_KEY, CUSTOM_KEY]);
    const runtime = new StudioVirtualDecorationRuntime(scene as never, player as never, {
      decor: DECOR_KEY,
      accessory: "accessory",
      customFurniture: { "asset-1": CUSTOM_KEY },
    });

    runtime.syncDecorations(state([
      { id: "c1", type: "custom", assetId: "asset-1", x: 10, y: 20, rotation: 0, scale: 1 },
    ]));

    expect(scene.sprites).toHaveLength(1);
    expect(scene.sprites[0]!.texture.key).toBe(CUSTOM_KEY);
    expect(scene.sprites[0]!.texture.key).not.toBe(ATLAS_KEY);
  });

  it("draws nothing when the asset texture has not finished loading", () => {
    // 아틀라스 번호로 대신 그리면 엉뚱한 가구가 서게 되므로, 아예 그리지 않는다.
    const scene = fakeScene([DECOR_KEY]);
    const runtime = new StudioVirtualDecorationRuntime(scene as never, player as never, {
      decor: DECOR_KEY,
      accessory: "accessory",
      customFurniture: { "asset-1": CUSTOM_KEY },
    });

    runtime.syncDecorations(state([
      { id: "c1", type: "custom", assetId: "asset-1", x: 10, y: 20, rotation: 0, scale: 1 },
    ]));

    expect(scene.sprites).toHaveLength(0);
  });

  it("draws nothing for a custom placement with no asset mapping at all", () => {
    const scene = fakeScene([DECOR_KEY, CUSTOM_KEY]);
    const runtime = new StudioVirtualDecorationRuntime(scene as never, player as never, {
      decor: DECOR_KEY,
      accessory: "accessory",
    });

    runtime.syncDecorations(state([
      { id: "c1", type: "custom", x: 10, y: 20, rotation: 0, scale: 1 },
    ]));

    expect(scene.sprites).toHaveLength(0);
  });

  it("keeps atlas furniture on its own texture and custom on its own, side by side", () => {
    const scene = fakeScene([DECOR_KEY, ATLAS_KEY, CUSTOM_KEY]);
    const runtime = new StudioVirtualDecorationRuntime(scene as never, player as never, {
      decor: DECOR_KEY,
      accessory: "accessory",
      furniture: ATLAS_KEY,
      artStyle: "pastel",
      customFurniture: { "asset-1": CUSTOM_KEY },
    });

    // 프레임 번호가 12 미만인 종류(나무, 벤치 등)는 decor 텍스처를, 12 이상인 종류
    // (소파, 책장 등)는 furniture 아틀라스를 쓴다. 이 구분을 바꾸면 안 된다.
    runtime.syncDecorations(state([
      { id: "tree-1", type: "tree", x: 10, y: 20, rotation: 0, scale: 1 },
      { id: "sofa-1", type: "sofa", x: 20, y: 30, rotation: 0, scale: 1 },
      { id: "c1", type: "custom", assetId: "asset-1", x: 30, y: 40, rotation: 0, scale: 1 },
    ]));

    const byTexture = Object.fromEntries(
      scene.sprites.map((s) => [s.getData("decorType") as string, s.texture.key]),
    );
    expect(byTexture.tree).toBe(DECOR_KEY);
    expect(byTexture.sofa).toBe(ATLAS_KEY);
    expect(byTexture.custom).toBe(CUSTOM_KEY);
  });

  it("never rewrites an atlas sprite onto a custom texture on refresh", () => {
    // refreshTextures 는 아틀라스 지도를 다시 계산한다. 커스텀은 assetId 가 있어야
    // 같은 텍스처로 되돌아갈 수 있다. assetId 를 잃으면 아틀라스 번호로 흘러간다.
    const scene = fakeScene([DECOR_KEY, ATLAS_KEY, CUSTOM_KEY]);
    const runtime = new StudioVirtualDecorationRuntime(scene as never, player as never, {
      decor: DECOR_KEY,
      accessory: "accessory",
      furniture: ATLAS_KEY,
      artStyle: "pastel",
      customFurniture: { "asset-1": CUSTOM_KEY },
    });

    runtime.syncDecorations(state([
      { id: "c1", type: "custom", assetId: "asset-1", x: 10, y: 20, rotation: 0, scale: 1 },
    ]));
    const sprite = scene.sprites[0]!;

    runtime.refreshTextures();

    expect(sprite.setTexture).not.toHaveBeenCalled();
  });
});
