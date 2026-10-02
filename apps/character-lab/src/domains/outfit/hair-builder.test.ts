import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, PHYSICS_BUDGET, SLOT_PRESET_IDS, paramMorphName, validateMeshPartData } from "../../contracts";
import { fnv1a64HexBytes } from "../../shared/hash";

import { scalpSurfaceFixture } from "./fixtures";
import { HEAD_BONE_INDEX, OUTFIT_AUX_BONE_INDEX_BASE, assumedHeadPivot, buildHair, hairStrands } from "./hair-builder";
import { HAIR_STYLE_SPECS, hairChainBudget } from "./hair-styles";

import type { HairStyleId, OutfitBuildContext, OutfitBuildResult } from "../../contracts";

const STYLES: readonly HairStyleId[] = SLOT_PRESET_IDS.hair;

function context(seed = 7, headSize = 1): OutfitBuildContext {
  return {
    seed,
    headSize,
    colors: { skin: "#f1c9a5", iris: "#3a5a98", hair: "#2b1d12", brow: "#2b1d12", top: "#ffffff", bottom: "#223355", shoes: "#111111", accessory: "#aa3344" },
  };
}

function resultBytes(result: OutfitBuildResult): string {
  const chunks = result.parts.flatMap((part) => [part.positions, part.normals, part.uvs, ...part.morphs.map((m) => m.deltaPositions)]);
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return fnv1a64HexBytes(new Uint8Array(merged.buffer));
}

