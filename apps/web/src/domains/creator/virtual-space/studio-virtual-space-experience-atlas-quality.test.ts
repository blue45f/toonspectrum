import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import {
  studioExperienceAssetUrl,
  studioExperienceAtlas,
  studioExperienceFrameGeometry,
} from "./studio-virtual-space-experience-art";
import atlasSources from "./studio-virtual-space-experience-atlases.json";

import type { StudioExperienceAtlasKind } from "./studio-virtual-space-experience-art";

/**
 * 2026-09-27 원본 검수는 12장 PNG의 알파 본문 범위를 측정한 정수 사각형으로 남겼고, 잘린 잉크 나무와
 * 레트로 러그를 복구했다. 여기서는 그 사각형이 "모든 장소와 스타일"에서 같은 배율·기준점을
 * 보존하는지 기계로 고정한다. 기준점이 틀어지면 가구의 배치 좌표·회전·물리 충돌체가 조용히
 * 이동하므로, PNG나 원장을 다시 만들면 반드시 여기서 실패해야 한다.
 */

const KINDS = ["furniture", "landmarks"] as const satisfies readonly StudioExperienceAtlasKind[];
const ARTIFACT_KINDS = ["landmarks", "furniture", "terrain"] as const;
const FRAME_COUNT = 16;

/** 4×4 균등 격자 셀의 경계. 반올림 오차 때문에 열마다 1px 차이가 나므로 정수 경계를 그대로 쓴다. */
function cellBounds(source: { readonly width: number; readonly height: number }, index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  const cellX = Math.round((column * source.width) / 4);
  const cellY = Math.round((row * source.height) / 4);
  return {
    x: cellX,
    y: cellY,
    width: Math.round(((column + 1) * source.width) / 4) - cellX,
    height: Math.round(((row + 1) * source.height) / 4) - cellY,
  };
}

/** 원본 자체에서 서로 닿는 조각은 검수 원장에 예외로 남겨 두었다. 그 외의 겹침은 새로 생긴 것이다. */
const DOCUMENTED_SOURCE_OVERLAPS: readonly string[] = [
  "furniture:ink:0", "furniture:ink:4",
  "landmarks:webtoon:0", "landmarks:webtoon:4",
];

