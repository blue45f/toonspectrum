import { describe, expect, it } from "vitest";
import { studioCharacterAtlasGridFrames, studioCharacterAtlasSheetMatches, type StudioCharacterAtlasLayout } from "./studio-virtual-space-character-atlas";
import { studioCharacterActionFrame, studioCharacterActionSheetMatches, studioCharacterPoseSheetMatches, studioCharacterStaticAsset, studioCharacterStaticSheetMatches, studioCharacterTextureSheetMatches, studioCharacterVisualAssets } from "./studio-virtual-space-character-assets";
import { studioCharacterSkinForArtStyle, type StudioCharacterAtlasClip, type StudioCharacterFramePresentation, type StudioCharacterSkin } from "./studio-virtual-space-character-skins";

const atlas: StudioCharacterAtlasLayout = { width: 1254, height: 1024, columns: 8, rows: 4, slicing: "rounded-grid" };
const frame: StudioCharacterFramePresentation = { originX: .5, originY: .95, displayHeightRatio: .96, seatOriginY: .82 };
const clip: StudioCharacterAtlasClip = {
  textureUrl: "/assets/virtual-studio/test-theme.png", frameWidth: atlas.width / 8, frameHeight: atlas.height / 4,
  atlas, start: 16, end: 19, frameRate: 8, distancePerCycle: 76, technique: "drawn", frames: [frame, frame, frame, frame],
};
const skin: StudioCharacterSkin = {
  key: "theme-avatar-retro", labelKo: "레트로 여행자", labelEn: "Retro Traveler", selectionOnly: true, nativeArtStyle: "retro",
  directional: { down: clip.textureUrl, right: clip.textureUrl, left: clip.textureUrl, up: clip.textureUrl },
  clips: { "walk-left": clip }, idleFrames: { left: 16 },
  actions: { talk: { down: { ...clip, start: 4, end: 4 }, right: { ...clip, start: 12, end: 12 }, left: { ...clip, start: 20, end: 20 }, up: { ...clip, start: 28, end: 28 } } },
  poses: { wave: {
    textureUrl: clip.textureUrl, frameWidth: clip.frameWidth, frameHeight: clip.frameHeight, atlas,
    directionFrames: { down: 5, right: 13, left: 21, up: 29 }, frames: Array.from({ length: 32 }, () => frame),
  } },
};

