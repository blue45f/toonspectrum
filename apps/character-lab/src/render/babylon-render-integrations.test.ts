/**
 * 엔진 통합(NullEngine): humanoid 요청 §4.2(머리 54 morph의 텍스처 모드·한계 보고), §4.3(입 안 UV 섬 어둡게), IBL 소유권(실제 장면에 만든다),
 * 절차 메시 감김 방향. GPU 셰이더·실제 픽셀은 검증하지 못한다(브라우저 미검증, docs/parity/render.md).
 */
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SHADING } from "../contracts";
import { parseGlb } from "../testing/minimal-glb";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { MOUTH_MASK_SIZE } from "./mouth-shade";
import { createFakeIbl, createNullEngineHarness } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { HumanoidModelData } from "../contracts";
import type { NullEngineHarness, NullHarnessOptions } from "./testing/null-engine-harness";
import type { Scene } from "@babylonjs/core/scene.js";

let harness: NullEngineHarness | null = null;
afterEach(() => {
  harness?.dispose();
  harness = null;
});

/** 머리 파츠에 morph 타깃 `count`개(모두 같은 크기의 작은 변위)를 단 모델 */
function modelWithHeadMorphs(count: number): HumanoidModelData {
  const base = createProceduralFixture();
  const names = Array.from({ length: count }, (_, i) => `facs:synthetic${i}`);
  const parts = base.parts.map((part) => {
    if (part.id !== "head") return part;
    const vertexCount = part.positions.length / 3;
    return { ...part, morphs: names.map((name) => ({ name, deltaPositions: new Float32Array(vertexCount * 3).fill(0.001) })) };
  });
  return { ...base, parts, morphNames: names };
}

async function boot(model: HumanoidModelData, options: NullHarnessOptions = {}): Promise<{ readonly h: NullEngineHarness; readonly scene: Scene }> {
  harness = await createNullEngineHarness({ now: () => 1_000, ...options });
  await harness.engine.loadSource({ kind: "procedural", model });
  const scene = harness.nullEngine.scenes[0];
  if (!scene) throw new Error("장면이 없습니다.");
  return { h: harness, scene };
}

describe("머리 morph의 저장 방식·한계 보고(§4.2)", () => {
  it("54 타깃은 층 한계(128) 안이라 텍스처 모드로 동작하고 규모를 보고한다", async () => {
    const { h } = await boot(modelWithHeadMorphs(54), { capabilities: { morphTextures: true } });
    const state = h.engine.sceneFeatures().morphTextureMode;
    expect(state.status).toBe("active");
    expect(state.detail).toContain("텍스처 모드");
    expect(state.detail).toContain("최대 타깃 54개(한계 128층)");
    expect(state.detail).toMatch(/최대 텍스처 \d+×\d+×54층/u);
  });

  it("타깃 수가 층 한계를 넘으면 Babylon이 attribute 모드로 내려가며 사유와 8개 제한을 한글로 알린다(무음 아님)", async () => {
    const { h } = await boot(modelWithHeadMorphs(54), { capabilities: { morphTextures: true, texture2DArrayMaxLayerCount: 32 } });
    const state = h.engine.sceneFeatures().morphTextureMode;
    expect(state.status).toBe("unavailable");
    expect(state.reasonKo).toContain("head(54개)");
    expect(state.reasonKo).toContain("층 한계(32층)를 넘어");
    expect(state.reasonKo).toContain("8개까지만");
  });

  it("attribute 모드에서 활성 타깃이 8개를 넘으면 무시되는 개수를 알린다", async () => {
    const { h } = await boot(modelWithHeadMorphs(54), { capabilities: { morphTextures: true, texture2DArrayMaxLayerCount: 32 } });
    const weights: Record<string, number> = {};
    for (let i = 0; i < 11; i += 1) weights[`facs:synthetic${i}`] = 0.5;
    h.engine.applyPlan(applyPlanFixture({ morphWeights: weights }));
    expect(h.engine.sceneFeatures().morphTextureMode.reasonKo).toContain("활성 타깃 11개 중 3개는 무시됩니다");
  });

  it("소스가 없으면 꺼짐과 사유", async () => {
    harness = await createNullEngineHarness({ now: () => 1_000 });
    expect(harness.engine.sceneFeatures().morphTextureMode).toEqual({ status: "off", reasonKo: "소스가 없습니다." });
  });
});

