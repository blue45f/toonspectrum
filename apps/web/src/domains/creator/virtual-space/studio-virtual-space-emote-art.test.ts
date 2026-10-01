import { describe, expect, it } from "vitest";

import { STUDIO_SPACE_EMOTE_IDS } from "./studio-virtual-space-emote-catalog";
import {
  STUDIO_SPACE_EMOTE_ART_SIZE,
  STUDIO_SPACE_EMOTE_PALETTE,
  rasterizeStudioSpaceEmote,
  studioSpaceEmoteBitmap,
  studioSpaceEmotePixelRuns,
} from "./studio-virtual-space-emote-art";

describe("studio virtual space emote pixel art", () => {
  it("모든 이모트는 16×16 비트맵과 정의된 팔레트 키만 쓴다", () => {
    const keys = new Set(Object.keys(STUDIO_SPACE_EMOTE_PALETTE));
    for (const id of STUDIO_SPACE_EMOTE_IDS) {
      const rows = studioSpaceEmoteBitmap(id);
      expect(rows, id).toHaveLength(STUDIO_SPACE_EMOTE_ART_SIZE);
      for (const row of rows) {
        expect(row, id).toHaveLength(STUDIO_SPACE_EMOTE_ART_SIZE);
        for (const key of row) expect(key === "." || keys.has(key), `${id}:${key}`).toBe(true);
      }
      // 빈 아이콘이 아니고, 외곽선 잉크가 있어 흰 말풍선 위에서도 윤곽이 보인다.
      const filled = rows.join("").replaceAll(".", "").length;
      expect(filled, id).toBeGreaterThan(24);
      expect(rows.join("").includes("k"), id).toBe(true);
    }
    for (const color of Object.values(STUDIO_SPACE_EMOTE_PALETTE)) expect(color).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it("아이콘끼리 서로 다른 그림이다", () => {
    const signatures = new Set(STUDIO_SPACE_EMOTE_IDS.map((id) => studioSpaceEmoteBitmap(id).join("")));
    expect(signatures.size).toBe(STUDIO_SPACE_EMOTE_IDS.length);
  });

  it("rasterize는 1024바이트를 반환한다", () => {
    const heart = rasterizeStudioSpaceEmote("heart");
    expect(heart).toBeInstanceOf(Uint8ClampedArray);
    expect(heart.byteLength).toBe(1024);
    // (0,0)은 투명, 하트 중앙 (7,7)은 빨강.
    expect(heart[3]).toBe(0);
    const center = (7 * 16 + 7) * 4;
    expect([heart[center], heart[center + 1], heart[center + 2], heart[center + 3]]).toEqual([0xef, 0x47, 0x6f, 255]);
    // 호출 측이 결과를 바꿔도 캐시가 오염되지 않는다.
    heart.fill(0);
    expect(rasterizeStudioSpaceEmote("heart")[center + 3]).toBe(255);
  });

  it("픽셀 줄은 비트맵의 불투명 픽셀을 빠짐없이 한 번씩 덮는다", () => {
    for (const id of STUDIO_SPACE_EMOTE_IDS) {
      const runs = studioSpaceEmotePixelRuns(id);
      const covered = runs.reduce((sum, run) => sum + run.width, 0);
      expect(covered, id).toBe(studioSpaceEmoteBitmap(id).join("").replaceAll(".", "").length);
      for (const run of runs) {
        expect(run.x + run.width).toBeLessThanOrEqual(16);
        expect(run.y).toBeLessThan(16);
        expect(Object.values(STUDIO_SPACE_EMOTE_PALETTE)).toContain(run.color);
      }
      expect(studioSpaceEmotePixelRuns(id)).toBe(runs);
    }
  });
});