describe("독립 테마 캐릭터의 명시적 atlas 격자", () => {
  it("간격이 불균등한 원본의 머리와 발을 균등 셀로 잘라내지 않는다", () => {
    const frames = studioCharacterAtlasGridFrames(atlas).map((cell) => ({ ...cell, x: cell.x + 2, width: cell.width - 4 }));
    frames[8] = { index: 8, x: 12, y: 250, width: 120, height: 260 };
    const explicit = { ...atlas, slicing: "explicit-frames", frames } as const;
    expect(studioCharacterAtlasGridFrames(explicit)[8]).toEqual(frames[8]);
    expect(studioCharacterAtlasSheetMatches({ ...clip, atlas: explicit }, 1254, 1024)).toBe(true);
    for (const invalid of [
      { ...explicit, frames: frames.slice(1) },
      { ...explicit, frames: frames.map((cell) => ({ ...cell, x: -1 })) },
      { ...explicit, frames: frames.map((cell) => ({ ...cell, height: 2000 })) },
      { ...explicit, frames: frames.map((cell) => ({ ...cell, index: 0 })) },
    ]) {
      expect(studioCharacterAtlasGridFrames(invalid)).toEqual([]);
      expect(studioCharacterAtlasSheetMatches({ ...clip, atlas: invalid }, 1254, 1024)).toBe(false);
    }
  });
  it.each([[1254, 1024], [1536, 1024], [1254, 1254]])("%d×%d 원본을 겹치거나 버리는 픽셀 없이 8×4 정수 셀로 나눈다", (width, height) => {
    const frames = studioCharacterAtlasGridFrames({ ...atlas, width, height });
    expect(frames).toHaveLength(32);
    expect(frames.map((cell) => cell.index)).toEqual(Array.from({ length: 32 }, (_, index) => index));
    let area = 0;
    for (const [index, cell] of frames.entries()) {
      expect(Object.values(cell).every(Number.isSafeInteger)).toBe(true);
      expect(cell.width).toBeGreaterThan(0);
      expect(cell.height).toBeGreaterThan(0);
      expect(cell.x).toBe(index % 8 === 0 ? 0 : (frames[index - 1]?.x ?? 0) + (frames[index - 1]?.width ?? 0));
      if (index % 8 === 7) expect(cell.x + cell.width).toBe(width);
      expect(cell.y).toBe(index < 8 ? 0 : (frames[index - 8]?.y ?? 0) + (frames[index - 8]?.height ?? 0));
      if (index >= 24) expect(cell.y + cell.height).toBe(height);
      area += cell.width * cell.height;
    }
    expect(area).toBe(width * height);
  });

  it("실제 치수와 명시적 격자·평균 셀 크기를 모두 검증한다", () => {
    expect(studioCharacterActionSheetMatches(clip, 1254, 1024)).toBe(true);
    expect(studioCharacterActionSheetMatches(clip, 1255, 1024)).toBe(false);
    expect(studioCharacterActionSheetMatches({ ...clip, frameWidth: 157 }, 1254, 1024)).toBe(false);
    expect(studioCharacterActionSheetMatches({ ...clip, atlas: { ...atlas, columns: 4 } }, 1254, 1024)).toBe(false);
    expect(studioCharacterActionSheetMatches({ ...clip, start: 31, end: 32 }, 1254, 1024)).toBe(false);
    expect(studioCharacterActionSheetMatches({ ...clip, start: -1 }, 1254, 1024)).toBe(false);
    expect(studioCharacterActionSheetMatches({ ...clip, start: 20, end: 19 }, 1254, 1024)).toBe(false);
  });

  it.each([
    { columns: 0 }, { rows: -1 }, { columns: 1.5 }, { width: NaN }, { height: Infinity },
    { width: 4 }, { rows: 128 },
  ])("잘못된 격자를 로더에 넘기지 않는다: %j", (invalid) => {
    const malformed = { ...atlas, ...invalid };
    expect(studioCharacterAtlasGridFrames(malformed)).toEqual([]);
    expect(studioCharacterAtlasSheetMatches({ ...clip, atlas: malformed }, malformed.width, malformed.height)).toBe(false);
  });

  it("2×2 원본과 검수된 1픽셀 여백 계약을 유지한다", () => {
    const legacy = { frameWidth: 160, frameHeight: 160 };
    expect(studioCharacterAtlasSheetMatches(legacy, 320, 320)).toBe(true);
    expect(studioCharacterAtlasSheetMatches(legacy, 640, 160)).toBe(false);
    const padded = { ...legacy, atlas: { width: 321, height: 320, remainder: { right: 1, bottom: 0, maxAlpha: 1, nonzeroAlphaPixels: 1 } } } as const;
    expect(studioCharacterAtlasSheetMatches(padded, 321, 320)).toBe(true);
    expect(studioCharacterAtlasSheetMatches(padded, 320, 320)).toBe(false);
    expect(studioCharacterAtlasGridFrames(padded.atlas)).toEqual([]);
  });

  it("걷기·정지·대화·인사에 원본 atlas와 실제 프레임 번호를 전달한다", () => {
    const idle = studioCharacterStaticAsset(skin, "left");
    expect(idle).toMatchObject({ frame: 16, atlas, frameWidth: 156.75, frameHeight: 256, type: "spritesheet" });
    expect(studioCharacterStaticSheetMatches(idle, 1254, 1024)).toBe(true);
    expect(studioCharacterStaticSheetMatches({ ...idle, frame: 32 }, 1254, 1024)).toBe(false);
    expect(studioCharacterStaticSheetMatches(idle, 1254, 1023)).toBe(false);
    expect(studioCharacterVisualAssets(skin, "left", "walk")).toEqual([idle]);
    for (const state of ["talk", "wave"] as const) {
      const assets = studioCharacterVisualAssets(skin, "left", state);
      expect(assets).toHaveLength(2);
      for (const asset of assets) {
        expect(asset.atlas).toEqual(atlas);
        expect(studioCharacterTextureSheetMatches(asset, 1254, 1024)).toBe(true);
      }
    }
    expect([0, 125, 250, 375, 500].map((time) => studioCharacterActionFrame(clip, time, false))).toEqual([16, 17, 18, 19, 16]);
    expect(studioCharacterActionFrame(clip, 375, true)).toBe(16);
  });

  it("큰 atlas의 방향별 정지 포즈는 선언된 프레임과 표시 좌표가 모두 있을 때만 허용한다", () => {
    const pose = skin.poses?.wave;
    if (!pose) throw new Error("테스트 포즈 누락");
    expect(studioCharacterPoseSheetMatches(pose, 1254, 1024)).toBe(true);
    expect(studioCharacterPoseSheetMatches(pose, 1254, 1023)).toBe(false);
    expect(studioCharacterPoseSheetMatches({ ...pose, directionFrames: { ...pose.directionFrames, up: 32 } }, 1254, 1024)).toBe(false);
    expect(studioCharacterPoseSheetMatches({ ...pose, frames: [frame] }, 1254, 1024)).toBe(false);
  });

  it("독립 캐릭터는 다른 공간 테마를 선택해도 원본 작화와 identity를 유지한다", () => {
    expect(studioCharacterSkinForArtStyle(skin, "sky-island")).toBe(skin);
    expect(studioCharacterSkinForArtStyle(skin, "ink")).toBe(skin);
  });
});