describe("입 안 UV 섬 어둡게(§4.3)", () => {
  it("절차 소스의 head 파츠만 입 안 마스크를 알베도로 쓰고 다른 파츠는 쓰지 않는다", async () => {
    const { h, scene } = await boot(createProceduralFixture());
    const albedoName = (meshName: string): string | undefined => (scene.getMeshByName(meshName)?.material as unknown as { albedoTexture?: { name: string } | null } | undefined)?.albedoTexture?.name;
    expect(albedoName("head")).toBe("default:mouth-mask");
    expect(albedoName("body")).toBeUndefined();
    expect(albedoName("hair")).toBeUndefined();
    const mask = scene.textures.find((texture) => texture.name === "default:mouth-mask");
    expect(mask?.getSize()).toEqual({ width: MOUTH_MASK_SIZE, height: MOUTH_MASK_SIZE });
    h.engine.dispose();
  });

  it("툰 모드(ShaderMaterial·NodeMaterial)도 같은 마스크를 알베도로 곱한다", async () => {
    const { h, scene } = await boot(createProceduralFixture());
    h.engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    const shader = scene.getMeshByName("head")?.material;
    expect(shader?.getActiveTextures().map((texture) => texture.name)).toContain("default:mouth-mask");
    expect(scene.getMeshByName("body")?.material?.getActiveTextures().map((texture) => texture.name)).not.toContain("default:mouth-mask");
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    const node = scene.getMeshByName("head")?.material as unknown as { getBlockByName(name: string): { texture?: { name: string } | null } | null } | undefined;
    expect(node?.getBlockByName("albedoTexture")?.texture?.name).toBe("default:mouth-mask");
    const bodyNode = scene.getMeshByName("body")?.material as unknown as { getBlockByName(name: string): { texture?: { name: string } | null } | null } | undefined;
    expect(bodyNode?.getBlockByName("albedoTexture")?.texture?.name).toBe("default:white");
  });

  it("OpenPBR도 같은 마스크를 기본색 텍스처로 쓴다", async () => {
    const { h, scene } = await boot(createProceduralFixture(), { capabilities: { webGLVersion: 2 } });
    await h.engine.setBetaFeature("openPbr", true);
    const head = scene.getMeshByName("head")?.material as unknown as { baseColorTexture?: { name: string } | null } | undefined;
    expect(head?.baseColorTexture?.name).toBe("default:mouth-mask");
    const body = scene.getMeshByName("body")?.material as unknown as { baseColorTexture?: { name: string } | null } | undefined;
    expect(body?.baseColorTexture ?? null).toBeNull();
  });

  it("GLB 내보내기(readback 없는 레인)는 마스크를 잠시 떼고 내보낸 뒤 되돌린다", async () => {
    const { h, scene } = await boot(createProceduralFixture());
    await h.engine.exportGlb();
    const head = scene.getMeshByName("head")?.material as unknown as { albedoTexture?: { name: string } | null } | undefined;
    expect(head?.albedoTexture?.name).toBe("default:mouth-mask");
  });
});

describe("GLB 내보내기는 보는 셰이딩 모드와 무관하게 PBR 재질로 한다", () => {
  interface GltfMaterials {
    readonly materials?: ReadonlyArray<{ readonly name?: string; readonly pbrMetallicRoughness?: { readonly baseColorFactor?: readonly number[] } }>;
  }

  it("툰 모드에서 내보내도 파츠 재질 이름·색이 그대로 나가고 내보낸 뒤 툰 재질로 되돌아온다", async () => {
    const { h, scene } = await boot(createProceduralFixture());
    h.engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    expect(scene.getMeshByName("body")?.material?.getClassName()).toBe("ShaderMaterial");
    const json = parseGlb(await h.engine.exportGlb()).json as unknown as GltfMaterials;
    const names = (json.materials ?? []).map((material) => material.name);
    expect(names).toEqual(expect.arrayContaining(["mat:head", "mat:body", "mat:hair", "mat:top"]));
    expect(names.some((name) => name?.startsWith("toon:"))).toBe(false);
    for (const material of json.materials ?? []) expect(material.pbrMetallicRoughness?.baseColorFactor, material.name).toBeDefined();
    expect(scene.getMeshByName("body")?.material?.getClassName()).toBe("ShaderMaterial");
  });

  it("NodeMaterial 툰(베타)이 끼워져 있어도 같고 끝나면 NodeMaterial로 되돌아온다", async () => {
    const { h, scene } = await boot(createProceduralFixture());
    h.engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    const json = parseGlb(await h.engine.exportGlb()).json as unknown as GltfMaterials;
    expect((json.materials ?? []).some((material) => material.name?.startsWith("node-toon:"))).toBe(false);
    expect((json.materials ?? []).some((material) => material.name === "mat:body")).toBe(true);
    expect(scene.getMeshByName("body")?.material?.getClassName()).toBe("NodeMaterial");
  });
});

describe("소유권·감김", () => {
  it("IBL 생성기는 임시 프로브 장면이 아니라 엔진의 실제 장면을 받고 환경 텍스처가 그 장면에 남는다", async () => {
    const seen: Scene[] = [];
    const { h, scene } = await boot(createProceduralFixture(), {
      createIbl: (target) => {
        seen.push(target);
        return createFakeIbl(target);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(scene);
    expect(h.nullEngine.scenes).toHaveLength(1);
    expect(scene.environmentTexture?.name).toBe("fake:ibl");
    expect(scene.textures).toContain(scene.environmentTexture);
  });

  it("절차 메시는 glTF와 같은 CCW 감김이라 모든 메시의 재질 감김 방향이 반시계(1)다", async () => {
    const { h } = await boot(createProceduralFixture());
    const rig = h.engine.inspectRig();
    expect(rig?.parts.length).toBeGreaterThan(0);
    for (const part of rig?.parts ?? []) for (const orientation of part.sideOrientations) expect(orientation, part.id).toBe(1);
  });
});
