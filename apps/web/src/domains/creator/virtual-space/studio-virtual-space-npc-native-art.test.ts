import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import measurements from "./studio-virtual-space-npc-native-art.json";
import { STUDIO_NATIVE_NPC_KEYS } from "./studio-virtual-space-npc-native-art";
import { studioNpcCastSkinByKey } from "./studio-virtual-space-npc-cast";
import { StudioCharacterAssetResidency, studioCharacterActionSheetMatches, studioCharacterPoseSheetMatches, studioCharacterStaticAsset, studioCharacterStaticSheetMatches, studioCharacterVisualAssets } from "./studio-virtual-space-character-assets";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { studioCharacterActionClip, studioCharacterWalkClip } from "./studio-virtual-space-character-skins";

const root = resolve(process.cwd(), "apps/web/public/assets/virtual-studio/experience-v8");
interface NpcArtRecord {
  readonly key: string;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly framePixelHashes: readonly string[];
  readonly frames: readonly { readonly index: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
}
const manifest = JSON.parse(readFileSync(resolve(root, "npc-art-manifest.json"), "utf8")) as {
  readonly generationTool: string;
  readonly actualModelVersion: null;
  readonly modelVersionVerified: boolean;
  readonly files: readonly NpcArtRecord[];
};

describe("전용 NPC 원본 PNG와 프레임 근거", () => {
  it("생성 도구를 기록하고 반환되지 않은 모델 버전을 확정하지 않는다", () => {
    expect(manifest.generationTool).toBe("built-in image_gen");
    expect(manifest.actualModelVersion).toBeNull();
    expect(manifest.modelVersionVerified).toBe(false);
    expect(manifest.files.map((record) => record.key)).toEqual(STUDIO_NATIVE_NPC_KEYS);
  });

  it.each(STUDIO_NATIVE_NPC_KEYS)("%s의 원본 RGBA·실제 치수·해시와 32개 객체 영역을 검증한다", (key) => {
    const record = manifest.files.find((item) => item.key === key);
    const source = measurements.find((item) => item.file === `${key}.png`);
    if (!record || !source) throw new Error("NPC 검수 근거 누락");
    const png = readFileSync(resolve(root, record.file));
    expect(png.byteLength).toBe(record.bytes);
    expect(createHash("sha256").update(png).digest("hex")).toBe(record.sha256);
    expect(png.readUInt32BE(16)).toBe(source.width);
    expect(png.readUInt32BE(20)).toBe(source.height);
    expect(png[25]).toBe(6);
    expect(record.frames).toEqual(source.atlas.frames);
    expect(record.frameCount).toBe(32);
    const skin = studioNpcCastSkinByKey(key);
    const idle = studioCharacterStaticAsset(skin, "down");
    if (!idle.atlas) throw new Error("NPC atlas 누락");
    const frames = studioCharacterAtlasGridFrames(idle.atlas);
    expect(frames).toHaveLength(32);
    expect(studioCharacterStaticSheetMatches(idle, source.width, source.height)).toBe(true);
    for (const [index, a] of frames.entries()) {
      expect(a).toEqual(record.frames[index]);
      for (const b of frames.slice(index + 1)) {
        const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true);
      }
    }
    for (const [row, facing] of (["down", "right", "left", "up"] as const).entries()) {
      expect(new Set(record.framePixelHashes.slice(row * 8, row * 8 + 4)).size).toBe(4);
      const walk = studioCharacterWalkClip(skin, facing);
      if (!walk) throw new Error("NPC 걷기 누락");
      expect(studioCharacterActionSheetMatches(walk, source.width, source.height)).toBe(true);
      for (const action of ["talk", "draw", "review"] as const) {
        const clip = studioCharacterActionClip(skin, facing, action);
        if (!clip) throw new Error("NPC 업무 자세 누락");
        expect(clip.start).toBe(row * 8 + (action === "talk" ? 4 : 7));
        expect(studioCharacterActionSheetMatches(clip, source.width, source.height)).toBe(true);
      }
    }
    for (const state of ["sit", "wave"] as const) {
      const pose = skin.poses?.[state];
      if (!pose) throw new Error("NPC 정지 자세 누락");
      expect(studioCharacterPoseSheetMatches(pose, source.width, source.height)).toBe(true);
    }
  });

  it("NPC 하나의 전방향·전행동에 한 원본만 요청하고 사용하지 않는 NPC 원본은 요청하지 않는다", () => {
    const requested: string[] = [];
    const residency = new StudioCharacterAssetResidency({
      has: () => false,
      load: (asset, complete) => { requested.push(asset.url); complete(true); return () => undefined; },
      remove: () => undefined,
    });
    const skin = studioNpcCastSkinByKey("npc-cafe");
    for (const facing of ["down", "right", "left", "up"] as const) {
      for (const state of ["idle", "walk", "talk", "wave", "sit", "draw", "review"] as const) {
        residency.use("npc-cafe", studioCharacterVisualAssets(skin, facing, state));
      }
    }
    expect(requested).toEqual(["/assets/virtual-studio/experience-v8/npc-cafe.png"]);
    residency.close();
  });
});
