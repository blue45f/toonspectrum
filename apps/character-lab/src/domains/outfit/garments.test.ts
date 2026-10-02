import { describe, expect, it } from "vitest";

import { PHYSICS_BUDGET, SLOT_PRESET_IDS, paramMorphName, validateMeshPartData } from "../../contracts";
import { fnv1a64HexBytes } from "../../shared/hash";

import { bodySurfaceFixture } from "./fixtures";
import { penetrationRatio } from "./follow-body";
import { ACCESSORY_SPECS, BOTTOM_SPECS, SHOES_SPECS, TOP_SPECS, buildAccessory, buildBottom, buildGarments, buildShoes, buildTop, createGarmentEnv, minimumNormalOffset } from "./garments";
import { OUTFIT_AUX_BONE_INDEX_BASE } from "./hair-builder";

import type { BodyMapping } from "./follow-body";
import type { GarmentSelection, MeshPartData, OutfitBuildContext } from "../../contracts";

const fixture = bodySurfaceFixture();

function context(seed = 3): OutfitBuildContext {
  return {
    seed,
    headSize: 1,
    colors: { skin: "#f1c9a5", iris: "#3a5a98", hair: "#2b1d12", brow: "#2b1d12", top: "#ffffff", bottom: "#223355", shoes: "#111111", accessory: "#aa3344" },
  };
}

function env() {
  return createGarmentEnv(fixture.body, fixture.morphs, context());
}

function bytes(parts: readonly MeshPartData[]): string {
  const chunks = parts.flatMap((p) => [p.positions, p.normals, p.uvs, p.jointWeights ?? new Float32Array(0), ...p.morphs.map((m) => m.deltaPositions)]);
  const merged = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return fnv1a64HexBytes(new Uint8Array(merged.buffer));
}

function expectValid(part: MeshPartData, role: MeshPartData["role"]): void {
  expect(part.partId).toBe(0);
  expect(part.materialId).toBe(0);
  expect(part.role).toBe(role);
  expect(part.colorKey).toBe(role);
  const failure = validateMeshPartData({ ...part, partId: 1 });
  expect(failure, `${part.id}: ${failure?.reasonKo ?? ""}`).toBeNull();
  expect(part.indices.length).toBeGreaterThan(0);
  expect(part.morphs.map((m) => m.name)).toEqual(fixture.morphs.map((m) => m.name));
}

