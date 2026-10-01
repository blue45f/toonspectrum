import { describe, expect, it } from "vitest";

import {
  STUDIO_CHARACTER_SKINS,
  STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS,
  studioCharacterSkinByKey,
  studioProceduralPlayerSkin,
  studioProceduralPlayerSkinHasKey,
  studioProceduralPlayerSkinKeys,
} from "./studio-virtual-space-character-skins";
import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";

function createMockDeps(): ProceduralSheetDeps {
  let counter = 0;
  return {
    createCanvas: (width: number, height: number) => {
      counter += 1;
      const dataUrl = `data:image/png;base64,PLAYER-TEST-${counter}`;
      const calls: string[] = [];
      const ctx = new Proxy({}, {
        get: (_target, prop: string | symbol) => {
          if (prop === "canvas") return undefined;
          return (...args: unknown[]) => { calls.push(`${String(prop)}(${args.length})`); };
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;
      return { width, height, getContext: () => ctx, toDataURL: () => dataUrl } as unknown as HTMLCanvasElement;
    },
  };
}

describe("프로시저럴 플레이어 스킨 레지스트리", () => {
  it("6종 정의를 등록하고 키가 중복되지 않는다", () => {
    expect(STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS).toHaveLength(6);
    const keys = STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS.map((item) => item.key);
    expect(new Set(keys).size).toBe(6);
    expect(keys.every((key) => key.startsWith("procedural-"))).toBe(true);
    for (const item of STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS) {
      expect(item.labelKo.trim().length).toBeGreaterThan(0);
      expect(item.labelEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("기존 STUDIO_CHARACTER_SKINS의 해시 분배를 바꾸지 않는다", () => {
    expect(STUDIO_CHARACTER_SKINS.some((skin) => skin.key.startsWith("procedural-"))).toBe(false);
    expect(studioCharacterSkinByKey("procedural-mint").key).not.toBe("procedural-mint");
  });

  it("스킨을 지연 생성하고 캐시한다", () => {
    const deps = createMockDeps();
    const skin = studioProceduralPlayerSkin("procedural-mint", deps);
    expect(skin?.key).toBe("procedural-mint");
    expect(skin?.labelKo).toBe("민트");
    expect(skin?.sharedAtlas).toBe(true);
    expect(skin?.directional.down.startsWith("data:image/png;base64,")).toBe(true);
    expect(studioProceduralPlayerSkin("procedural-mint", deps)).toBe(skin);
  });

  it("6종 모두 dataURL 텍스처로 생성된다", () => {
    const deps = createMockDeps();
    for (const key of studioProceduralPlayerSkinKeys()) {
      const skin = studioProceduralPlayerSkin(key, deps);
      expect(skin, key).toBeDefined();
      expect(skin?.directional.down.startsWith("data:image/png;base64,"), key).toBe(true);
      // idle 정지 프레임은 걷기 클립 범위 안에 있어야 한다.
      const clip = skin?.clips?.["walk-down"];
      expect(skin?.idleFrames?.down, key).toBe(clip?.start);
    }
  });

  it("없는 키는 undefined, hasKey는 false다", () => {
    const deps = createMockDeps();
    expect(studioProceduralPlayerSkin("unknown", deps)).toBeUndefined();
    expect(studioProceduralPlayerSkinHasKey("procedural-rose")).toBe(true);
    expect(studioProceduralPlayerSkinHasKey("pink")).toBe(false);
    expect(studioProceduralPlayerSkinHasKey("unknown")).toBe(false);
  });
});