describe("가상 스튜디오 원본 atlas 품질 게이트", () => {
  it.each(STUDIO_VIRTUAL_ART_STYLE_KEYS)("%s 스타일은 가구·랜드마크 16프레임 정수 원본을 제공한다", (style) => {
    for (const kind of KINDS) {
      const atlas = studioExperienceAtlas(kind, style);
      expect(atlas.slicing, `${kind}/${style}`).toBe("explicit-frames");
      expect(atlas.width, `${kind}/${style}`).toBe(1254);
      expect(atlas.height, `${kind}/${style}`).toBe(1254);
      expect(atlas.columns).toBe(4);
      expect(atlas.rows).toBe(4);

      // Phaser와 SVG가 같은 프레임을 쓰도록 공통 helper가 16개를 그대로 돌려주는지 확인한다.
      const frames = studioCharacterAtlasGridFrames(atlas);
      expect(frames, `${kind}/${style}`).toHaveLength(FRAME_COUNT);
      frames.forEach((frame, index) => {
        const label = `${kind}/${style}#${index}`;
        expect(frame.index, label).toBe(index);
        for (const [axis, value] of [["x", frame.x], ["y", frame.y], ["width", frame.width], ["height", frame.height]] as const) {
          expect(Number.isSafeInteger(value), `${label} ${axis}`).toBe(true);
        }
        expect(frame.width, `${label} 너비`).toBeGreaterThan(0);
        expect(frame.height, `${label} 높이`).toBeGreaterThan(0);
        expect(frame.x, `${label} x`).toBeGreaterThanOrEqual(0);
        expect(frame.y, `${label} y`).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width, `${label} 우측`).toBeLessThanOrEqual(atlas.width);
        expect(frame.y + frame.height, `${label} 하단`).toBeLessThanOrEqual(atlas.height);
      });
      expect(new Set(frames.map((frame) => `${frame.x},${frame.y}`)).size, `${kind}/${style} 위치 중복`).toBe(FRAME_COUNT);
    }
  });

  it.each(KINDS.flatMap((kind) => STUDIO_VIRTUAL_ART_STYLE_KEYS.map((style) => ({ kind, style }))))(
    "$kind/$style의 16프레임은 원본 예외 외에 서로 겹치지 않는다",
    ({ kind, style }) => {
      const source = atlasSources[kind][style];
      const overlapping = new Set<string>();
      for (const frame of source.frames) {
        for (const other of source.frames) {
          if (frame.index >= other.index) continue;
          const intersects = frame.x < other.x + other.width
            && other.x < frame.x + frame.width
            && frame.y < other.y + other.height
            && other.y < frame.y + frame.height;
          if (intersects) {
            overlapping.add(`${kind}:${style}:${frame.index}`);
            overlapping.add(`${kind}:${style}:${other.index}`);
          }
        }
      }
      for (const key of overlapping) {
        expect(DOCUMENTED_SOURCE_OVERLAPS, `새로운 겹침 ${key}`).toContain(key);
      }
    },
  );

  it.each(KINDS.flatMap((kind) => STUDIO_VIRTUAL_ART_STYLE_KEYS.map((style) => ({ kind, style }))))(
    "$kind/$style는 기존 4×4 격자의 배율과 기준점을 보존한다",
    ({ kind, style }) => {
      const source = atlasSources[kind][style];
      for (const frame of source.frames) {
        const label = `${kind}/${style}#${frame.index}`;
        const cell = cellBounds(source, frame.index);
        const geometry = studioExperienceFrameGeometry(kind, style, frame.index, 100, 100);

        // 잘라 등록해도 표시는 기존 셀 대비 정확한 비율이어야 한다.
        expect(geometry.width, `${label} 배율 x`).toBeCloseTo((100 * frame.width) / cell.width, 6);
        expect(geometry.height, `${label} 배율 y`).toBeCloseTo((100 * frame.height) / cell.height, 6);

        // 기준점은 셀의 고정점(가로 중앙·아래쪽)이 측정한 프레임 안에서 어디로 옮겨졌는지다.
        expect(geometry.originX, `${label} 기준점 x`).toBeCloseTo((cell.x + cell.width * 0.5 - frame.x) / frame.width, 6);
        expect(geometry.originY, `${label} 기준점 y`).toBeCloseTo((cell.y + cell.height - frame.y) / frame.height, 6);

        // 사각형이 셀을 크게 벗어나면 작화가 축척·기준점에서 함께 어긋난다. 검수된 실제 범위로 고정한다.
        const scaleX = frame.width / cell.width;
        const scaleY = frame.height / cell.height;
        expect(scaleX, `${label} 가로 축척`).toBeGreaterThan(0.3);
        expect(scaleX, `${label} 가로 축척`).toBeLessThan(1.35);
        expect(scaleY, `${label} 세로 축척`).toBeGreaterThan(0.3);
        expect(scaleY, `${label} 세로 축척`).toBeLessThan(1.35);
        // 넓은 가구와 좁은 가구가 함께 있으므로 가로·세로 축척 비율은 상한만 둔다.
        expect(scaleX / scaleY, `${label} 축척 비율`).toBeLessThan(2.5);
        expect(scaleY / scaleX, `${label} 축척 비율`).toBeLessThan(2.5);

        // 결정론: 같은 입력이면 렌더러와 SVG 미리보기가 같은 값을 받아야 한다.
        expect(studioExperienceFrameGeometry(kind, style, frame.index, 100, 100)).toEqual(geometry);
      }
    },
  );

  it("범위를 벗어난 프레임 번호는 NaN 대신 전달된 크기를 그대로 돌려준다", () => {
    for (const kind of KINDS) {
      for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
        for (const index of [-1, FRAME_COUNT, 99, 1.5, Number.NaN]) {
          expect(studioExperienceFrameGeometry(kind, style, index, 64, 48, 0.25, 0.75))
            .toEqual({ width: 64, height: 48, originX: 0.25, originY: 0.75 });
        }
      }
    }
  });

  it.each(ARTIFACT_KINDS.flatMap((kind) => STUDIO_VIRTUAL_ART_STYLE_KEYS.map((style) => ({ kind, style }))))(
    "$kind/$style의 자산 URL은 실제 1254×1254 원본을 가리킨다",
    ({ kind, style }) => {
      const url = studioExperienceAssetUrl(kind, style);
      expect(url.startsWith("/assets/virtual-studio/experience-v8/"), url).toBe(true);
      const png = readFileSync(resolve(process.cwd(), "apps/web/public", url.replace(/^\//u, "")));
      expect(png.subarray(0, 8).toString("hex"), basename(url)).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16), basename(url)).toBe(1254);
      expect(png.readUInt32BE(20), basename(url)).toBe(1254);
    },
  );
});
