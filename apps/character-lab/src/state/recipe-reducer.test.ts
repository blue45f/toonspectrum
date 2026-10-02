import { describe, expect, it } from "vitest";

import { createDefaultRecipe, createPresetCatalog } from "../contracts";
import { presetEntryFixture, samplePose, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { RecipeCommandError, describeCommandKo, mergePoseScoped, normalizePose, reduceRecipe } from "./recipe-reducer";

import type { CharacterRecipe, PresetCatalog } from "../contracts";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function catalogWithPatches(): PresetCatalog {
  const entries = vocabularyCatalogEntries().map((entry) => {
    if (entry.id === "face-shape/round") return presetEntryFixture(entry.id, { patch: { face: { jawWidth: 0.4, chinLength: -0.3, cheekVolume: 0 } } });
    if (entry.id === "face-shape/oval") return presetEntryFixture(entry.id, { patch: { face: { jawWidth: 0, chinLength: 0, cheekVolume: 0 } } });
    if (entry.id === "hair/twin-tail") return presetEntryFixture(entry.id, { patch: { parts: { hair: "twin-tail" }, colors: { hair: "#AABBCC" } }, conflictsWith: ["accessory/cap"] });
    if (entry.id === "accessory/cap") return presetEntryFixture(entry.id, { patch: { parts: { accessory: "cap" }, colors: { accessory: "#112233" } }, conflictsWith: ["hair/twin-tail"] });
    if (entry.id === "pose/wave") return presetEntryFixture(entry.id, { patch: { pose: { leftUpperArm: [0, 0, 2, 2] } } });
    if (entry.id === "hand-pose/fist") {
      return presetEntryFixture(entry.id, { patch: { handPose: { left: { leftIndexProximal: [0, 0, 0.5, 0.5] }, right: { rightIndexProximal: [0, 0, 0, 1] } } } });
    }
    if (entry.id === "expression/joy") return presetEntryFixture(entry.id, { patch: { expression: { mouthSmile: 1.5, jawOpen: 0.2 } } });
    return entry;
  });
  return createPresetCatalog(entries);
}

const catalog = catalogWithPatches();

describe("state/recipe-reducer", () => {
  it("입력 레시피를 바꾸지 않는다(불변성)", () => {
    const recipe = deepFreeze(createDefaultRecipe());
    const next = reduceRecipe(recipe, { type: "slot/apply", slot: "face-shape", presetId: "face-shape/round" }, catalog);
    expect(next).not.toBe(recipe);
    expect(recipe.face).toEqual({});
    expect(next.face).toEqual({ jawWidth: 0.4, chinLength: -0.3 });
  });

  it("slot/apply는 patch만 적용하고 conflictsWith는 적용하지 않는다", () => {
    const base = createDefaultRecipe();
    const withHair = reduceRecipe(base, { type: "slot/apply", slot: "hair", presetId: "hair/twin-tail" }, catalog);
    expect(withHair.slots.hair).toBe("hair/twin-tail");
    expect(withHair.colors.hair).toBe("#aabbcc");
    const withCap = reduceRecipe(withHair, { type: "slot/apply", slot: "accessory", presetId: "accessory/cap" }, catalog);
    expect(withCap.slots.hair).toBe("hair/twin-tail");
    expect(withCap.slots.accessory).toBe("accessory/cap");
    expect(withCap.colors.accessory).toBe("#112233");
    expect(withCap.colors.skin).toBe(base.colors.skin);
  });

  it("같은 슬롯의 다른 프리셋은 이전 프리셋이 다루던 키를 덮어쓴다(0 → 키 제거)", () => {
    const round = reduceRecipe(createDefaultRecipe(), { type: "slot/apply", slot: "face-shape", presetId: "face-shape/round" }, catalog);
    const oval = reduceRecipe(round, { type: "slot/apply", slot: "face-shape", presetId: "face-shape/oval" }, catalog);
    expect(oval.face).toEqual({});
    expect(oval.slots["face-shape"]).toBe("face-shape/oval");
  });

  it("slot/apply null은 슬롯만 비우고 나머지는 유지한다", () => {
    const base = createDefaultRecipe();
    const next = reduceRecipe(base, { type: "slot/apply", slot: "accessory", presetId: null }, catalog);
    expect(next).toBe(base);
    const withCap = reduceRecipe(base, { type: "slot/apply", slot: "accessory", presetId: "accessory/cap" }, catalog);
    const cleared = reduceRecipe(withCap, { type: "slot/apply", slot: "accessory", presetId: null }, catalog);
    expect(cleared.slots.accessory).toBeNull();
    expect(cleared.colors.accessory).toBe("#112233");
  });

  it("slot/apply는 슬롯 불일치·미등록 프리셋을 거부한다", () => {
    const base = createDefaultRecipe();
    expect(() => reduceRecipe(base, { type: "slot/apply", slot: "hair", presetId: "eyes/round" }, catalog)).toThrowError(RecipeCommandError);
    try {
      reduceRecipe(base, { type: "slot/apply", slot: "hair", presetId: "hair/mohawk" }, catalog);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeCommandError);
      expect((error as RecipeCommandError).code).toBe("command-preset-unknown");
      expect((error as RecipeCommandError).message).toMatch(/[가-힣]/u);
    }
  });

  it("param/set은 클램프하고 0이면 키를 지우며 같은 값이면 같은 참조를 돌려준다", () => {
    const base = createDefaultRecipe();
    const a = reduceRecipe(base, { type: "param/set", group: "body", key: "height", value: 3 }, catalog);
    expect(a.body).toEqual({ height: 1 });
    const b = reduceRecipe(a, { type: "param/set", group: "body", key: "height", value: 1 }, catalog);
    expect(b).toBe(a);
    const c = reduceRecipe(a, { type: "param/set", group: "body", key: "height", value: 0 }, catalog);
    expect(c.body).toEqual({});
    const d = reduceRecipe(base, { type: "param/set", group: "face", key: "eyeSize", value: -0.25 }, catalog);
    expect(d.face).toEqual({ eyeSize: -0.25 });
    expect(() => reduceRecipe(base, { type: "param/set", group: "body", key: "eyeSize", value: 0.1 }, catalog)).toThrowError(/체형 파라미터가 아닙니다/u);
    expect(() => reduceRecipe(base, { type: "param/set", group: "face", key: "eyeSize", value: Number.NaN }, catalog)).toThrowError(/숫자가 아닙니다/u);
  });

  it("color/set은 소문자 정규형으로 저장하고 잘못된 형식을 거부한다", () => {
    const base = createDefaultRecipe();
    const next = reduceRecipe(base, { type: "color/set", key: "skin", value: "#FFAA00" }, catalog);
    expect(next.colors.skin).toBe("#ffaa00");
    expect(reduceRecipe(next, { type: "color/set", key: "skin", value: "#ffaa00" }, catalog)).toBe(next);
    expect(() => reduceRecipe(base, { type: "color/set", key: "skin", value: "red" }, catalog)).toThrowError(/#rrggbb/u);
    expect(() => reduceRecipe(base, { type: "color/set", key: "nope" as never, value: "#000000" }, catalog)).toThrowError(/색 키가 아닙니다/u);
  });

  it("expression/set은 merge 여부에 따라 병합·교체하고 [0,1]로 클램프한다", () => {
    const base = createDefaultRecipe();
    const a = reduceRecipe(base, { type: "expression/set", weights: { mouthSmile: 2, jawOpen: 0.5 }, merge: false }, catalog);
    expect(a.expression).toEqual({ mouthSmile: 1, jawOpen: 0.5 });
    const b = reduceRecipe(a, { type: "expression/set", weights: { browDown: 0.3, jawOpen: 0 }, merge: true }, catalog);
    expect(b.expression).toEqual({ mouthSmile: 1, browDown: 0.3 });
    const c = reduceRecipe(b, { type: "expression/set", weights: { eyeWide: 0.4 }, merge: false }, catalog);
    expect(c.expression).toEqual({ eyeWide: 0.4 });
    const joy = reduceRecipe(base, { type: "slot/apply", slot: "expression", presetId: "expression/joy" }, catalog);
    expect(joy.expression).toEqual({ mouthSmile: 1, jawOpen: 0.2 });
  });

  it("pose/set은 스코프 안만 교체하고 쿼터니언을 정규화한다", () => {
    const base = { ...createDefaultRecipe(), pose: { ...samplePose(), head: [0, 0, 0, 1] as const } };
    const next = reduceRecipe(base, { type: "pose/set", pose: { leftUpperArm: [0, 0, 2, 2], hips: [0, 2, 0, 0] }, scope: "arms-hands", labelKo: "왼팔" }, catalog);
    expect(next.pose.leftUpperArm?.map((v) => Number(v.toFixed(6)))).toEqual([0, 0, 0.707107, 0.707107]);
    expect(next.pose.rightUpperArm).toBeUndefined();
    expect(next.pose.head).toEqual([0, 0, 0, 1]);
    expect(next.pose.hips).toBeUndefined();
    expect(() => reduceRecipe(base, { type: "pose/set", pose: { head: [0, 0, 0, 0] }, scope: "full", labelKo: "x" }, catalog)).toThrowError(/정규화할 수 없습니다/u);
    expect(() => reduceRecipe(base, { type: "pose/set", pose: { head: [Number.NaN, 0, 0, 1] }, scope: "full", labelKo: "x" }, catalog)).toThrowError(/쿼터니언/u);
    const preset = reduceRecipe(base, { type: "slot/apply", slot: "pose", presetId: "pose/wave" }, catalog);
    expect(Object.keys(preset.pose)).toEqual(["leftUpperArm"]);
  });

  it("hand-pose/set은 한쪽 손만 바꾼다", () => {
    const base = createDefaultRecipe();
    const left = reduceRecipe(base, { type: "hand-pose/set", side: "left", presetId: "hand-pose/fist" }, catalog);
    expect(left.slots["hand-pose"]).toBe("hand-pose/fist");
    expect(left.handPose.left.leftIndexProximal?.map((v) => Number(v.toFixed(6)))).toEqual([0, 0, 0.707107, 0.707107]);
    expect(left.handPose.right).toEqual({});
    const cleared = reduceRecipe(left, { type: "hand-pose/set", side: "left", presetId: null }, catalog);
    expect(cleared.handPose.left).toEqual({});
    expect(cleared.slots["hand-pose"]).toBeNull();
    expect(() => reduceRecipe(base, { type: "hand-pose/set", side: "left", presetId: "hand-pose/open" }, catalog)).toThrowError(/왼손 포즈가 없습니다/u);
    expect(() => reduceRecipe(base, { type: "hand-pose/set", side: "left", presetId: "pose/idle" }, catalog)).toThrowError(RecipeCommandError);
  });

  it("shading/set·physics/set-provider·source/set을 적용하고 잘못된 값을 거부한다", () => {
    const base = createDefaultRecipe();
    const shaded = reduceRecipe(base, { type: "shading/set", profile: { mode: "toon", postfx: { taa: true } as never } }, catalog);
    expect(shaded.shading.mode).toBe("toon");
    expect(shaded.shading.postfx.taa).toBe(true);
    expect(shaded.shading.postfx.fxaa).toBe(base.shading.postfx.fxaa);
    expect(() => reduceRecipe(base, { type: "shading/set", profile: { shadows: { cascades: 7 } as never } }, catalog)).toThrowError(/셰이딩 프로파일/u);
    const physics = reduceRecipe(base, { type: "physics/set-provider", provider: "rapier" }, catalog);
    expect(physics.physics.provider).toBe("rapier");
    expect(reduceRecipe(physics, { type: "physics/set-provider", provider: "rapier" }, catalog)).toBe(physics);
    expect(() => reduceRecipe(base, { type: "physics/set-provider", provider: "bullet" as never }, catalog)).toThrowError(/물리 provider/u);
    const source = reduceRecipe(base, { type: "source/set", source: { kind: "package", characterId: "orion", sha256: "a".repeat(64) }, capabilities: base.slots as never }, catalog);
    expect(source.source).toEqual({ kind: "package", characterId: "orion", sha256: "a".repeat(64) });
    expect(() => reduceRecipe(base, { type: "source/set", source: { kind: "package", characterId: "X!", sha256: "zz" } as never, capabilities: base.slots as never }, catalog)).toThrowError(/소스 형식/u);
  });

  it("recipe/load는 파싱된 레시피로 교체하고 버전 불일치를 거부한다", () => {
    const base = createDefaultRecipe();
    const loaded: CharacterRecipe = { ...base, colors: { ...base.colors, hair: "#010203" } };
    const next = reduceRecipe(base, { type: "recipe/load", recipe: JSON.parse(JSON.stringify(loaded)) as CharacterRecipe }, catalog);
    expect(next).toEqual(loaded);
    try {
      reduceRecipe(base, { type: "recipe/load", recipe: { ...base, version: 2 } as never }, catalog);
      expect.unreachable();
    } catch (error) {
      expect((error as RecipeCommandError).code).toBe("recipe-unsupported-version");
    }
  });

  it("normalizePose·mergePoseScoped 보조 함수", () => {
    expect(normalizePose({ head: [0, 0, 0, 3] })).toEqual({ head: [0, 0, 0, 1] });
    const merged = mergePoseScoped({ head: [0, 0, 0, 1], hips: [0, 0, 0, 1] }, { hips: [0, 0, 0, 1], head: [0, 1, 0, 0] }, "lower");
    expect(merged).toEqual({ head: [0, 0, 0, 1], hips: [0, 0, 0, 1] });
  });

  it("describeCommandKo는 한글 라벨을 만든다", () => {
    expect(describeCommandKo({ type: "slot/apply", slot: "hair", presetId: "hair/soft-bob" }, catalog)).toBe("헤어: 헤어 soft-bob");
    expect(describeCommandKo({ type: "slot/apply", slot: "accessory", presetId: null })).toBe("액세서리: 없음");
    expect(describeCommandKo({ type: "param/set", group: "face", key: "eyeSize", value: 0.1 })).toContain("얼굴 파라미터");
    expect(describeCommandKo({ type: "pose/set", pose: {}, scope: "full", labelKo: "사진 포즈" })).toBe("사진 포즈");
    expect(describeCommandKo({ type: "hand-pose/set", side: "right", presetId: "hand-pose/fist" }, catalog)).toContain("오른손");
    expect(describeCommandKo({ type: "physics/set-provider", provider: "havok" })).toContain("Havok");
    expect(describeCommandKo({ type: "source/set", source: { kind: "procedural" }, capabilities: {} as never })).toBe("소스: 절차적");
    expect(describeCommandKo({ type: "recipe/load", recipe: createDefaultRecipe() })).toMatch(/[가-힣]/u);
  });
});
