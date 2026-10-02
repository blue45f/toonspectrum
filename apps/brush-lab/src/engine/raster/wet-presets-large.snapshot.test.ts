import { describe, expect, it } from "vitest";

import { fnv1a64 } from "../core/hash";
import { presetById } from "../presets/catalog";
import { zigzagStroke } from "../testing/synthetic-strokes";

import { renderStroke } from "./reference-renderer";

/**
 * 습식 프리셋 512² 픽셀 해시 스냅샷. 기존(HEAD) 512² 스냅샷 대상(수채·유화)을 새 물리 값으로 갱신해 유지한다.
 * 256² 스냅샷(`wet-presets.snapshot.test.ts`)과 같은 조건(fnv1a64, sRGB RGBA8, zigzagStroke(512, 600 ms), seed 1, 빈 문서)이며
 * 파일당 시험 시간 상한(30 s) 때문에 따로 둔다. 습식 물리나 프리셋 파라미터를 바꾸면 의도적으로 갱신한다.
 */
const WET_SNAPSHOTS_512: readonly [id: string, hash: string][] = [
  ["watercolor-wet", "21d19d4a9bb0d714"],
  ["oil-impasto", "b4f8ae7943dbd81f"],
];

const SIZE = 512;

describe("습식 프리셋 픽셀 해시 스냅샷(512²)", () => {
  it.each(WET_SNAPSHOTS_512)("%s 512²", (id, hash) => {
    const res = renderStroke(presetById(id), zigzagStroke(SIZE, { durationMs: 600 }), { width: SIZE, height: SIZE, seed: 1 });
    expect(res.dabs).toBeGreaterThan(0);
    const got = fnv1a64(new Uint8Array(res.image.data.buffer, res.image.data.byteOffset, res.image.data.byteLength));
    expect(got, `${id} 512² 실측 ${got}`).toBe(hash);
  }, 60_000);
});
