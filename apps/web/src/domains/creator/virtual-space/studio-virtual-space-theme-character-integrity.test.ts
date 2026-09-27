import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { decodePng } from "image-js";
import { describe, expect, it } from "vitest";
import { STUDIO_THEME_CHARACTER_SOURCES } from "./studio-virtual-space-theme-character-sources";
import { createStudioThemeCharacterSkin } from "./studio-virtual-space-character-theme-art";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { studioCharacterStaticAsset, studioCharacterStaticSheetMatches, studioCharacterFrameGeometry } from "./studio-virtual-space-character-assets";

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "apps/web/public/assets/virtual-studio/experience-v8/art-manifest.json"), "utf8")) as {
  readonly assets: readonly { readonly file: string; readonly bytes: number; readonly sha256: string; readonly width?: number; readonly height?: number }[];
};

describe("테마 플레이어 원본과 실제 프레임 무결성", () => {
  it("서로 다른 작화의 6개 원본을 등록한다", () => {
    expect(STUDIO_THEME_CHARACTER_SOURCES.map((source) => source.artStyle)).toEqual(["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]);
    const records = STUDIO_THEME_CHARACTER_SOURCES.map((source) => manifest.assets.find((record) => record.file === basename(source.textureUrl)));
    expect(new Set(records.map((record) => record?.sha256)).size).toBe(6);
  });

  it.each(STUDIO_THEME_CHARACTER_SOURCES)("$artStyle: 원본 전체 alpha와 32개 정수 영역·발 기준·머리 중심을 확인한다", (source) => {
    const record = manifest.assets.find((item) => item.file === basename(source.textureUrl));
    if (!record || !source.atlas) throw new Error("원본 manifest 또는 atlas 누락");
    const bytes = readFileSync(resolve(process.cwd(), "apps/web/public", source.textureUrl.replace(/^\//u, "")));
    expect(bytes.byteLength).toBe(record.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
    expect(bytes.readUInt32BE(16)).toBe(source.width);
    expect(bytes.readUInt32BE(20)).toBe(source.height);
    expect(bytes[25]).toBe(6);
    const image = decodePng(bytes);
    expect(image.channels).toBe(4);
    expect(image.alpha).toBe(true);
    expect(image.bitDepth).toBe(8);
    const pixels = image.getRawImage().data;
    const frames = studioCharacterAtlasGridFrames(source.atlas);
    expect(frames).toHaveLength(32);
    expect(source.frames).toHaveLength(32);
    const coverage = new Uint8Array(source.width * source.height);
    const hashes: string[] = [];
    for (const [index, frame] of frames.entries()) {
      const presentation = source.frames[index];
      if (!presentation) throw new Error("프레임 표시 좌표 누락");
      expect(Object.values(frame).every(Number.isSafeInteger)).toBe(true);
      const rgba = new Uint8Array(frame.width * frame.height * 4);
      let headSum = 0, headPixels = 0, foregroundPixels = 0, footY = 0;
      const headStart = Math.floor(frame.height * .12), headEnd = Math.floor(frame.height * .46);
      for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const sourceIndex = (frame.y + y) * source.width + frame.x + x;
        const covered = coverage[sourceIndex] ?? 0;
        coverage[sourceIndex] = covered + 1;
        const offset = sourceIndex * 4, alpha = pixels[offset + 3] ?? 0;
        rgba.set(pixels.subarray(offset, offset + 4), (y * frame.width + x) * 4);
        if (alpha > 100) {
          foregroundPixels++; footY = Math.max(footY, y + 1);
          if (y >= headStart && y < headEnd) { headSum += x; headPixels++; }
        }
      }
      expect(foregroundPixels).toBeGreaterThan(600);
      expect(headPixels).toBeGreaterThan(0);
      expect(presentation.originX).toBeCloseTo(headSum / headPixels / frame.width, 6);
      // 투명 그림자와 검수 여백은 발 기준을 옮기지 않는다.
      expect(Math.abs(presentation.originY * frame.height - footY)).toBeLessThanOrEqual(1.01);
      const geometry = studioCharacterFrameGeometry(presentation, frame.width, frame.height, 98, 131);
      expect(geometry.width / geometry.height).toBeCloseTo(frame.width / frame.height);
      expect(geometry.originX).toBe(presentation.originX);
      expect(geometry.originY).toBe(presentation.originY);
      hashes.push(createHash("sha256").update(rgba).digest("hex"));
    }
    let omittedOpaquePixels = 0, overlappingPixels = 0, transparentPixels = 0;
    for (let pixel = 0; pixel < coverage.length; pixel++) {
      const alpha = pixels[pixel * 4 + 3] ?? 0, covered = coverage[pixel] ?? 0;
      if (alpha > 100 && covered === 0) omittedOpaquePixels++;
      if (covered > 1) overlappingPixels++;
      if (alpha === 0) transparentPixels++;
    }
    expect(omittedOpaquePixels).toBe(0);
    expect(overlappingPixels).toBe(0);
    expect(transparentPixels).toBeGreaterThan(0);
    for (let row = 0; row < 4; row++) expect(new Set(hashes.slice(row * 8, row * 8 + 4)).size).toBe(4);
    const skin = createStudioThemeCharacterSkin(source);
    for (const facing of ["down", "right", "left", "up"] as const) {
      expect(studioCharacterStaticSheetMatches(studioCharacterStaticAsset(skin, facing), source.width, source.height)).toBe(true);
    }
  });
});
