import { describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, PART_ROLES, createDefaultRecipe, createPresetCatalog, isUnitQuat } from "../contracts";
import { presetEntryFixture, samplePose, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { DEFAULT_PART_LAYOUT, createApplyPlanner, layoutFromPalette, materialPresetFor, planApply, planWithPreset, presetConflicts, unmetRequirement } from "./apply-plan";

import type { CharacterRecipe, PresetCatalog, SlotCapabilityMap } from "../contracts";

function catalog(): PresetCatalog {
  const entries = vocabularyCatalogEntries().map((entry) => {
    switch (entry.id) {
      case "face-shape/round":
        return presetEntryFixture(entry.id, { patch: { face: { jawWidth: 0.4, chinLength: -0.3 } }, requires: ["morph:param:jawWidth:+", "morph:param:chinLength:-"] });
      case "body/tall":
        return presetEntryFixture(entry.id, { patch: { body: { height: 0.7, legLength: 0.5 } }, requires: ["morph:param:height:+"] });
      case "hair/twin-tail":
        return presetEntryFixture(entry.id, { patch: { parts: { hair: "twin-tail" } }, conflictsWith: ["accessory/cap"] });
      case "accessory/cap":
        return presetEntryFixture(entry.id, { patch: { parts: { accessory: "cap" }, colors: { accessory: "#112233" } }, conflictsWith: ["hair/twin-tail"] });
      case "expression/joy":
        return presetEntryFixture(entry.id, { patch: { expression: { mouthSmile: 0.9 } }, requires: ["morph:facs:mouthSmile"] });
      case "pose/wave":
        return presetEntryFixture(entry.id, { patch: { pose: samplePose() }, requires: ["bone:leftUpperArm", "slot:pose"] });
      case "hand-pose/fist":
        return presetEntryFixture(entry.id, { patch: { handPose: { left: { leftIndexProximal: [0, 0, 1, 1] }, right: {} } } });
      default:
        return entry;
    }
  });
  return createPresetCatalog(entries);
}

const CATALOG = catalog();

function recipeAllSlots(): CharacterRecipe {
  const base = createDefaultRecipe();
  return {
    ...base,
    slots: { ...base.slots, "face-shape": "face-shape/round", body: "body/tall", hair: "hair/twin-tail", accessory: "accessory/cap", expression: "expression/joy", pose: "pose/wave", "hand-pose": "hand-pose/fist" },
    face: { jawWidth: 0.4, chinLength: -0.3, eyeSize: 0.2 },
    body: { height: 0.7, legLength: 0.5, waist: -0.1 },
    expression: { mouthSmile: 0.9, jawOpen: 0.3 },
    pose: samplePose(),
    handPose: { left: { leftIndexProximal: [0, 0, 1, 1] }, right: {} },
  };
}

function capabilitiesWith(overrides: Partial<SlotCapabilityMap>): SlotCapabilityMap {
  return { ...ALL_AVAILABLE_CAPABILITIES, ...overrides };
}

describe("state/apply-plan", () => {
  it("절차 소스(전부 available)는 모든 슬롯을 적용한다", () => {
    const plan = planApply(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.unsupported).toEqual([]);
    expect(plan.morphWeights).toMatchObject({
      "param:jawWidth:+": 0.4,
      "param:chinLength:-": 0.3,
      "param:eyeSize:+": 0.2,
      "param:height:+": 0.7,
      "param:legLength:+": 0.5,
      "param:waist:-": 0.1,
      "facs:mouthSmile": 0.9,
      "facs:jawOpen": 0.3,
    });
    expect(Object.keys(plan.boneRotations).sort()).toEqual(["leftIndexProximal", "leftUpperArm", "rightUpperArm"]);
    expect(plan.colors).toEqual(recipeAllSlots().colors);
    expect(plan.physics).toEqual({ provider: "builtin-pbd", settleSteps: 0 });
    expect(plan.revision).toBe(0);
  });

  it("가중치는 [0,1] 안이고 본 회전은 정규화된다", () => {
    const plan = planApply(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    for (const weight of Object.values(plan.morphWeights)) {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
    for (const quat of Object.values(plan.boneRotations)) expect(isUnitQuat(quat)).toBe(true);
    expect(plan.boneRotations.leftIndexProximal?.map((v) => Number(v.toFixed(6)))).toEqual([0, 0, 0.707107, 0.707107]);
  });

  it("기본 레이아웃은 PART_ROLES 순서로 partId 1..n이며 슬롯별 가시성·색·재질을 채운다", () => {
    const plan = planApply(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.parts.map((p) => p.partId)).toEqual(PART_ROLES.map((_, i) => i + 1));
    const byRole = Object.fromEntries(DEFAULT_PART_LAYOUT.map((entry, i) => [entry.role, plan.parts[i]]));
    expect(byRole.hair).toMatchObject({ visible: true, materialPreset: "hair-aniso", color: recipeAllSlots().colors.hair });
    expect(byRole.accessory).toMatchObject({ visible: true, materialPreset: "cloth-cotton", color: recipeAllSlots().colors.accessory });
    expect(byRole.skin).toMatchObject({ visible: true, materialPreset: "skin-sss", color: recipeAllSlots().colors.skin });
    expect(byRole.eyeball).toMatchObject({ visible: true, materialPreset: "eye-wet" });
    expect(byRole.eyeball?.color).toBeUndefined();
    expect(byRole.bottom).toMatchObject({ visible: true, materialPreset: "cloth-denim" });
  });

  it("비어 있는 슬롯(accessory null)의 파츠는 숨긴다", () => {
    const plan = planApply(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    const accessory = plan.parts.find((p) => p.partId === PART_ROLES.indexOf("accessory") + 1);
    expect(accessory?.visible).toBe(false);
  });

  it("unavailable 슬롯은 미적용 + 사유, 그 프리셋의 파라미터 morph는 제외, 파츠는 소스 기본값 유지", () => {
    const capabilities = capabilitiesWith({
      "face-shape": { status: "unavailable", reasonKo: "패키지에 jawWidth shape key가 없습니다" },
      hair: { status: "unavailable", reasonKo: "제작 패키지는 교체형 헤어를 제공하지 않습니다" },
      expression: { status: "unavailable" },
    });
    const plan = planApply(recipeAllSlots(), capabilities, CATALOG);
    expect(plan.unsupported).toEqual([
      { slot: "face-shape", presetId: "face-shape/round", reasonKo: "패키지에 jawWidth shape key가 없습니다" },
      { slot: "hair", presetId: "hair/twin-tail", reasonKo: "제작 패키지는 교체형 헤어를 제공하지 않습니다" },
      { slot: "expression", presetId: "expression/joy", reasonKo: "표정 슬롯을 소스가 지원하지 않습니다." },
    ]);
    expect(plan.morphWeights["param:jawWidth:+"]).toBeUndefined();
    expect(plan.morphWeights["param:chinLength:-"]).toBeUndefined();
    expect(plan.morphWeights["param:eyeSize:+"]).toBe(0.2);
    expect(plan.morphWeights["facs:mouthSmile"]).toBeUndefined();
    const hair = plan.parts.find((p) => p.partId === PART_ROLES.indexOf("hair") + 1);
    expect(hair?.visible).toBe(true);
    expect(hair?.materialPreset).toBe("hair-aniso");
  });

  it("features를 주면 morph:·bone: requires 불충족을 unsupported로 노출한다(대체 없음)", () => {
    const planner = createApplyPlanner({ features: { morphNames: ["param:jawWidth:+", "facs:mouthSmile"], boneNames: ["hips"] } });
    const plan = planner(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    const bySlot = Object.fromEntries(plan.unsupported.map((u) => [u.slot, u.reasonKo]));
    expect(bySlot["face-shape"]).toContain('"param:chinLength:-"');
    expect(bySlot.body).toContain('"param:height:+"');
    expect(bySlot.pose).toContain('"leftUpperArm"');
    expect(bySlot.expression).toBeUndefined();
    expect(plan.boneRotations.leftUpperArm).toBeUndefined();
    expect(plan.boneRotations.leftIndexProximal).toBeDefined();
    expect(plan.morphWeights["param:height:+"]).toBeUndefined();
    expect(plan.morphWeights["param:waist:-"]).toBe(0.1);
  });

  it("features가 없으면 slot: 요구만 검사한다", () => {
    const plan = planApply(recipeAllSlots(), capabilitiesWith({ pose: { status: "unavailable", reasonKo: "본 없음" } }), CATALOG);
    expect(plan.unsupported).toEqual([{ slot: "pose", presetId: "pose/wave", reasonKo: "본 없음" }]);
    const entry = CATALOG.get("pose/wave");
    expect(entry && unmetRequirement(entry, capabilitiesWith({ pose: { status: "unavailable" } }))).toBe("포즈 슬롯을 소스가 지원하지 않습니다.");
    expect(entry && unmetRequirement(entry, ALL_AVAILABLE_CAPABILITIES)).toBeNull();
    expect(unmetRequirement(presetEntryFixture("ears/small", { requires: ["weird"] }), ALL_AVAILABLE_CAPABILITIES)).toMatch(/형식이 틀립니다/u);
    expect(unmetRequirement(presetEntryFixture("ears/small", { requires: ["slot:nope"] }), ALL_AVAILABLE_CAPABILITIES)).toMatch(/어휘 밖/u);
  });

  it("conflictsWith 충돌과 partial 능력은 partial 사유로 노출되며 적용은 된다", () => {
    const planner = createApplyPlanner();
    const plan = planner(recipeAllSlots(), capabilitiesWith({ body: { status: "partial", reasonKo: "음수 방향 shape key 없음" } }), CATALOG);
    expect(plan.unsupported).toEqual([]);
    expect(plan.partial).toEqual([
      { slot: "body", presetId: "body/tall", reasonKo: "음수 방향 shape key 없음" },
      { slot: "hair", presetId: "hair/twin-tail", reasonKo: "액세서리 cap(액세서리)와 함께 쓰면 겹침이 생길 수 있습니다." },
      { slot: "accessory", presetId: "accessory/cap", reasonKo: "헤어 twin-tail(헤어)와 함께 쓰면 겹침이 생길 수 있습니다." },
    ]);
    expect(plan.morphWeights["param:height:+"]).toBe(0.7);
    const twinTail = CATALOG.get("hair/twin-tail");
    expect(twinTail && presetConflicts(twinTail, recipeAllSlots(), CATALOG).map((e) => e.id)).toEqual(["accessory/cap"]);
    expect(twinTail && presetConflicts(twinTail, createDefaultRecipe(), CATALOG)).toEqual([]);
  });

  it("카탈로그에 없는 프리셋은 unsupported로 노출한다", () => {
    const recipe = { ...createDefaultRecipe(), slots: { ...createDefaultRecipe().slots, hair: "hair/mohawk" as const } };
    const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.unsupported).toEqual([{ slot: "hair", presetId: "hair/mohawk", reasonKo: "카탈로그에 없는 프리셋입니다: hair/mohawk" }]);
  });

  it("variant 레이아웃은 선택된 어휘 이름의 파츠만 보이게 한다", () => {
    const layout = [
      { partId: 1, role: "skin" as const },
      { partId: 2, role: "hair" as const, variant: "soft-bob" },
      { partId: 3, role: "hair" as const, variant: "twin-tail" },
      { partId: 4, role: "accessory" as const, variant: "cap" },
      { partId: 5, role: "accessory" as const, variant: "glasses" },
    ];
    const planner = createApplyPlanner({ partLayout: layout, settleSteps: 120 });
    const plan = planner(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.parts.map((p) => [p.partId, p.visible])).toEqual([
      [1, true],
      [2, false],
      [3, true],
      [4, true],
      [5, false],
    ]);
    expect(plan.physics.settleSteps).toBe(120);
  });

  it("layoutFromPalette는 partId 오름차순 레이아웃을 만든다", () => {
    const layout = layoutFromPalette({ 3: { role: "hair", labelKo: "헤어" }, 1: { role: "skin", labelKo: "피부" }, 2: { role: "top", labelKo: "상의" } }, { 3: "soft-bob" });
    expect(layout).toEqual([
      { partId: 1, role: "skin" },
      { partId: 2, role: "top" },
      { partId: 3, role: "hair", variant: "soft-bob" },
    ]);
  });

  it("materialPresetFor는 프리셋별 재질을 우선하고 없으면 역할 기본값을 쓴다", () => {
    expect(materialPresetFor("bottom", "bottom/long-skirt")).toBe("cloth-silk");
    expect(materialPresetFor("accessory", "accessory/glasses")).toBe("metal");
    expect(materialPresetFor("accessory", null)).toBe("plastic");
    expect(materialPresetFor("hair", "hair/soft-bob")).toBe("hair-aniso");
  });

  it("planWithPreset은 프리셋을 임시 적용해 플랜을 만들고 원 레시피는 바꾸지 않는다", () => {
    const recipe = createDefaultRecipe();
    const plan = planWithPreset(recipe, "face-shape/round", ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.morphWeights["param:jawWidth:+"]).toBe(0.4);
    expect(recipe.face).toEqual({});
    expect(() => planWithPreset(recipe, "hair/mohawk", ALL_AVAILABLE_CAPABILITIES, CATALOG)).toThrowError(/카탈로그에 없는 프리셋/u);
  });
});