describe("outfit/garments", () => {
  it("상의 5종: 유효 메시·법선 방향 오프셋 > 0·소매 덮임 차이", () => {
    expect(Object.keys(TOP_SPECS)).toEqual([...SLOT_PRESET_IDS.top]);
    const vertexCounts: Record<string, number> = {};
    for (const id of SLOT_PRESET_IDS.top) {
      const build = buildTop(id, env());
      expect(build.parts.length).toBeGreaterThanOrEqual(1);
      build.parts.forEach((part, i) => {
        expectValid(part, "top");
        expect(part.id.startsWith(`top-${id}`)).toBe(true);
        if (i === 0) expect(minimumNormalOffset(part, build.mappings[i], fixture.body)).toBeGreaterThan(0);
      });
      vertexCounts[id] = build.parts[0].positions.length / 3;
    }
    // 긴 소매(후디)는 반소매(티셔츠)보다 정점이 많다
    expect(vertexCounts.hoodie).toBeGreaterThan(vertexCounts.tee);
    const sailor = buildTop("sailor", env());
    expect(sailor.parts.map((p) => p.id)).toEqual(["top-sailor", "top-sailor-ribbon"]);
  });

  it("하의 5종: 유효 메시, 스커트는 skirt 체인·보조 본을 만들고 바지는 만들지 않는다", () => {
    expect(Object.keys(BOTTOM_SPECS)).toEqual([...SLOT_PRESET_IDS.bottom]);
    for (const id of SLOT_PRESET_IDS.bottom) {
      const e = env();
      const build = buildBottom(id, e);
      expect(build.parts.length).toBe(1);
      expectValid(build.parts[0], "bottom");
      const spec = BOTTOM_SPECS[id];
      if (spec.skirt) {
        expect(e.chains.length).toBe(spec.skirt.strips);
        expect(e.chains.every((c) => c.role === "skirt")).toBe(true);
        expect(e.chains.every((c) => c.boneNames.length === spec.skirt!.rows + 1)).toBe(true);
        expect(e.bones.length).toBe(spec.skirt.strips * (spec.skirt.rows + 1));
        expect(e.bones.filter((b) => b.parent === "hips").length).toBe(spec.skirt.strips);
        expect(e.bones.every((b) => /^skirt_\d+_\d+$/u.test(b.name))).toBe(true);
        // 스커트 정점은 엉덩이 아래로 늘어진다
        let minY = Number.POSITIVE_INFINITY;
        const positions = build.parts[0].positions;
        for (let v = 1; v < positions.length; v += 3) minY = Math.min(minY, positions[v]);
        expect(minY).toBeLessThan(0.75);
      } else {
        expect(e.chains.length).toBe(0);
        expect(e.bones.length).toBe(0);
      }
    }
    const shorts = buildBottom("shorts", env()).parts[0].positions.length;
    const jeans = buildBottom("jeans", env()).parts[0].positions.length;
    expect(jeans).toBeGreaterThan(shorts);
  });

  it("신발 4종: 유효 메시, 밑창이 발 아래에 있고 부츠는 종아리까지 덮는다", () => {
    expect(Object.keys(SHOES_SPECS)).toEqual([...SLOT_PRESET_IDS.shoes]);
    const maxY: Record<string, number> = {};
    for (const id of SLOT_PRESET_IDS.shoes) {
      const build = buildShoes(id, env());
      expect(build.parts.length).toBe(1);
      expectValid(build.parts[0], "shoes");
      const positions = build.parts[0].positions;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let v = 1; v < positions.length; v += 3) {
        min = Math.min(min, positions[v]);
        max = Math.max(max, positions[v]);
      }
      expect(min).toBeLessThan(0.0);
      maxY[id] = max;
    }
    expect(maxY.boots).toBeGreaterThan(maxY.sneakers + 0.1);
    expect(maxY.sandals).toBeLessThan(maxY.loafers);
  });

  it("액세서리 6종: 유효 메시, 리본·귀걸이는 ribbon 체인, 나머지는 체인 없음", () => {
    expect(Object.keys(ACCESSORY_SPECS)).toEqual([...SLOT_PRESET_IDS.accessory]);
    for (const id of SLOT_PRESET_IDS.accessory) {
      const e = env();
      const build = buildAccessory(id, e);
      expect(build.parts.length).toBe(1);
      expectValid(build.parts[0], "accessory");
      if (id === "ribbon" || id === "earrings") {
        expect(e.chains.length).toBe(2);
        expect(e.chains.every((c) => c.role === "ribbon")).toBe(true);
        expect(e.bones.every((b) => /^ribbon_\d+_\d+$/u.test(b.name))).toBe(true);
      } else {
        expect(e.chains.length).toBe(0);
      }
      // 머리 액세서리는 머리 높이 근방
      if (id !== "choker") {
        const positions = build.parts[0].positions;
        let maxY = Number.NEGATIVE_INFINITY;
        for (let v = 1; v < positions.length; v += 3) maxY = Math.max(maxY, positions[v]);
        expect(maxY).toBeGreaterThan(1.5);
      }
    }
  });

  it("buildGarments: 20종 전체 조합이 유효하고 체인 예산 안이며 보조 본 이름이 유일하다", () => {
    const selection: GarmentSelection = { top: "sailor", bottom: "pleated-skirt", shoes: "boots", accessory: "earrings" };
    const result = buildGarments(selection, fixture.body, fixture.morphs, context());
    expect(result.parts.map((p) => p.id)).toEqual(["top-sailor", "top-sailor-ribbon", "bottom-pleated-skirt", "shoes-boots", "accessory-earrings"]);
    result.parts.forEach((part, i) => expect(validateMeshPartData({ ...part, partId: i + 1 })).toBeNull());
    expect(result.chains.length).toBe(2 + 12 + 2);
    expect(result.chains.length).toBeLessThanOrEqual(PHYSICS_BUDGET.maxChains);
    const names = result.bones.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(result.chains.map((c) => c.id)).size).toBe(result.chains.length);
    // 보조 본 인덱스는 55 + bones 범위 안
    for (const part of result.parts) {
      const joints = part.jointIndices as Uint16Array;
      for (let i = 0; i < joints.length; i += 1) {
        if (joints[i] >= OUTFIT_AUX_BONE_INDEX_BASE) expect(joints[i] - OUTFIT_AUX_BONE_INDEX_BASE).toBeLessThan(result.bones.length);
      }
    }
    const empty = buildGarments({ top: null, bottom: null, shoes: null, accessory: null }, fixture.body, fixture.morphs, context());
    expect(empty.parts).toEqual([]);
    expect(empty.chains).toEqual([]);
  });

  it("체형 morph 전파: 어깨 너비 +1이면 상의 정점이 바깥으로 움직이고 관통 비율 ≤1%", () => {
    const build = buildTop("tee", env());
    const part = build.parts[0];
    const mapping: BodyMapping = build.mappings[0];
    const morph = part.morphs.find((m) => m.name === paramMorphName("shoulderWidth", "+"));
    const bodyMorph = fixture.morphs.find((m) => m.name === paramMorphName("shoulderWidth", "+"));
    if (!morph || !bodyMorph) throw new Error("morph 없음");
    let outward = 0;
    let moved = 0;
    for (let v = 0; v < part.positions.length / 3; v += 1) {
      const dx = morph.deltaPositions[v * 3];
      if (Math.abs(dx) < 1e-6) continue;
      moved += 1;
      if (Math.sign(dx) === Math.sign(part.positions[v * 3])) outward += 1;
    }
    expect(moved).toBeGreaterThan(20);
    expect(outward / moved).toBeGreaterThan(0.95);
    expect(penetrationRatio(part.positions, morph.deltaPositions, fixture.body, bodyMorph.deltaPositions, mapping)).toBeLessThanOrEqual(0.01);
    const hip = fixture.morphs.find((m) => m.name === paramMorphName("hip", "+"));
    const skirt = buildBottom("long-skirt", env());
    const skirtMorph = skirt.parts[0].morphs.find((m) => m.name === hip?.name);
    expect(skirtMorph && Math.max(...Array.from(skirtMorph.deltaPositions).map(Math.abs))).toBeGreaterThan(0.005);
  });

  it("결정성: 같은 입력은 같은 바이트", () => {
    const selection: GarmentSelection = { top: "hoodie", bottom: "long-skirt", shoes: "sandals", accessory: "ribbon" };
    const a = buildGarments(selection, fixture.body, fixture.morphs, context());
    const b = buildGarments(selection, fixture.body, fixture.morphs, context());
    expect(bytes(a.parts)).toBe(bytes(b.parts));
    expect(a.bones).toEqual(b.bones);
    expect(a.chains).toEqual(b.chains);
  });
});
