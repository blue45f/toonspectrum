import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, PHYSICS_BUDGET, SLOT_PRESET_IDS, allocatePartIds, validateMeshPartData } from "../../contracts";

import { bodySurfaceFixture, scalpSurfaceFixture } from "./fixtures";

import { OUTFIT_AUX_BONE_INDEX_BASE, assumedBodyPivots, assumedHeadPivot, combineOutfitResults, createOutfitBuilder, outfitBoneNames, outfitChainBudget, rebaseAuxiliaryRoots, remapAuxiliaryJointIndices } from "./index";

import type { OutfitBuildContext } from "../../contracts";

const context: OutfitBuildContext = {
  seed: 20261001,
  headSize: 1,
  colors: { skin: "#f1c9a5", iris: "#3a5a98", hair: "#2b1d12", brow: "#2b1d12", top: "#ffffff", bottom: "#223355", shoes: "#111111", accessory: "#aa3344" },
};

describe("outfit/index createOutfitBuilder", () => {
  const builder = createOutfitBuilder();
  const scalp = scalpSurfaceFixture();
  const { body, morphs } = bodySurfaceFixture();

  it("포트 구현이 헤어 7종 × 의상 조합을 만들고 합친 결과가 예산·규약을 지킨다", () => {
    for (const hair of SLOT_PRESET_IDS.hair) {
      const hairResult = builder.buildHair(hair, scalp, context);
      const garments = builder.buildGarments({ top: "sailor", bottom: "pleated-skirt", shoes: "sneakers", accessory: "ribbon" }, body, morphs, context);
      const combined = combineOutfitResults([hairResult, garments]);
      const budget = outfitChainBudget(combined);
      expect(budget.chains).toBe(hairResult.chains.length + garments.chains.length);
      expect(budget.chains).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChains);
      expect(budget.particles).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChainParticles);
      expect(combined.bones.length).toBe(hairResult.bones.length + garments.bones.length);
      const names = outfitBoneNames(combined);
      expect(names.slice(0, HUMANOID_BONE_NAMES.length)).toEqual([...HUMANOID_BONE_NAMES]);
      expect(new Set(names).size).toBe(names.length);
      // 합친 뒤 모든 jointIndices는 전체 본 목록 범위 안이고, 의상 보조 본 인덱스는 헤어 본 수만큼 밀렸다
      const palette = allocatePartIds(combined.parts);
      combined.parts.forEach((part, i) => {
        expect(validateMeshPartData({ ...part, partId: i + 1 })).toBeNull();
        expect(palette[i + 1]?.role).toBe(part.role);
        const joints = part.jointIndices as Uint16Array;
        for (let k = 0; k < joints.length; k += 1) expect(joints[k]).toBeLessThan(names.length);
      });
      const ribbonPart = combined.parts.find((p) => p.id === "top-sailor-ribbon");
      const original = garments.parts.find((p) => p.id === "top-sailor-ribbon");
      if (!ribbonPart || !original) throw new Error("리본 파츠 없음");
      const shifted = (ribbonPart.jointIndices as Uint16Array)[0] - (original.jointIndices as Uint16Array)[0];
      expect(shifted).toBe(hairResult.bones.length);
      // 체인 boneNames는 전부 본 목록에 있다
      for (const chain of combined.chains) for (const bone of chain.boneNames) expect(names).toContain(bone);
    }
  });

  it("보조 본 인덱스 재매핑과 루트 피벗 보정이 순수하게 동작한다", () => {
    const hairResult = builder.buildHair("soft-bob", scalp, context);
    const part = hairResult.parts[1];
    const remapped = remapAuxiliaryJointIndices(part, OUTFIT_AUX_BONE_INDEX_BASE, 60, 2);
    const before = part.jointIndices as Uint16Array;
    const after = remapped.jointIndices as Uint16Array;
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] >= OUTFIT_AUX_BONE_INDEX_BASE) expect(after[i]).toBe(before[i] - OUTFIT_AUX_BONE_INDEX_BASE + 62);
      else expect(after[i]).toBe(before[i]);
    }
    const assumed = assumedHeadPivot(scalp);
    const actualHead: [number, number, number] = [assumed[0], assumed[1] - 0.03, assumed[2]];
    const rebased = rebaseAuxiliaryRoots(hairResult.bones, { head: actualHead }, { head: assumed });
    const root = hairResult.bones.find((b) => b.parent === "head");
    const rebasedRoot = rebased.find((b) => b.name === root?.name);
    expect(rebasedRoot?.restTranslation[1]).toBeCloseTo((root?.restTranslation[1] ?? 0) + 0.03, 6);
    const child = rebased.find((b) => b.parent !== "head");
    const childBefore = hairResult.bones.find((b) => b.name === child?.name);
    expect(child?.restTranslation).toEqual(childBefore?.restTranslation);
    const pivots = assumedBodyPivots(body);
    expect(pivots.head?.[1]).toBeLessThan(1.62);
    expect(pivots.hips?.[1]).toBeGreaterThan(0.8);
  });
});
