import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_VIRTUAL_BACKDROPS, studioVirtualBackdropUrl } from "./studio-virtual-space-environment-preference";
import { STUDIO_VIRTUAL_DECOR_FRAME, STUDIO_VIRTUAL_DECOR_TYPES } from "./studio-virtual-space-customization";
import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { studioExperienceAssetUrl, studioExperienceAtlas, studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import sources from "./studio-virtual-space-experience-atlases.json";

const root = resolve(import.meta.dirname, "../../../../public/assets/virtual-studio/experience-v8");
const manifest = JSON.parse(readFileSync(resolve(root, "art-manifest.json"), "utf8")) as {
  assets: Array<{ file: string; bytes: number; sha256: string; source: string; modelVersion: null }>;
};

describe("가상 스튜디오 생성 아트 무결성", () => {
  it("실제 생성된 PNG와 출처 원장의 바이트·해시가 일치한다", () => {
    for (const asset of manifest.assets) {
      const bytes = readFileSync(resolve(root, asset.file));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.length).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect(asset.source).toBe("built-in image_gen");
      expect(asset.modelVersion).toBeNull();
    }
  });
  it("모든 환경과 16종 가구가 실제 아트에 연결된다", () => {
    for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) for (const backdrop of STUDIO_VIRTUAL_BACKDROPS) {
      expect(manifest.assets.some((entry) => studioVirtualBackdropUrl(backdrop, style).endsWith(`/${entry.file}`))).toBe(true);
    }
    const furniture = readFileSync(resolve(root, "furniture.png"));
    expect(furniture[25]).toBe(6);
    expect(furniture.readUInt32BE(16)).toBe(furniture.readUInt32BE(20));
    expect(furniture.readUInt32BE(16)).toBeGreaterThanOrEqual(1024);
    expect(STUDIO_VIRTUAL_DECOR_TYPES.map((type) => STUDIO_VIRTUAL_DECOR_FRAME[type])).toEqual(Array.from({ length: 16 }, (_, index) => index));
  });
});

describe("검수된 테마 소품 원본과 표시 기하", () => {
  it.each(STUDIO_VIRTUAL_ART_STYLE_KEYS)("%s 원본 두 장과 16개 프레임 검수 계약을 유지한다", (style) => {
    for (const kind of ["furniture", "landmarks"] as const) {
      const source = sources[kind][style], atlas = studioExperienceAtlas(kind, style);
      const bytes = readFileSync(resolve(process.cwd(), "apps/web/public", studioExperienceAssetUrl(kind, style).slice(1)));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sourceSha256);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([atlas.width, atlas.height]);
      const frames = studioCharacterAtlasGridFrames(atlas);
      expect(frames).toHaveLength(16);
      expect(frames.map((frame) => frame.index)).toEqual(Array.from({ length: 16 }, (_, index) => index));
      for (const frame of frames) {
        expect(frame.x).toBeGreaterThanOrEqual(0); expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(atlas.width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(atlas.height);
      }
    }
  });

  it("격자를 넘는 나무·러그를 보존하고 패딩에서 새 이웃 겹침을 만들지 않는다", () => {
    const tree = studioCharacterAtlasGridFrames(studioExperienceAtlas("furniture", "ink"))[0];
    const rug = studioCharacterAtlasGridFrames(studioExperienceAtlas("furniture", "retro"))[8];
    expect(tree && tree.y + tree.height).toBeGreaterThan(314);
    expect(rug && rug.x + rug.width).toBeGreaterThan(314);
    const overlaps: string[] = [];
    for (const kind of ["furniture", "landmarks"] as const) for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
      const frames = studioCharacterAtlasGridFrames(studioExperienceAtlas(kind, style));
      frames.forEach((frame, index) => frames.slice(index + 1).forEach((other) => {
        if (Math.min(frame.x + frame.width, other.x + other.width) > Math.max(frame.x, other.x)
          && Math.min(frame.y + frame.height, other.y + other.height) > Math.max(frame.y, other.y)) overlaps.push(`${kind}:${style}:${index}:${other.index}`);
      }));
    }
    // 두 원본은 본문 사각 경계 자체가 3~4px 겹친다. 원본을 자르거나 패딩을 더하지 않은 검수 예외다.
    expect(overlaps.sort()).toEqual(["furniture:ink:0:4", "landmarks:webtoon:0:4"]);
  });

  it("192개 프레임을 잘라 등록해도 원본 픽셀의 배율과 고정점이 이동하지 않는다", () => {
    for (const kind of ["furniture", "landmarks"] as const) for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
      const atlas = studioExperienceAtlas(kind, style);
      for (const frame of studioCharacterAtlasGridFrames(atlas)) for (const origin of [[.5, .9], [.5, 1], [0, 0]] as const) {
        const width = kind === "furniture" ? 82 * 1.35 : 196, height = kind === "furniture" ? 82 * 1.35 : 144;
        const geometry = studioExperienceFrameGeometry(kind, style, frame.index, width, height, ...origin);
        const column = frame.index % 4, row = Math.floor(frame.index / 4);
        const x = Math.round(column * atlas.width / 4), y = Math.round(row * atlas.height / 4);
        const cw = Math.round((column + 1) * atlas.width / 4) - x, ch = Math.round((row + 1) * atlas.height / 4) - y;
        expect(geometry.width / frame.width).toBeCloseTo(width / cw, 12);
        expect(geometry.height / frame.height).toBeCloseTo(height / ch, 12);
        expect(-geometry.originX * geometry.width).toBeCloseTo((frame.x - x - origin[0] * cw) * width / cw, 12);
        expect(-geometry.originY * geometry.height).toBeCloseTo((frame.y - y - origin[1] * ch) * height / ch, 12);
      }
    }
  });
});
