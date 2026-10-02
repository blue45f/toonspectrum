/**
 * humanoid(`buildHumanoidModel`) × outfit(`createOutfitBuilder`) × state(`planApply`) × physics(`createPbdChainSolver`) 결합 검증.
 * 도메인 교차 import는 도메인 안에서 금지(architecture.test)라 이 결합은 도메인 밖(app)에서만 검사할 수 있다.
 * GPU 없이 Node에서 돌며, 실제 렌더(Babylon)에서의 모습은 브라우저 검증 항목이다.
 */
import { describe, expect, it } from "vitest";

import { PERFORMANCE_PRESETS } from "../animation/presets";
import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_FACS_MORPH_NAMES,
  BODY_PARAM_KEYS,
  FACE_PARAM_KEYS,
  FACS_UNITS,
  HUMANOID_BONE_NAMES,
  PHYSICS_BUDGET,
  SLOT_PRESET_IDS,
  createDefaultRecipe,
  createPresetCatalog,
  validateMeshPartData,
} from "../contracts";
import { buildHumanoidModel, geometryKeyOf, humanoidModelDigest, type ProceduralHumanoidModel } from "../domains/humanoid/humanoid-model";
import { boneWorldMatrices, skinPositionsCpu } from "../domains/humanoid/skeleton/pose-math";
import { createOutfitBuilder, outfitChainBudget } from "../domains/outfit";
import { createPbdChainSolver } from "../domains/physics/pbd-chain";
import { APPEARANCE_PRESETS } from "../presets";
import { DEFAULT_PART_LAYOUT, planApply } from "../state/apply-plan";

import { PROCEDURAL_SEED, SUBDIVISION_LEVELS } from "./composition";
import { assertHumanoidModel, createProceduralSourceBuilder } from "./shell/procedural-source";

import type { CharacterRecipe, MeshPartData, SlotKind } from "../contracts";

const outfit = createOutfitBuilder();
const catalog = createPresetCatalog([...APPEARANCE_PRESETS, ...PERFORMANCE_PRESETS]);

function recipeWith(slots: Partial<Record<SlotKind, `${SlotKind}/${string}` | null>>, extra: Partial<CharacterRecipe> = {}): CharacterRecipe {
  const base = createDefaultRecipe();
  return { ...base, ...extra, slots: { ...base.slots, hair: null, top: null, bottom: null, shoes: null, accessory: null, ...slots } };
}

function build(recipe: CharacterRecipe, levels: 0 | 1 | 2 = 0): ProceduralHumanoidModel {
  return buildHumanoidModel(recipe, { subdivisionLevels: levels, seed: PROCEDURAL_SEED, outfit });
}

function partOf(model: ProceduralHumanoidModel, role: MeshPartData["role"]): MeshPartData {
  const part = model.parts.find((candidate) => candidate.role === role);
  if (!part) throw new Error(`역할 ${role} 파츠가 없습니다.`);
  return part;
}

function assertConsistent(model: ProceduralHumanoidModel): void {
  for (const part of model.parts) expect(validateMeshPartData(part)).toBeNull();
  const names = model.skeleton.bones.map((bone) => bone.name);
  expect(names.slice(0, 55)).toEqual([...HUMANOID_BONE_NAMES]);
  expect(new Set(names).size).toBe(names.length);
  const known = new Set(names);
  for (const bone of model.skeleton.bones) if (bone.parent !== null) expect(known.has(bone.parent)).toBe(true);
  for (const chain of model.chains) for (const bone of chain.boneNames) expect(known.has(bone)).toBe(true);
  const budget = outfitChainBudget({ parts: [], bones: [], chains: model.chains });
  expect(budget.chains).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChains);
  expect(budget.particles).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChainParticles);
  // identity 포즈 스키닝이 원형 복원(보조 본 포함)
  const matrices = boneWorldMatrices(model.skeleton, {});
  let worst = 0;
  for (const part of model.parts) {
    const skinned = skinPositionsCpu(part, matrices);
    for (let i = 0; i < skinned.length; i += 1) worst = Math.max(worst, Math.abs(skinned[i] - part.positions[i]));
  }
  expect(worst).toBeLessThan(1e-4);
}

