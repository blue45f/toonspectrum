import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";
import { studioExperienceAtlas } from "./studio-virtual-space-experience-art";
import { STUDIO_EXPERIENCE_ATLAS, registerStudioSceneAtlas } from "./studio-virtual-space-scene-art-runtime";

/**
 * 테마 전환이 올바른 이유는 렌더러가 매번 다른 텍스처 키를 쓴다는 사실 하나에 달려 있다.
 * `registerStudioSceneAtlas`는 같은 텍스처에 이미 있는 프레임을 다시 등록하지 않으므로, 키가
 * 테마를 포함하지 않으면 이전 테마의 측정 영역이 그대로 남는다. 가구는 테마마다 사각형이 다르므로
 * 이 계약이 깨지면 조용히 잘못된 영역으로 그려진다.
 */

const canvasSource = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");

interface RecordingTexture {
  readonly frames: Map<number, { x: number; y: number; width: number; height: number }>;
  has(name: string): boolean;
  add(frame: number, source: number, x: number, y: number, width: number, height: number): void;
  getSourceImage(): { width: number; height: number };
}

function recordingTexture(): RecordingTexture {
  const frames = new Map<number, { x: number; y: number; width: number; height: number }>();
  return {
    frames,
    has: (name) => frames.has(Number(name)),
    add: (frame, _source, x, y, width, height) => { frames.set(frame, { x, y, width, height }); },
    getSourceImage: () => ({ width: 1254, height: 1254 }),
  };
}

describe("테마별 장면 아트 텍스처 계약", () => {
  it("가구와 랜드마크 텍스처 키는 테마를 포함한다", () => {
    expect(canvasSource).toContain("`studio-experience-v8-furniture-${artStyle}`");
    expect(canvasSource).toContain("`studio-experience-v8-landmarks-${artStyle}`");
  });

  it("가구는 테마마다 사각형이 다르므로 텍스처를 나눠야 한다", () => {
    const rects = STUDIO_VIRTUAL_ART_STYLE_KEYS.map((style) => {
      const atlas = studioExperienceAtlas("furniture", style);
      expect(atlas.slicing).toBe("explicit-frames");
      return JSON.stringify(atlas.frames ?? null);
    });
    expect(new Set(rects).size, "테마별 가구가 모두 같은 사각형이면 키를 나눌 이유가 사라진다").toBe(
      STUDIO_VIRTUAL_ART_STYLE_KEYS.length,
    );
  });

  it("같은 텍스처에 다른 테마를 등록하면 이전 프레임이 남아도 통과한다", () => {
    // 이 테스트가 막는 회귀를 고정한다. 키가 테마를 포함하지 않으면 아래와 같이 조용히 성공한다.
    const shared = recordingTexture();
    const [first, second] = STUDIO_VIRTUAL_ART_STYLE_KEYS;
    expect(registerStudioSceneAtlas(shared, studioExperienceAtlas("furniture", first))).toBe(true);
    const inkRects = [...shared.frames.values()];
    expect(registerStudioSceneAtlas(shared, studioExperienceAtlas("furniture", second!))).toBe(true);
    expect([...shared.frames.values()]).toEqual(inkRects);
  });

  it("균등 격자 원본은 테마가 달라도 프레임 사각형이 같다", () => {
    // 고양이·표정처럼 공유하는 원본은 여기 해당한다. 이 구분이 없으면 furniture까지 나눠야 한다.
    const atlas = STUDIO_EXPERIENCE_ATLAS;
    expect(atlas.slicing).toBe("rounded-grid");
    expect(atlas.width).toBe(1254);
    expect(atlas.height).toBe(1254);
  });
});
