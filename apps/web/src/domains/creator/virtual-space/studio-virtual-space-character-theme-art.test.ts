import { describe, expect, it } from "vitest";
import { createStudioThemeCharacterSkin, type StudioThemeCharacterSource } from "./studio-virtual-space-character-theme-art";
import { StudioCharacterAssetResidency, studioCharacterActionFrame, studioCharacterActionSheetMatches, studioCharacterPoseSheetMatches, studioCharacterStaticAsset, studioCharacterVisualAssets, type StudioCharacterTextureAsset } from "./studio-virtual-space-character-assets";
import { studioCharacterActionClip, studioCharacterSkinForArtStyle, studioCharacterWalkClip } from "./studio-virtual-space-character-skins";

const source: StudioThemeCharacterSource = {
  artStyle: "retro", labelKo: "레트로 여행자", labelEn: "Retro Traveler",
  textureUrl: "/assets/virtual-studio/test-retro.png", width: 1254, height: 1024,
  frames: Array.from({ length: 32 }, (_, index) => ({ originX: .5, originY: .91 + index * .001, displayHeightRatio: .96, seatOriginY: .8 })),
};

describe("8×4 독립 테마 캐릭터의 자세 연결", () => {
  it.each([["down", 0], ["right", 8], ["left", 16], ["up", 24]] as const)("%s 방향의 걷기·대화·좌석·작업을 한 원본의 올바른 행에서 선택한다", (facing, offset) => {
    const skin = createStudioThemeCharacterSkin(source);
    const walk = studioCharacterWalkClip(skin, facing);
    if (!walk) throw new Error("걷기 fixture 누락");
    expect(walk).toMatchObject({ start: offset, end: offset + 3, textureUrl: source.textureUrl });
    expect(walk.frames).toEqual(source.frames.slice(offset, offset + 4));
    expect(studioCharacterStaticAsset(skin, facing)).toMatchObject({ frame: offset, type: "spritesheet", url: source.textureUrl });
    expect(studioCharacterVisualAssets(skin, facing, "walk")).toHaveLength(1);
    expect(studioCharacterActionSheetMatches(walk, source.width, source.height)).toBe(true);
    for (const [state, column] of [["talk", 4], ["draw", 7], ["review", 7]] as const) {
      const action = studioCharacterActionClip(skin, facing, state);
      if (!action) throw new Error("작업 fixture 누락");
      expect(action).toMatchObject({ start: offset + column, end: offset + column });
      expect(action.frames).toEqual([source.frames[offset + column]]);
      expect(studioCharacterActionFrame(action, 50_000, false)).toBe(offset + column);
      expect(studioCharacterActionSheetMatches(action, source.width, source.height)).toBe(true);
    }
    for (const [state, column] of [["wave", 5], ["sit", 6]] as const) {
      const pose = skin.poses?.[state];
      if (!pose) throw new Error("포즈 fixture 누락");
      expect(pose.directionFrames[facing]).toBe(offset + column);
      expect(pose.frames[offset + column]).toEqual(source.frames[offset + column]);
      expect(studioCharacterPoseSheetMatches(pose, source.width, source.height)).toBe(true);
    }
  });

  it("선택 전용 스킨으로 유지하고 공간 테마가 바뀌어도 다른 작화로 변환하지 않는다", () => {
    const skin = createStudioThemeCharacterSkin(source);
    expect(skin).toMatchObject({ key: "theme-avatar-retro", selectionOnly: true, nativeArtStyle: "retro" });
    expect(studioCharacterSkinForArtStyle(skin, "pastel")).toBe(skin);
    expect(Object.isFrozen(skin.clips?.["walk-down"]?.frames)).toBe(true);
  });

  it("4방향과 모든 행동이 한 텍스처를 공유하고 해제할 animation을 함께 제공한다", () => {
    const skin = createStudioThemeCharacterSkin(source);
    const keys = new Set<string>();
    const loads: StudioCharacterTextureAsset[] = [];
    const removed: StudioCharacterTextureAsset[] = [];
    let now = 0;
    const residency = new StudioCharacterAssetResidency({
      has: () => false,
      load: (asset, complete) => { loads.push(asset); complete(true); return () => undefined; },
      remove: (asset) => { removed.push(asset); },
    }, () => now, 10);
    for (const facing of ["down", "right", "left", "up"] as const) {
      for (const state of ["idle", "walk", "talk", "wave", "sit", "draw", "review"] as const) {
        const assets = studioCharacterVisualAssets(skin, facing, state);
        residency.use("self", assets);
        expect(assets).toHaveLength(1);
        for (const asset of assets) {
          keys.add(asset.key);
          expect(asset.animationKeys).toEqual(["down", "right", "left", "up"].map((direction) => `studio-player-theme-avatar-retro-walk-animation-${direction}`));
        }
      }
    }
    expect([...keys]).toEqual(["studio-player-theme-avatar-retro-atlas"]);
    expect(loads).toHaveLength(1);
    residency.release("self");
    now = 11;
    residency.collect();
    expect(removed).toEqual(loads);
    expect(removed[0]?.animationKeys).toHaveLength(4);
    residency.close();
  });

  it("검수되지 않은 원본 크기나 표시 좌표는 등록하지 않는다", () => {
    expect(() => createStudioThemeCharacterSkin({ ...source, width: NaN })).toThrow();
    expect(() => createStudioThemeCharacterSkin({ ...source, frames: source.frames.slice(0, 31) })).toThrow();
    expect(() => createStudioThemeCharacterSkin({ ...source, frames: source.frames.map((frame) => ({ ...frame, displayHeightRatio: 0 })) })).toThrow();
  });
});