describe("humanoid × outfit(실제 포트)", () => {
  it("core의 createProceduralSourceBuilder에 그대로 꽂히고 기본 레시피 모델이 정합성 검사를 통과한다", async () => {
    const buildSource = createProceduralSourceBuilder({ humanoid: buildHumanoidModel, outfit, subdivisionLevels: SUBDIVISION_LEVELS, seed: PROCEDURAL_SEED });
    const recipe = createDefaultRecipe();
    const model = await buildSource(recipe);
    expect(() => assertHumanoidModel(model)).not.toThrow();
    expect(model.parts.map((part) => part.role)).toContain("hair");
    expect(humanoidModelDigest(model)).toBe(humanoidModelDigest(await buildSource(recipe)));
  }, 60000);

  it("헤어 7종 × 각각 단독: 파츠·본·체인이 정합하고 두피 위에 앉는다", () => {
    for (const hair of SLOT_PRESET_IDS.hair) {
      const model = build(recipeWith({ hair: `hair/${hair}` }));
      assertConsistent(model);
      const part = partOf(model, "hair");
      expect(part.id).toBe(`hair-${hair}`);
      const headTop = partOf(model, "head");
      let maxHeadY = -Infinity;
      for (let v = 0; v < headTop.positions.length / 3; v += 1) maxHeadY = Math.max(maxHeadY, headTop.positions[v * 3 + 1]);
      let minHairY = Infinity;
      for (let v = 0; v < part.positions.length / 3; v += 1) minHairY = Math.min(minHairY, part.positions[v * 3 + 1]);
      // 헤어 일부(앞머리·캡)는 정수리 근처, 끝은 목 아래까지 내려올 수 있다
      expect(maxHeadY).toBeGreaterThan(1.6);
      expect(minHairY).toBeLessThan(maxHeadY);
      expect(model.chains.length).toBeGreaterThan(0);
      expect(model.skeleton.bones.filter((bone) => bone.auxiliary).length).toBeGreaterThan(0);
    }
  }, 60000);

  it("상의 5·하의 5·신발 4·액세서리 6종 각각 단독: 정합하다", () => {
    for (const [slot, ids] of [
      ["top", SLOT_PRESET_IDS.top],
      ["bottom", SLOT_PRESET_IDS.bottom],
      ["shoes", SLOT_PRESET_IDS.shoes],
      ["accessory", SLOT_PRESET_IDS.accessory],
    ] as const) {
      for (const id of ids) {
        const model = build(recipeWith({ [slot]: `${slot}/${id}` }));
        assertConsistent(model);
        expect(partOf(model, slot).id).toBe(`${slot}-${id}`);
      }
    }
  }, 60000);

  it("최악 조합(긴 헤어 + 세일러 + 롱스커트 + 귀걸이 + 부츠)도 체인·입자 예산 안이다", () => {
    const model = build(recipeWith({ hair: "hair/romance-long", top: "top/sailor", bottom: "bottom/long-skirt", shoes: "shoes/boots", accessory: "accessory/earrings" }), 1);
    assertConsistent(model);
    expect(model.parts).toHaveLength(15);
    expect(model.chains.map((chain) => chain.role)).toEqual(expect.arrayContaining(["hair", "skirt", "ribbon"]));
  }, 60000);

  it("보조 루트 본이 실제 머리·엉덩이 위치에 보정돼 헤어·스커트가 몸을 따라 움직인다", () => {
    const model = build(recipeWith({ hair: "hair/soft-bob", bottom: "bottom/pleated-skirt" }));
    const rest = boneWorldMatrices(model.skeleton, {});
    const worldOf = (name: string): [number, number, number] => {
      const m = rest.world[rest.order.indexOf(name)];
      return [m[12], m[13], m[14]];
    };
    const head = worldOf("head");
    const hairRoots = model.skeleton.bones.filter((bone) => bone.auxiliary && bone.parent === "head");
    expect(hairRoots.length).toBeGreaterThan(0);
    for (const root of hairRoots) {
      const world = worldOf(root.name);
      // 머리 중심 근처(머리 본은 목 끝이라 머리 반경 안쪽 위)
      expect(Math.hypot(world[0] - head[0], world[1] - head[1], world[2] - head[2])).toBeLessThan(0.3);
    }
    const hips = worldOf("hips");
    for (const root of model.skeleton.bones.filter((bone) => bone.auxiliary && bone.parent === "hips")) {
      const world = worldOf(root.name);
      expect(Math.hypot(world[0] - hips[0], world[1] - hips[1], world[2] - hips[2])).toBeLessThan(0.35);
    }
    // 머리 본을 돌리면 헤어는 따라가고 하의는 그대로
    const half = Math.SQRT1_2;
    const posed = boneWorldMatrices(model.skeleton, { head: [0, half, 0, half] });
    const movedHair = skinPositionsCpu(partOf(model, "hair"), posed);
    const hair = partOf(model, "hair");
    let moved = 0;
    for (let i = 0; i < movedHair.length; i += 1) moved = Math.max(moved, Math.abs(movedHair[i] - hair.positions[i]));
    expect(moved).toBeGreaterThan(0.03);
    const bottom = partOf(model, "bottom");
    const movedBottom = skinPositionsCpu(bottom, posed);
    let bottomDelta = 0;
    for (let i = 0; i < movedBottom.length; i += 1) bottomDelta = Math.max(bottomDelta, Math.abs(movedBottom[i] - bottom.positions[i]));
    expect(bottomDelta).toBeLessThan(1e-5);
  });

  it("체형 morph(어깨 너비 +)가 상의 정점을 따라 움직이고 의상이 몸을 관통하지 않는다", () => {
    const model = build(recipeWith({ top: "top/shirt", bottom: "bottom/jeans" }), 1);
    const apply = (part: MeshPartData, name: string, weight: number): Float32Array => {
      const out = new Float32Array(part.positions);
      const delta = part.morphs.find((morph) => morph.name === name)?.deltaPositions;
      if (!delta) throw new Error(`${part.id}에 ${name} morph가 없습니다.`);
      for (let i = 0; i < out.length; i += 1) out[i] += delta[i] * weight;
      return out;
    };
    const maxX = (positions: Float32Array): number => {
      let m = -Infinity;
      for (let i = 0; i < positions.length; i += 3) m = Math.max(m, Math.abs(positions[i]));
      return m;
    };
    const skin = partOf(model, "skin");
    const top = partOf(model, "top");
    const skinWide = apply(skin, "param:shoulderWidth:+", 1);
    const topWide = apply(top, "param:shoulderWidth:+", 1);
    expect(maxX(topWide)).toBeGreaterThan(maxX(top.positions) + 0.01);
    // 몸이 넓어져도 상의 정점이 피부 정점의 법선 반대쪽(안쪽)으로 파고들지 않는다(최근접 정점 부호 거리, 2 mm 허용)
    let penetrating = 0;
    for (let v = 0; v < topWide.length / 3; v += 1) {
      let best = Infinity;
      let signed = 0;
      for (let u = 0; u < skinWide.length / 3; u += 1) {
        const dx = topWide[v * 3] - skinWide[u * 3];
        const dy = topWide[v * 3 + 1] - skinWide[u * 3 + 1];
        const dz = topWide[v * 3 + 2] - skinWide[u * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) {
          best = d;
          signed = dx * skin.normals[u * 3] + dy * skin.normals[u * 3 + 1] + dz * skin.normals[u * 3 + 2];
        }
      }
      if (signed < -0.002) penetrating += 1;
    }
    expect(penetrating / (topWide.length / 3)).toBeLessThan(0.02);
  }, 60000);
});

