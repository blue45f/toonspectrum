import { describe, expect, it } from "vitest";

import { fnv1a64 } from "../core/hash";
import { presetById } from "../presets/catalog";
import { zigzagStroke } from "../testing/synthetic-strokes";

import { renderStroke } from "./reference-renderer";

/**
 * 습식 프리셋 256² 픽셀 해시 스냅샷(결정성·회귀 게이트; 512²는 파일당 소요 시간 때문에 `wet-presets-large.snapshot.test.ts`). fnv1a64, sRGB RGBA8, zigzagStroke(256, 600 ms), seed 1, 빈 문서.
 * 2026-10-02 생성: LBM D2Q9 흐름층·Curtis 3층·종이 섬유·유화 층 물리 확장 직후 값이다. 습식 물리(`engine/wet/**`)나
 * 습식 프리셋 파라미터를 바꾸면 의도적으로 갱신한다. 비습식 프리셋 해시는 `surface.test.ts`가 맡고 이 변경에서 변하지 않았다.
 */
const WET_SNAPSHOTS: readonly [id: string, size: number, hash: string][] = [
  ["watercolor-wet", 256, "e2eeedfaad6bccd9"],
  ["watercolor-dry", 256, "b6d335e0fe02b6c1"],
  ["sumi-ink-wet", 256, "24da89b5d863913d"],
  ["gouache", 256, "70fcf8e9c1dedaec"],
  ["oil-impasto", 256, "1d1437eb6d4ebc42"],
];

describe("습식 프리셋 픽셀 해시 스냅샷", () => {
  it.each(WET_SNAPSHOTS)("%s %i²", (id, size, hash) => {
    const res = renderStroke(presetById(id), zigzagStroke(size, { durationMs: 600 }), { width: size, height: size, seed: 1 });
    expect(res.dabs).toBeGreaterThan(0);
    const got = fnv1a64(new Uint8Array(res.image.data.buffer, res.image.data.byteOffset, res.image.data.byteLength));
    expect(got, `${id} ${size}² 실측 ${got}`).toBe(hash);
  }, 60_000);
});
