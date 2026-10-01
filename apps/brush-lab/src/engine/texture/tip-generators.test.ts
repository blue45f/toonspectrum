import { describe, expect, it } from "vitest";

import { fnv1a64 } from "../core/hash";

import { buildMipChain, buildTipAtlas, TIP_KINDS_ORDERED } from "./mip-chain";
import { generateTip, maskMean } from "./tip-generators";

import type { TipMask, TipParams } from "./tip-generators";
import type { TipKind } from "../core/types";

const PARAMS: TipParams = { hardness: 0.8, aspect: 1, strands: 12, density: 0.6, frequency: 6, angle: 0.3 };
const SEEDED: readonly TipKind[] = ["bristle-strands", "texture-stamp", "noise", "particle"];
const UNSEEDED: readonly TipKind[] = ["round", "flat", "hatch", "stipple"];

function hashOf(mask: TipMask): string {
  return fnv1a64(new Uint8Array(mask.data.buffer, mask.data.byteOffset, mask.data.byteLength));
}

describe("절차적 팁 마스크 8종", () => {
  it("8종이 결정적(같은 인자 → 같은 바이트)이고 종류별 해시가 전부 다르다", () => {
    const hashes = new Set<string>();
    for (const kind of TIP_KINDS_ORDERED) {
      const a = generateTip(kind, 32, 5, PARAMS);
      const b = generateTip(kind, 32, 5, PARAMS);
      expect(a.size).toBe(32);
      expect(a.data.length).toBe(32 * 32);
      expect(hashOf(a)).toBe(hashOf(b));
      hashes.add(hashOf(a));
    }
    expect(hashes.size).toBe(8);
    expect(TIP_KINDS_ORDERED.length).toBe(8);
  });

  it("값 범위 [0,1]·f32·비어 있지 않음", () => {
    for (const kind of TIP_KINDS_ORDERED) {
      const mask = generateTip(kind, 64, 3, PARAMS);
      let any = false;
      for (let i = 0; i < mask.data.length; i += 1) {
        const v = mask.data[i] ?? -1;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(v).toBe(Math.fround(v));
        if (v > 0) any = true;
      }
      expect(any, kind).toBe(true);
      expect(maskMean(mask)).toBeGreaterThan(0.01);
    }
  });

  it("시드 있는 팁은 시드가 바뀌면 상이하고, 시드 없는 팁은 시드와 무관하게 같다", () => {
    for (const kind of SEEDED) {
      expect(hashOf(generateTip(kind, 32, 1, PARAMS)), kind).not.toBe(hashOf(generateTip(kind, 32, 2, PARAMS)));
    }
    for (const kind of UNSEEDED) {
      expect(hashOf(generateTip(kind, 32, 1, PARAMS)), kind).toBe(hashOf(generateTip(kind, 32, 2, PARAMS)));
    }
  });

  it("mip 체인: 레벨 수 = log2(size)+1, 각 레벨 평균 보존, 마지막은 1×1", () => {
    for (const kind of TIP_KINDS_ORDERED) {
      const base = generateTip(kind, 64, 3, PARAMS);
      const chain = buildMipChain(base);
      expect(chain.length).toBe(7);
      expect(chain[0]).toBe(base);
      expect(chain[chain.length - 1]?.size).toBe(1);
      const mean0 = maskMean(base);
      for (let i = 1; i < chain.length; i += 1) {
        const level = chain[i];
        if (!level) throw new Error("missing level");
        expect(level.size).toBe(64 >> i);
        expect(Math.abs(maskMean(level) - mean0), `${kind} level ${i}`).toBeLessThan(1e-5);
      }
    }
    // 2의 거듭제곱이 아닌 크기도 1×1까지 내려간다
    const odd = buildMipChain(generateTip("round", 12, 1, PARAMS));
    expect(odd.map((m) => m.size)).toEqual([12, 6, 3, 1]);
  });

  it("round 팁: 중심 1·모서리 0·hardness가 높을수록 평균이 커진다·aspect로 납작해진다", () => {
    const hard = generateTip("round", 64, 1, { hardness: 1, aspect: 1 });
    const soft = generateTip("round", 64, 1, { hardness: 0.2, aspect: 1 });
    const center = 32 * 64 + 32;
    expect(hard.data[center]).toBe(1);
    expect(hard.data[0]).toBe(0);
    expect(maskMean(hard)).toBeGreaterThan(maskMean(soft));
    // 원 면적 π/4 ≈ 0.785
    expect(maskMean(hard)).toBeCloseTo(Math.PI / 4, 1);
    const flat = generateTip("round", 64, 1, { hardness: 1, aspect: 0.5 });
    expect(maskMean(flat)).toBeCloseTo(maskMean(hard) / 2, 1);
  });

  it("hatch 팁은 각도를 따라 줄무늬가 생기고 stipple은 격자 점이 생긴다", () => {
    const h0 = generateTip("hatch", 64, 1, { hardness: 1, aspect: 1, frequency: 6, angle: 0 });
    const h90 = generateTip("hatch", 64, 1, { hardness: 1, aspect: 1, frequency: 6, angle: Math.PI / 2 });
    // 각도 0: 세로줄(행 안에서 변화), 각도 90°: 가로줄 → 전치와 같다(격자 대칭 범위 안에서)
    let diffTransposed = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        diffTransposed += Math.abs((h0.data[y * 64 + x] ?? 0) - (h90.data[x * 64 + y] ?? 0));
      }
    }
    expect(diffTransposed / (64 * 64)).toBeLessThan(0.02);
    expect(hashOf(h0)).not.toBe(hashOf(h90));
    const st = generateTip("stipple", 64, 1, { hardness: 1, aspect: 1, frequency: 4, density: 0.5 });
    // 4×4 격자의 점 16개: 평균은 작고 최대는 1
    expect(maskMean(st)).toBeLessThan(0.4);
    expect(Math.max(...Array.from(st.data))).toBe(1);
  });

  it("buildTipAtlas: 폭 = size·8, layout 순서 = TIP_KINDS_ORDERED, 결정적, levels = log2(size)+1", () => {
    const a = buildTipAtlas(32, 7);
    const b = buildTipAtlas(32, 7);
    expect(a.width).toBe(32 * 8);
    expect(a.height).toBe(32);
    expect(a.levels).toBe(6);
    expect(a.data.length).toBe(a.width * a.height);
    expect(fnv1a64(a.data)).toBe(fnv1a64(b.data));
    TIP_KINDS_ORDERED.forEach((kind, i) => {
      expect(a.layout[kind]).toEqual({ x: i * 32, y: 0 });
    });
    expect(fnv1a64(buildTipAtlas(32, 8).data)).not.toBe(fnv1a64(a.data));
  });

  it("generateTip 크기 검증", () => {
    expect(() => generateTip("round", 0, 1, PARAMS)).toThrow(RangeError);
    expect(() => generateTip("round", 2.5, 1, PARAMS)).toThrow(RangeError);
  });
});