describe("humanoid × planApply(기본 파츠 레이아웃·morph 이름)", () => {
  const manyParams: CharacterRecipe = (() => {
    const base = recipeWith({ hair: "hair/hime-cut", top: "top/blazer", bottom: "bottom/slacks", shoes: "shoes/loafers", accessory: "accessory/glasses" });
    const body: Record<string, number> = {};
    const face: Record<string, number> = {};
    BODY_PARAM_KEYS.forEach((key, i) => (body[key] = i % 2 === 0 ? 0.5 : -0.5));
    FACE_PARAM_KEYS.forEach((key, i) => (face[key] = i % 2 === 0 ? -0.75 : 0.75));
    const expression: Record<string, number> = {};
    for (const unit of FACS_UNITS) expression[unit] = 0.4;
    return { ...base, body, face, expression };
  })();

  it("플랜의 morph 가중치 이름이 모두 모델 morphNames에 있고 FACS 16이 모두 포함된다", () => {
    const model = build(manyParams);
    const plan = planApply(manyParams, ALL_AVAILABLE_CAPABILITIES, catalog);
    const known = new Set(model.morphNames);
    for (const name of Object.keys(plan.morphWeights)) expect(known.has(name)).toBe(true);
    for (const name of ALL_FACS_MORPH_NAMES) expect(known.has(name)).toBe(true);
    expect(Object.keys(plan.morphWeights).length).toBe(BODY_PARAM_KEYS.length + FACE_PARAM_KEYS.length + FACS_UNITS.length);
    // 모든 morph 이름이 최소 한 파츠에서 비영 델타를 가진다(플랜이 적용돼도 아무 일도 없는 이름이 없다)
    for (const name of model.morphNames) {
      const carriers = model.parts.filter((part) => part.morphs.some((morph) => morph.name === name));
      expect(carriers.length).toBeGreaterThan(0);
    }
  });

  it("DEFAULT_PART_LAYOUT의 partId·역할이 모델과 정렬된다(결손 역할은 숨김, 존재 역할은 표시)", () => {
    const cases: CharacterRecipe[] = [
      manyParams,
      recipeWith({}),
      recipeWith({ hair: "hair/soft-bob" }),
      recipeWith({ top: "top/tee", shoes: "shoes/sandals" }),
      recipeWith({ hair: "hair/twin-tail", top: "top/hoodie", bottom: "bottom/shorts", shoes: "shoes/sneakers", accessory: "accessory/cap" }),
    ];
    for (const recipe of cases) {
      const model = build(recipe);
      const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, catalog);
      expect(plan.parts).toHaveLength(DEFAULT_PART_LAYOUT.length);
      for (const planPart of plan.parts) {
        const layout = DEFAULT_PART_LAYOUT.find((entry) => entry.partId === planPart.partId);
        const modelPart = model.parts.find((part) => part.partId === planPart.partId);
        expect(layout).toBeDefined();
        if (modelPart) {
          expect(modelPart.role).toBe(layout?.role);
          expect(planPart.visible).toBe(true);
          expect(model.partIdPalette[planPart.partId]?.role).toBe(layout?.role);
        } else {
          // 모델에 없는 역할은 슬롯이 비어 있어 플랜도 숨긴다(슬롯 없는 역할은 항상 모델에 있다)
          expect(planPart.visible).toBe(false);
        }
      }
    }
  });

  it("지오메트리 키가 같으면 같은 모델, 다르면 다른 모델이다(소스 재생성 키)", () => {
    const a = recipeWith({ hair: "hair/soft-bob", top: "top/tee" });
    const b = { ...a, body: { height: 0.5 }, expression: { mouthSmile: 1 }, colors: { ...a.colors, hair: "#123456" } };
    const c = recipeWith({ hair: "hair/soft-bob", top: "top/hoodie" });
    expect(geometryKeyOf(a)).toBe(geometryKeyOf(b));
    expect(humanoidModelDigest(build(a))).toBe(humanoidModelDigest(build(b)));
    expect(geometryKeyOf(a)).not.toBe(geometryKeyOf(c));
    expect(humanoidModelDigest(build(a))).not.toBe(humanoidModelDigest(build(c)));
  });
});