describe("outfit/hair-builder", () => {
  it("7 스타일 모두 메시 유효성(validateMeshPartData)·partId 0·role hair·헤어 색 키를 만족한다", () => {
    const scalp = scalpSurfaceFixture();
    for (const style of STYLES) {
      const result = buildHair(style, scalp, context());
      expect(result.parts.length).toBe(2);
      for (const [index, part] of result.parts.entries()) {
        expect(part.partId).toBe(0);
        expect(part.materialId).toBe(0);
        expect(part.role).toBe("hair");
        expect(part.colorKey).toBe("hair");
        expect(part.materialPreset).toBe("hair-aniso");
        expect(part.morphs.map((m) => m.name)).toEqual([paramMorphName("headSize", "+"), paramMorphName("headSize", "-")]);
        const failure = validateMeshPartData({ ...part, partId: index + 1 });
        expect(failure, `${style}/${part.id}: ${failure?.reasonKo ?? ""}`).toBeNull();
        expect(part.indices.length).toBeGreaterThan(0);
      }
    }
  });

  it("앵커가 두피 근방이고 스트랜드가 두피 안으로 들어가지 않으며 머리 크기에 추종한다", () => {
    const base = scalpSurfaceFixture();
    const big = scalpSurfaceFixture(1.2);
    for (const style of STYLES) {
      const strands = hairStrands(style, base, 7);
      expect(strands.length).toBe(HAIR_STYLE_SPECS[style].zones.reduce((n, z) => n + z.count, 0));
      for (const strand of strands) {
        const root = strand.points[0];
        const rootDist = Math.hypot(root[0] - base.center[0], root[1] - base.center[1], root[2] - base.center[2]);
        expect(Math.abs(rootDist - base.radius)).toBeLessThan(base.radius * 0.1);
        for (const p of strand.points) {
          const d = Math.hypot(p[0] - base.center[0], p[1] - base.center[1], p[2] - base.center[2]);
          expect(d).toBeGreaterThanOrEqual(base.radius * 1.01 - 1e-6);
        }
      }
      const bigStrands = hairStrands(style, big, 7);
      const bigRoot = bigStrands[0].points[0];
      const bigDist = Math.hypot(bigRoot[0] - big.center[0], bigRoot[1] - big.center[1], bigRoot[2] - big.center[2]);
      expect(bigDist).toBeGreaterThan(base.radius * 1.1);
    }
  });

  it("체인 구역은 보조 본 hair_<style>_<i>_<j>·ChainAnchor를 만들고 예산 안이며 스킨 인덱스 규약을 지킨다", () => {
    const scalp = scalpSurfaceFixture();
    for (const style of STYLES) {
      const result = buildHair(style, scalp, context());
      const budget = hairChainBudget(HAIR_STYLE_SPECS[style]);
      expect(result.chains.length).toBe(budget.chains);
      expect(result.chains.length).toBeGreaterThan(0);
      expect(result.chains.length).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChains - 16);
      let particles = 0;
      for (const chain of result.chains) {
        expect(chain.role).toBe("hair");
        expect(chain.boneNames.length).toBe(chain.restPoints.length);
        expect(chain.boneNames.length).toBeLessThanOrEqual(PHYSICS_BUDGET.maxParticlesPerChain);
        particles += chain.boneNames.length;
        chain.boneNames.forEach((name, j) => {
          expect(name).toMatch(new RegExp(`^hair_${style}_\\d+_${j}$`, "u"));
        });
      }
      expect(particles).toBe(budget.particles);
      expect(particles).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChainParticles);
      expect(result.bones.length).toBe(particles);
      const names = new Set(result.bones.map((b) => b.name));
      expect(names.size).toBe(result.bones.length);
      for (const bone of result.bones) {
        expect(bone.auxiliary).toBe(true);
        expect(bone.parent === "head" || names.has(bone.parent ?? "")).toBe(true);
      }
      // 루트 본 restTranslation + 추정 피벗 = 체인 rest 첫 점
      const pivot = assumedHeadPivot(scalp);
      for (const chain of result.chains) {
        const root = result.bones.find((b) => b.name === chain.boneNames[0]);
        expect(root?.parent).toBe("head");
        expect(root?.restTranslation[1]).toBeCloseTo(chain.restPoints[0][1] - pivot[1], 6);
      }
      // 스킨: 보조 본 인덱스는 55 + bones 범위 안, 그 외는 head
      const strands = result.parts[1];
      const joints = strands.jointIndices as Uint16Array;
      for (let i = 0; i < joints.length; i += 1) {
        const j = joints[i];
        if (j >= OUTFIT_AUX_BONE_INDEX_BASE) expect(j - OUTFIT_AUX_BONE_INDEX_BASE).toBeLessThan(result.bones.length);
        else expect(j === HEAD_BONE_INDEX || j === 0).toBe(true);
      }
      expect(OUTFIT_AUX_BONE_INDEX_BASE).toBe(HUMANOID_BONE_NAMES.length);
    }
  });

  it("같은 입력은 같은 바이트, 시드가 다르면 다른 바이트(결정성)", () => {
    const scalp = scalpSurfaceFixture();
    for (const style of STYLES) {
      const a = buildHair(style, scalp, context(7));
      const b = buildHair(style, scalp, context(7));
      const c = buildHair(style, scalp, context(8));
      expect(resultBytes(a)).toBe(resultBytes(b));
      expect(resultBytes(a)).not.toBe(resultBytes(c));
      expect(a.chains.map((ch) => ch.id)).toEqual(b.chains.map((ch) => ch.id));
    }
  });

  it("twin-tail은 Blender kit 밖이며 번들 2개가 좌우 대칭 방위에 있다", () => {
    expect(HAIR_STYLE_SPECS["twin-tail"].blenderKit).toBe(false);
    const bundles = HAIR_STYLE_SPECS["twin-tail"].zones.filter((z) => z.kind === "bundle");
    expect(bundles.length).toBe(2);
    expect(bundles.map((z) => z.gather?.azimuth)).toEqual([115, 245]);
    const scalp = scalpSurfaceFixture();
    const strands = hairStrands("twin-tail", scalp, 1).filter((s) => s.kind === "bundle");
    expect(strands.length).toBe(8);
    const left = strands.slice(0, 4).map((s) => s.points[0][0]);
    const right = strands.slice(4).map((s) => s.points[0][0]);
    expect(Math.min(...left)).toBeGreaterThan(0);
    expect(Math.max(...right)).toBeLessThan(0);
  });
});