describe("humanoid × physics(체인·충돌 캡슐)", () => {
  it("모델의 체인·충돌 캡슐로 builtin PBD 솔버가 만들어지고 settle 후 위치가 유한하다", () => {
    const model = build(recipeWith({ hair: "hair/hime-cut", bottom: "bottom/pleated-skirt", accessory: "accessory/ribbon" }));
    const created = createPbdChainSolver(model.chains, model.colliders);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const solver = created.solver;
    const rest = boneWorldMatrices(model.skeleton, {});
    for (const name of HUMANOID_BONE_NAMES) {
      const m = rest.world[rest.order.indexOf(name)];
      solver.setBoneWorld(name, [m[12], m[13], m[14]], [0, 0, 0, 1]);
    }
    expect(solver.pendingColliderBones()).toEqual([]);
    solver.settle(60);
    const positions = solver.positions();
    expect(positions.length).toBeGreaterThan(0);
    for (let i = 0; i < positions.length; i += 1) expect(Number.isFinite(positions[i])).toBe(true);
    // 두 번 settle해도 같은 해시(결정성)
    const again = createPbdChainSolver(model.chains, model.colliders);
    if (!again.ok) throw new Error("두 번째 솔버 생성 실패");
    for (const name of HUMANOID_BONE_NAMES) {
      const m = rest.world[rest.order.indexOf(name)];
      again.solver.setBoneWorld(name, [m[12], m[13], m[14]], [0, 0, 0, 1]);
    }
    again.solver.settle(60);
    expect(again.solver.stateHash()).toBe(solver.stateHash());
  });
});
