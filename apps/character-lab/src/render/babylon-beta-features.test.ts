/**
 * 베타 기능(NodeMaterial 툰 · OpenPBR · IBL Shadows · 투영 페인트) 엔진 통합 — NullEngine 하네스.
 * 검증하는 것: 능력 게이트와 한글 사유, 자동 대체 없음, 켜기·끄기·모드 전환·소스 교체·dispose에서 장면 자원(재질·텍스처·관찰자)이 새지 않는 것,
 * 실패·시간 초과 경로(주입한 로더), 직렬화된 reconcile, 포트(투영 페인트) 배선.
 * 검증하지 못하는 것: 셰이더 컴파일·GPU 렌더 결과·IBL 그림자 품질·UV 투영 픽셀 → "브라우저 미검증"(docs/parity/render.md). 가짜 파이프라인·모의 readback은 배선 확인용이다.
 */
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SHADING, isLabFailure } from "../contracts";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { BETA_FEATURE_IDS, EXTENDED_FEATURE_IDS } from "./beta-features";
import { SCENE_FEATURE_IDS } from "./scene-features";
import { DEFAULT_BETA_LOADERS, IBL_VOXEL_MIN_INTERVAL_MS, createFakeIbl, createIblShadows, createNullEngineHarness, installFakeUvReadback } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { ShadingProfile } from "../contracts";
import type { BetaLoaders, IblShadowsDeps, IblShadowsPipelineLike, NullEngineHarness, NullHarnessOptions, SceneAuxiliary } from "./testing/null-engine-harness";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

let harness: NullEngineHarness | null = null;
let restoreReadback: (() => void) | null = null;

afterEach(() => {
  restoreReadback?.();
  restoreReadback = null;
  harness?.dispose();
  harness = null;
});

const PARTS = 4;

function toonProfile(overrides: Partial<ShadingProfile["toon"]> = {}): ShadingProfile {
  return { ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, ...overrides } };
}

async function boot(options: NullHarnessOptions = {}): Promise<{ readonly h: NullEngineHarness; readonly scene: Scene }> {
  harness = await createNullEngineHarness({ now: () => 1_000, ...options });
  await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  const scene = harness.nullEngine.scenes[0];
  if (!scene) throw new Error("장면이 없습니다.");
  return { h: harness, scene };
}

function materialsOfClass(scene: Scene, className: string): readonly Material[] {
  return scene.materials.filter((material) => material.getClassName() === className);
}

function meshMaterialClass(scene: Scene, meshName: string): string | undefined {
  return scene.getMeshByName(meshName)?.material?.getClassName();
}

interface SceneCounts {
  readonly materials: number;
  readonly textures: number;
  readonly meshes: number;
  readonly beforeRender: number;
  readonly cameraChanged: number;
  readonly resize: number;
}

function counts(scene: Scene): SceneCounts {
  return {
    materials: scene.materials.length,
    textures: scene.textures.length,
    meshes: scene.meshes.length,
    beforeRender: scene.onBeforeRenderObservable.observers.length,
    cameraChanged: scene.onActiveCameraChanged.observers.length,
    resize: scene.getEngine().onResizeObservable.observers.length,
  };
}

/** Babylon `Observable.remove`는 해제를 다음 틱으로 미룬다(`setImmediate`) — 관찰자 수를 세기 전에 한 틱 기다린다. */
async function settleObservers(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function countsAfterTick(scene: Scene): Promise<SceneCounts> {
  await settleObservers();
  return counts(scene);
}

function inputValue(material: Material | null | undefined, name: string): unknown {
  const block = (material as unknown as { getBlockByName(blockName: string): { value?: unknown } | null } | null | undefined)?.getBlockByName(name);
  return block?.value;
}

describe("능력 게이트와 기본값(NullEngine)", () => {
  it("베타 4종은 기본 꺼짐이고 NullEngine에서 OpenPBR·IBL 그림자·투영 페인트는 한글 사유와 함께 지원 안 함이다", async () => {
    const { h } = await boot();
    const report = h.engine.betaFeatures();
    expect(Object.keys(report)).toEqual([...BETA_FEATURE_IDS]);
    for (const id of BETA_FEATURE_IDS) {
      expect(report[id].requested, id).toBe(false);
      expect(report[id].status, id).toBe("off");
    }
    expect(report.nodeMaterialToon.supported).toBe(true);
    expect(report.openPbr).toMatchObject({ supported: false });
    expect(report.openPbr.reasonKo).toMatch(/WebGL2/u);
    expect(report.iblShadows).toMatchObject({ supported: false });
    expect(report.iblShadows.reasonKo).toMatch(/IBL Shadows/u);
    expect(report.uvProjectionPaint).toMatchObject({ supported: false });
    expect(report.uvProjectionPaint.reasonKo).toMatch(/readback/u);
  });

  it("sceneFeatures는 기본 9개 항목을 그대로 두고 확장 6개(베타 4 + 관절 오프셋 + GLB sparse)를 더한다", async () => {
    const { h } = await boot();
    const features = h.engine.sceneFeatures();
    const keys = Object.keys(features);
    for (const id of SCENE_FEATURE_IDS) expect(keys).toContain(id);
    for (const id of EXTENDED_FEATURE_IDS) expect(keys).toContain(id);
    expect(keys).toHaveLength(SCENE_FEATURE_IDS.length + EXTENDED_FEATURE_IDS.length);
    expect(features.glbMorphSparse.status).toBe("active");
    // NullEngine은 morph 텍스처 저장 조건(정점 ID·float 텍스처·정점 텍스처 유닛)이 없어 attribute 모드로 동작한다 — 사유와 8개 제한을 밝힌다.
    expect(features.morphTextureMode.status).toBe("unavailable");
    expect(features.morphTextureMode.reasonKo).toContain("엔진이 morph 텍스처 저장을 지원하지 않습니다");
    expect(features.morphTextureMode.reasonKo).toContain("8개까지만");
  });

  it("지원하지 않는 베타를 켜도 켜지지 않고 사유만 남는다 — 재질·장면 자원은 그대로(자동 대체 없음)", async () => {
    const { h, scene } = await boot();
    const before = counts(scene);
    for (const id of ["openPbr", "iblShadows", "uvProjectionPaint"] as const) {
      const state = await h.engine.setBetaFeature(id, true);
      expect(state, id).toMatchObject({ status: "unavailable", requested: true, supported: false });
      expect(state.reasonKo, id).toMatch(/[가-힣]/u);
    }
    expect(counts(scene)).toEqual(before);
    expect(meshMaterialClass(scene, "head")).toBe("PBRMaterial");
    expect(h.engine.projectionPaint()).toBeNull();
    // 끄면 요청만 사라지고 지원 안 함 사유는 남는다
    const off = await h.engine.setBetaFeature("openPbr", false);
    expect(off).toMatchObject({ status: "off", requested: false, supported: false });
  });

  it("알 수 없는 베타 id는 한글 LabFailure, 해제된 엔진은 거부한다", async () => {
    const { h } = await boot();
    const unknown = "nope" as unknown as Parameters<typeof h.engine.setBetaFeature>[0];
    await expect(h.engine.setBetaFeature(unknown, true)).rejects.toSatisfy((error: unknown) => isLabFailure(error) && error.code === "beta-unknown" && /[가-힣]/u.test(error.reasonKo));
    h.engine.dispose();
    await expect(h.engine.setBetaFeature("nodeMaterialToon", true)).rejects.toBeDefined();
  });
});

describe("NodeMaterial 툰(베타)", () => {
  it("PBR 모드에서 켜면 대기(툰 모드에서만 적용), 툰 모드로 가면 파츠마다 NodeMaterial이 끼워진다", async () => {
    const { h, scene } = await boot();
    const waiting = await h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(waiting).toMatchObject({ status: "off", requested: true, supported: true });
    expect(waiting.reasonKo).toContain("툰 모드에서만");
    expect(materialsOfClass(scene, "NodeMaterial")).toHaveLength(0);

    h.engine.setShading(toonProfile());
    const active = await h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(active.status).toBe("active");
    expect(active.detail).toMatch(/NodeMaterial 그래프 \d+블록 · GLSL · 파츠 4개/u);
    expect(materialsOfClass(scene, "NodeMaterial")).toHaveLength(PARTS);
    for (const name of ["head", "body", "hair", "top"]) expect(meshMaterialClass(scene, name), name).toBe("NodeMaterial");
  });

  it("툰 파라미터 변경(램프 단계)이 NodeMaterial 입력에 반영된다", async () => {
    const { h, scene } = await boot();
    h.engine.setShading(toonProfile({ rampSteps: 3 }));
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    const head = scene.getMeshByName("head")?.material;
    expect(inputValue(head, "rampSteps")).toBe(3);
    h.engine.setShading(toonProfile({ rampSteps: 4, rim: false }));
    expect(inputValue(head, "rampSteps")).toBe(4);
    expect(inputValue(head, "rimFlag")).toBe(0);
  });

  it("PBR로 돌아가면 NodeMaterial을 모두 해제하고 기본 PBR로 되돌린다", async () => {
    const { h, scene } = await boot();
    h.engine.setShading(toonProfile());
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    h.engine.setShading({ ...DEFAULT_SHADING, mode: "pbr" });
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(materialsOfClass(scene, "NodeMaterial")).toHaveLength(0);
    expect(meshMaterialClass(scene, "head")).toBe("PBRMaterial");
    expect(h.engine.betaFeatures().nodeMaterialToon.status).toBe("off");
  });

  it("끄면 기본 ShaderMaterial 툰으로 돌아가고 켜기 전과 장면 자원 수가 같다(누수 없음)", async () => {
    const { h, scene } = await boot();
    h.engine.setShading(toonProfile());
    const before = counts(scene);
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(counts(scene).materials).toBe(before.materials + PARTS);
    const off = await h.engine.setBetaFeature("nodeMaterialToon", false);
    expect(off.status).toBe("off");
    expect(counts(scene)).toEqual(before);
    expect(meshMaterialClass(scene, "head")).toBe("ShaderMaterial");
  });

  it("빠른 켜기·끄기 연타 뒤에도 재질이 겹쳐 남지 않는다(reconcile 직렬화)", async () => {
    const { h, scene } = await boot();
    h.engine.setShading(toonProfile());
    const before = counts(scene);
    const pending = [
      h.engine.setBetaFeature("nodeMaterialToon", true),
      h.engine.setBetaFeature("nodeMaterialToon", false),
      h.engine.setBetaFeature("nodeMaterialToon", true),
      h.engine.setBetaFeature("nodeMaterialToon", false),
      h.engine.setBetaFeature("nodeMaterialToon", true),
    ];
    await Promise.all(pending);
    expect(materialsOfClass(scene, "NodeMaterial")).toHaveLength(PARTS);
    await h.engine.setBetaFeature("nodeMaterialToon", false);
    expect(counts(scene)).toEqual(before);
  });

  it("소스를 다시 올려도 NodeMaterial은 새 리그 몫만 남는다", async () => {
    const { h, scene } = await boot();
    h.engine.setShading(toonProfile());
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(materialsOfClass(scene, "NodeMaterial")).toHaveLength(PARTS);
    expect(meshMaterialClass(scene, "head")).toBe("NodeMaterial");
    expect(h.engine.betaFeatures().nodeMaterialToon.status).toBe("active");
  });

  it("그래프 생성 실패(로더 거부)는 사유와 함께 unavailable이고 기본 툰이 유지되며 자동 재시도하지 않는다", async () => {
    let calls = 0;
    const betaLoaders: BetaLoaders = {
      ...DEFAULT_BETA_LOADERS,
      nodeToon: () => {
        calls += 1;
        return Promise.reject(new Error("청크를 받지 못했습니다"));
      },
    };
    const { h, scene } = await boot({ betaLoaders });
    h.engine.setShading(toonProfile());
    const failed = await h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(failed).toMatchObject({ status: "unavailable", requested: true, supported: true });
    expect(failed.reasonKo).toContain("NodeMaterial 툰 그래프를 만들지 못했습니다");
    expect(failed.reasonKo).toContain("청크를 받지 못했습니다");
    expect(meshMaterialClass(scene, "head")).toBe("ShaderMaterial");
    expect(materialsOfClass(scene, "NodeMaterial")).toHaveLength(0);
    // 모드·소스가 바뀌어도 같은 요청으로 다시 시도하지 않는다(사용자가 다시 켤 때만)
    h.engine.setShading(toonProfile({ rampSteps: 4 }));
    await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(calls).toBe(1);
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(calls).toBe(2);
  });

  it("그래프 빌드 오류(ready가 reject)도 한글 사유로 보고하고 만든 재질을 해제한다", async () => {
    const betaLoaders: BetaLoaders = {
      ...DEFAULT_BETA_LOADERS,
      nodeToon: async () => {
        const kit = await DEFAULT_BETA_LOADERS.nodeToon();
        return {
          ...kit,
          createNodeToon: (scene, language, name) => {
            const toon = kit.createNodeToon(scene, language, name);
            return { ...toon, ready: toon.ready.then(() => Promise.reject(new Error("블록 연결 오류"))) };
          },
        };
      },
    };
    const { h, scene } = await boot({ betaLoaders });
    h.engine.setShading(toonProfile());
    const before = counts(scene);
    const failed = await h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(failed.status).toBe("unavailable");
    expect(failed.reasonKo).toContain("블록 연결 오류");
    expect(counts(scene)).toEqual(before);
    expect(meshMaterialClass(scene, "head")).toBe("ShaderMaterial");
  });

  it("엔진을 해제하면 베타 재질도 함께 사라진다", async () => {
    const { h, scene } = await boot();
    h.engine.setShading(toonProfile());
    await h.engine.setBetaFeature("nodeMaterialToon", true);
    h.engine.dispose();
    expect(h.disposeCount()).toBe(1);
    expect(materialsOfClass(scene, "NodeMaterial")).toHaveLength(0);
  });
});

describe("OpenPBR(베타, NullEngine에 WebGL2 능력을 덧씌움)", () => {
  const WEBGL2 = { webGLVersion: 2 } as const;

  it("PBR 모드에서 켜면 파츠마다 OpenPBRMaterial이 끼워지고 PBR 프리셋 파라미터가 매핑된다", async () => {
    const { h, scene } = await boot({ capabilities: WEBGL2 });
    const state = await h.engine.setBetaFeature("openPbr", true);
    expect(state.status).toBe("active");
    expect(state.detail).toContain("파츠 4개");
    expect(state.detail).toContain("페인트 데칼 미지원");
    expect(materialsOfClass(scene, "OpenPBRMaterial")).toHaveLength(PARTS);
    expect(meshMaterialClass(scene, "head")).toBe("OpenPBRMaterial");
    const hair = scene.getMeshByName("hair")?.material as unknown as { specularRoughnessAnisotropy: number; baseMetalness: number; specularRoughness: number };
    expect(hair.specularRoughnessAnisotropy).toBeCloseTo(0.6, 6);
    expect(hair.baseMetalness).toBe(0);
    expect(hair.specularRoughness).toBeCloseTo(0.45, 6);
  });

  it("플랜의 프리셋·색 변경이 OpenPBR 파라미터에 반영된다", async () => {
    const { h, scene } = await boot({ capabilities: WEBGL2 });
    await h.engine.setBetaFeature("openPbr", true);
    h.engine.applyPlan(applyPlanFixture({ parts: [{ partId: 3, visible: true, materialPreset: "metal" }] }));
    const hair = scene.getMeshByName("hair")?.material as unknown as { baseMetalness: number; specularRoughnessAnisotropy: number };
    expect(hair.baseMetalness).toBe(1);
    expect(hair.specularRoughnessAnisotropy).toBe(0);
  });

  it("툰 모드에서는 대기(PBR 모드에서만 적용)하고 재질을 해제하며, PBR로 돌아오면 다시 만든다", async () => {
    const { h, scene } = await boot({ capabilities: WEBGL2 });
    await h.engine.setBetaFeature("openPbr", true);
    h.engine.setShading(toonProfile());
    const waiting = await h.engine.setBetaFeature("openPbr", true);
    expect(waiting).toMatchObject({ status: "off", requested: true, supported: true });
    expect(waiting.reasonKo).toContain("PBR 모드에서만");
    expect(materialsOfClass(scene, "OpenPBRMaterial")).toHaveLength(0);
    h.engine.setShading({ ...DEFAULT_SHADING, mode: "pbr" });
    await h.engine.setBetaFeature("openPbr", true);
    expect(materialsOfClass(scene, "OpenPBRMaterial")).toHaveLength(PARTS);
  });

  it("끄면 기본 PBRMaterial로 돌아오고 재질이 새지 않는다 — Babylon이 장면에 한 번 캐시하는 텍스처 3장(노이즈 PNG·BRDF LUT 2)은 켤 때마다 늘지 않는다", async () => {
    const { h, scene } = await boot({ capabilities: WEBGL2 });
    const before = counts(scene);
    await h.engine.setBetaFeature("openPbr", true);
    await h.engine.setBetaFeature("openPbr", false);
    const firstCycle = counts(scene);
    expect(firstCycle).toEqual({ ...before, textures: before.textures + 3 });
    for (let i = 0; i < 3; i += 1) {
      await h.engine.setBetaFeature("openPbr", true);
      await h.engine.setBetaFeature("openPbr", false);
    }
    expect(await countsAfterTick(scene)).toEqual(firstCycle);
    expect(meshMaterialClass(scene, "head")).toBe("PBRMaterial");
    expect(scene.textures.filter((texture) => texture.name.includes("blue_noise"))).toHaveLength(1);
  });

  it("준비 대기는 진짜 메시가 아니라 숨긴 복제 메시로 검사하고 끝나면 정리한다(진짜 메시는 이전 재질의 효과를 들고 있어 거짓 양성이 난다 — 실브라우저 실측)", async () => {
    const seen: Array<{ readonly name: string; readonly enabled: boolean }> = [];
    const betaLoaders: BetaLoaders = {
      ...DEFAULT_BETA_LOADERS,
      openPbr: async () => {
        const kit = await DEFAULT_BETA_LOADERS.openPbr();
        return {
          ...kit,
          createOpenPbrMaterial: (scene, name, params) => {
            const material = kit.createOpenPbrMaterial(scene, name, params);
            material.isReady = (mesh) => {
              seen.push({ name: mesh?.name ?? "", enabled: mesh?.isEnabled() ?? true });
              return true;
            };
            return material;
          },
        };
      },
    };
    const { h, scene } = await boot({ capabilities: WEBGL2, betaLoaders, materialReadyTimeoutMs: 120 });
    const meshesBefore = scene.meshes.length;
    const state = await h.engine.setBetaFeature("openPbr", true);
    expect(state.status).toBe("active");
    expect(seen.length).toBeGreaterThanOrEqual(PARTS);
    for (const entry of seen) {
      expect(entry.name.startsWith("beta-probe:"), entry.name).toBe(true);
      expect(entry.enabled).toBe(false);
    }
    expect(scene.meshes.some((mesh) => mesh.name.startsWith("beta-probe:"))).toBe(false);
    expect(scene.meshes.length).toBe(meshesBefore);
  });

  it("재질이 시간 안에 준비되지 않으면(외부 노이즈 텍스처 미수신 모사) unavailable + 한글 사유이고 만든 재질은 해제된다 — 무음 폴백 없음", async () => {
    const betaLoaders: BetaLoaders = {
      ...DEFAULT_BETA_LOADERS,
      openPbr: async () => {
        const kit = await DEFAULT_BETA_LOADERS.openPbr();
        return {
          ...kit,
          createOpenPbrMaterial: (scene, name, params) => {
            const material = kit.createOpenPbrMaterial(scene, name, params);
            material.isReady = () => false;
            return material;
          },
        };
      },
    };
    const { h, scene } = await boot({ capabilities: WEBGL2, betaLoaders, materialReadyTimeoutMs: 120 });
    const before = counts(scene);
    const failed = await h.engine.setBetaFeature("openPbr", true);
    expect(failed).toMatchObject({ status: "unavailable", requested: true, supported: true });
    expect(failed.reasonKo).toContain("OpenPBR 재질을 만들지 못했습니다");
    expect(failed.reasonKo).toContain("준비되지 않았습니다");
    expect(failed.reasonKo).toContain("미준비 4개");
    expect(counts(scene)).toEqual({ ...before, textures: before.textures + 3 });
    expect(materialsOfClass(scene, "OpenPBRMaterial")).toHaveLength(0);
    expect(meshMaterialClass(scene, "head")).toBe("PBRMaterial");
  });
});

/** IBL Shadows 가짜 파이프라인: 호출을 기록하고 생성자가 하는 부작용(관찰자·GBR·CDF)을 모사한다 */
interface FakePipelineKit {
  readonly loaders: BetaLoaders;
  readonly calls: { created: number; disposed: number; voxelize: number; bounds: number; castersSet: number; receiversSet: number; lastCasters: number; lastReceivers: number };
  readonly aux: { gbr: boolean; cdf: boolean; gbrDisabled: number; cdfDisabled: number };
  failNext(): void;
}

function fakePipelineKit(): FakePipelineKit {
  const calls = { created: 0, disposed: 0, voxelize: 0, bounds: 0, castersSet: 0, receiversSet: 0, lastCasters: 0, lastReceivers: 0 };
  const aux = { gbr: false, cdf: false, gbrDisabled: 0, cdfDisabled: 0 };
  let fail = false;
  const auxiliary: SceneAuxiliary = {
    hasGeometryBufferRenderer: () => aux.gbr,
    disableGeometryBufferRenderer: () => {
      aux.gbr = false;
      aux.gbrDisabled += 1;
    },
    hasIblCdfGenerator: () => aux.cdf,
    disableIblCdfGenerator: () => {
      aux.cdf = false;
      aux.cdfDisabled += 1;
    },
  };
  const createPipeline = (scene: Scene): IblShadowsPipelineLike => {
    // Babylon 생성자가 하는 일: 장면 구성요소를 켜고 관찰자를 단다(dispose가 되돌리지 않는 것들)
    aux.gbr = true;
    aux.cdf = true;
    scene.onActiveCameraChanged.add(() => undefined);
    scene.onBeforeRenderObservable.add(() => undefined);
    scene.getEngine().onResizeObservable.add(() => undefined);
    if (fail) {
      fail = false;
      throw new Error("TEXTURE_3D를 지원하지 않습니다");
    }
    calls.created += 1;
    return {
      addShadowCastingMesh: (meshes: Mesh | Mesh[]) => {
        calls.castersSet += 1;
        calls.lastCasters = Array.isArray(meshes) ? meshes.length : 1;
      },
      clearShadowCastingMeshes: () => undefined,
      addShadowReceivingMaterial: (materials?: Material | Material[]) => {
        calls.receiversSet += 1;
        calls.lastReceivers = Array.isArray(materials) ? materials.length : materials ? 1 : 0;
      },
      clearShadowReceivingMaterials: () => undefined,
      updateSceneBounds: () => {
        calls.bounds += 1;
      },
      updateVoxelization: () => {
        calls.voxelize += 1;
      },
      toggleShadow: () => undefined,
      isReady: () => true,
      dispose: () => {
        calls.disposed += 1;
      },
    };
  };
  const loaders: BetaLoaders = {
    ...DEFAULT_BETA_LOADERS,
    iblShadows: () =>
      Promise.resolve({
        IBL_VOXEL_MIN_INTERVAL_MS,
        createIblShadows: (deps: IblShadowsDeps) => createIblShadows({ ...deps, createPipeline, auxiliary }),
      }),
  };
  return { loaders, calls, aux, failNext: () => void (fail = true) };
}

describe("IBL Shadows(베타, 가짜 파이프라인 — 실제 복셀 그림자는 브라우저 미검증)", () => {
  const IBL_CAPS = { supportIBLShadows: true, textureFloatRender: true } as const;

  async function bootIbl(kit: FakePipelineKit): Promise<{ readonly h: NullEngineHarness; readonly scene: Scene; setNow(ms: number): void }> {
    let clock = 1_000;
    const { h, scene } = await boot({ capabilities: IBL_CAPS, betaLoaders: kit.loaders, createIbl: createFakeIbl, now: () => clock });
    return { h, scene, setNow: (ms) => void (clock = ms) };
  }

  it("지원 + IBL 있음 + PBR 모드면 켜지고 가시 파츠의 메시·재질을 파이프라인에 넘긴다", async () => {
    const kit = fakePipelineKit();
    const { h } = await bootIbl(kit);
    const state = await h.engine.setBetaFeature("iblShadows", true);
    expect(state.status).toBe("active");
    expect(state.detail).toContain("복셀 IBL 그림자");
    expect(kit.calls.created).toBe(1);
    expect(kit.calls.lastCasters).toBe(PARTS);
    expect(kit.calls.lastReceivers).toBe(PARTS);
  });

  it("끄면 파이프라인·장면 구성요소(GBR·CDF)·관찰자를 모두 되돌려 켜기 전 상태가 된다(누수 없음)", async () => {
    const kit = fakePipelineKit();
    const { h, scene } = await bootIbl(kit);
    const before = counts(scene);
    await h.engine.setBetaFeature("iblShadows", true);
    expect(counts(scene).beforeRender).toBe(before.beforeRender + 1);
    await h.engine.setBetaFeature("iblShadows", false);
    expect(kit.calls.disposed).toBe(1);
    expect(kit.aux).toMatchObject({ gbr: false, cdf: false, gbrDisabled: 1, cdfDisabled: 1 });
    expect(await countsAfterTick(scene)).toEqual(before);
  });

  it("켜기·끄기를 반복해도 매번 같이 정리된다", async () => {
    const kit = fakePipelineKit();
    const { h, scene } = await bootIbl(kit);
    const before = counts(scene);
    for (let i = 0; i < 3; i += 1) {
      await h.engine.setBetaFeature("iblShadows", true);
      await h.engine.setBetaFeature("iblShadows", false);
    }
    expect(kit.calls.created).toBe(3);
    expect(kit.calls.disposed).toBe(3);
    expect(await countsAfterTick(scene)).toEqual(before);
  });

  it("툰 모드에서는 대기(툰 재질은 IBL 그림자를 받지 못한다)하고 파이프라인을 해제하며 PBR로 돌아오면 다시 만든다", async () => {
    const kit = fakePipelineKit();
    const { h, scene } = await bootIbl(kit);
    const before = counts(scene);
    await h.engine.setBetaFeature("iblShadows", true);
    h.engine.setShading(toonProfile());
    const waiting = await h.engine.setBetaFeature("iblShadows", true);
    expect(waiting).toMatchObject({ status: "off", requested: true, supported: true });
    expect(waiting.reasonKo).toContain("툰 재질은 IBL 그림자를 받지 못합니다");
    expect(kit.calls.disposed).toBe(1);
    h.engine.setShading({ ...DEFAULT_SHADING, mode: "pbr" });
    await h.engine.setBetaFeature("iblShadows", true);
    expect(kit.calls.created).toBe(2);
    await h.engine.setBetaFeature("iblShadows", false);
    expect((await countsAfterTick(scene)).beforeRender).toBe(before.beforeRender);
  });

  it("IBL을 끄면 환경 텍스처가 없어 대기한다", async () => {
    const kit = fakePipelineKit();
    const { h } = await bootIbl(kit);
    await h.engine.setBetaFeature("iblShadows", true);
    h.engine.setShading({ ...DEFAULT_SHADING, ibl: { enabled: false, intensity: 1 } });
    const waiting = await h.engine.setBetaFeature("iblShadows", true);
    expect(waiting.status).toBe("off");
    expect(waiting.reasonKo).toContain("IBL이 꺼져 있거나");
    expect(kit.calls.disposed).toBe(1);
  });

  it("재복셀화는 요청 간격(250 ms)으로 제한된다: 첫 프레임에 한 번, 포즈 변경 후에는 간격이 지난 뒤에만", async () => {
    const kit = fakePipelineKit();
    const { h, setNow } = await bootIbl(kit);
    await h.engine.setBetaFeature("iblShadows", true);
    h.engine.renderFrame();
    expect(kit.calls.voxelize).toBe(1);
    h.engine.renderFrame();
    expect(kit.calls.voxelize).toBe(1); // 더럽지 않으면 다시 하지 않는다
    h.engine.applyPlan(applyPlanFixture({ morphWeights: { "param:eyeSize:+": 0.5 } }));
    h.engine.renderFrame();
    expect(kit.calls.voxelize).toBe(1); // 같은 시각이라 간격 미달
    setNow(1_000 + IBL_VOXEL_MIN_INTERVAL_MS);
    h.engine.renderFrame();
    expect(kit.calls.voxelize).toBe(2);
    expect(kit.calls.bounds).toBe(2);
  });

  it("파이프라인 생성 실패는 한글 사유로 보고하고 켜진 장면 구성요소와 관찰자를 되돌리며 자동 재시도하지 않는다", async () => {
    const kit = fakePipelineKit();
    kit.failNext();
    const { h, scene } = await bootIbl(kit);
    const before = counts(scene);
    const failed = await h.engine.setBetaFeature("iblShadows", true);
    expect(failed).toMatchObject({ status: "unavailable", requested: true, supported: true });
    expect(failed.reasonKo).toContain("IBL Shadows 파이프라인을 만들지 못했습니다");
    expect(failed.reasonKo).toContain("TEXTURE_3D");
    expect(kit.aux).toMatchObject({ gbr: false, cdf: false });
    expect(await countsAfterTick(scene)).toEqual(before);
    h.engine.setShading({ ...DEFAULT_SHADING, mode: "pbr" });
    await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(kit.calls.created).toBe(0);
    const retry = await h.engine.setBetaFeature("iblShadows", true);
    expect(retry.status).toBe("active");
    expect(kit.calls.created).toBe(1);
  });

  it("엔진을 해제하면 파이프라인도 해제된다", async () => {
    const kit = fakePipelineKit();
    const { h } = await bootIbl(kit);
    await h.engine.setBetaFeature("iblShadows", true);
    h.engine.dispose();
    expect(kit.calls.disposed).toBe(1);
    expect(kit.aux.gbr).toBe(false);
  });

  it("능력이 모자란 엔진(float 렌더 타깃 없음)은 사유를 밝히고 켜지지 않는다", async () => {
    const kit = fakePipelineKit();
    const { h } = await boot({ capabilities: { supportIBLShadows: true, textureFloatRender: false }, betaLoaders: kit.loaders, createIbl: createFakeIbl });
    const state = await h.engine.setBetaFeature("iblShadows", true);
    expect(state).toMatchObject({ status: "unavailable", supported: false });
    expect(state.reasonKo).toContain("textureFloatRender");
    expect(kit.calls.created).toBe(0);
  });
});

describe("투영 페인트(베타, 모의 readback — 실제 UV 투영 결과는 브라우저 미검증)", () => {
  /** 해당 부위 메시를 맞히는 NDC 점을 격자에서 찾는다 */
  function findHit(port: NonNullable<ReturnType<NullEngineHarness["engine"]["projectionPaint"]>>): { readonly x: number; readonly y: number } | null {
    for (let y = -0.9; y <= 0.9; y += 0.05) {
      for (let x = -0.9; x <= 0.9; x += 0.05) {
        const outcome = port.stamp(x, y);
        if (outcome.hit) {
          port.cancel();
          return { x, y };
        }
      }
    }
    return null;
  }

  const brush = (size = 4) => ({ size, rgba: new Uint8Array(size * size * 4).fill(255), key: `brush-${size}` });

  it("GPU readback이 있는 레인이면 켜지고 포트가 열린다(NullEngine 레인은 지원 안 함)", async () => {
    const { h } = await boot({ lane: "webgl2" });
    expect(h.engine.betaFeatures().uvProjectionPaint.supported).toBe(true);
    expect(h.engine.projectionPaint()).toBeNull();
    const state = await h.engine.setBetaFeature("uvProjectionPaint", true);
    expect(state.status).toBe("active");
    expect(h.engine.projectionPaint()).not.toBeNull();
    await h.engine.setBetaFeature("uvProjectionPaint", false);
    expect(h.engine.projectionPaint()).toBeNull();
  });

  it("스탬프는 부위 표면에서만 맞고 부위가 다르면 빗나간다", async () => {
    const { h } = await boot({ lane: "webgl2" });
    await h.engine.setBetaFeature("uvProjectionPaint", true);
    const port = h.engine.projectionPaint();
    if (!port) throw new Error("포트가 없습니다.");
    expect(port.begin("tongue", 64, 64)).toBe(false); // 이 소스에는 없는 부위
    expect(port.begin("skin", 64, 64)).toBe(true);
    port.setBrush(brush(), 6);
    const hit = findHit(port);
    expect(hit).not.toBeNull();
    const outcome = port.stamp(hit?.x ?? 0, hit?.y ?? 0);
    expect(outcome.hit).toBe(true);
    expect(outcome.worldSizeM).toBeGreaterThan(0);
    // 투영 한 변의 화면(NDC) 크기: 드라이버가 포인터 이동을 브러시 간격으로 보간하는 데 쓴다
    expect(outcome.screenSizeNdc[0]).toBeGreaterThan(0);
    expect(outcome.screenSizeNdc[1]).toBeGreaterThan(0);
    expect(outcome.screenSizeNdc[0]).toBeLessThan(2);
    expect(port.stamp(-0.99, 0.99)).toEqual({ hit: false, worldSizeM: 0, screenSizeNdc: [0, 0] }); // 하늘
    port.begin("hair", 64, 64);
    expect(port.stamp(hit?.x ?? 0, hit?.y ?? 0).hit).toBe(false); // 몸 자리지만 활성 부위가 헤어
  });

  it("flush는 모의 readback 바이트를 PaintLayer 규약(premultiplied RGBA, 레이어 크기)의 overlay로 돌려주고 칠한 것이 없으면 null", async () => {
    const { h } = await boot({ lane: "webgl2" });
    restoreReadback = installFakeUvReadback((meshName, width, height) => {
      const bytes = new Uint8Array(width * height * 4);
      if (meshName === "body") for (let i = 0; i < bytes.length; i += 4) bytes.set([100, 50, 25, 128], i);
      return bytes;
    });
    await h.engine.setBetaFeature("uvProjectionPaint", true);
    const port = h.engine.projectionPaint();
    if (!port) throw new Error("포트가 없습니다.");
    port.begin("skin", 32, 16);
    port.setBrush(brush(), 6);
    await expect(port.flush()).resolves.toBeNull();
    const hit = findHit(port);
    port.stamp(hit?.x ?? 0, hit?.y ?? 0);
    const overlay = await port.flush();
    expect(overlay).not.toBeNull();
    expect(overlay).toMatchObject({ part: "skin", width: 32, height: 16 });
    expect(overlay?.rgba).toHaveLength(32 * 16 * 4);
    expect([...(overlay?.rgba.subarray(0, 4) ?? [])]).toEqual([100, 50, 25, 128]);
    // flush는 RTT를 비우므로 두 번째 flush는 null
    await expect(port.flush()).resolves.toBeNull();
  });

  it("readback을 못 하는 엔진이면 flush는 한글 오류를 던지고 상태를 비운다(무음으로 빈 결과를 돌려주지 않는다)", async () => {
    const { h } = await boot({ lane: "webgl2" });
    await h.engine.setBetaFeature("uvProjectionPaint", true);
    const port = h.engine.projectionPaint();
    if (!port) throw new Error("포트가 없습니다.");
    port.begin("skin", 32, 32);
    port.setBrush(brush(), 6);
    const hit = findHit(port);
    port.stamp(hit?.x ?? 0, hit?.y ?? 0);
    await expect(port.flush()).rejects.toThrow("readback을 지원하지 않아");
    await expect(port.flush()).resolves.toBeNull();
  });

  it("readback 크기가 레이어와 다르면 한글 오류", async () => {
    const { h } = await boot({ lane: "webgl2" });
    restoreReadback = installFakeUvReadback(() => new Uint8Array(12));
    await h.engine.setBetaFeature("uvProjectionPaint", true);
    const port = h.engine.projectionPaint();
    if (!port) throw new Error("포트가 없습니다.");
    port.begin("skin", 32, 32);
    port.setBrush(brush(), 6);
    const hit = findHit(port);
    port.stamp(hit?.x ?? 0, hit?.y ?? 0);
    await expect(port.flush()).rejects.toThrow("readback 형식이 RGBA8 32×32이 아닙니다");
  });

  it("끄기·엔진 해제에서 UV 렌더러·브러시 텍스처가 모두 해제된다(누수 없음)", async () => {
    const { h, scene } = await boot({ lane: "webgl2" });
    const before = counts(scene);
    await h.engine.setBetaFeature("uvProjectionPaint", true);
    const port = h.engine.projectionPaint();
    if (!port) throw new Error("포트가 없습니다.");
    port.begin("skin", 32, 32);
    port.setBrush(brush(), 6);
    expect(counts(scene).textures).toBeGreaterThan(before.textures);
    await h.engine.setBetaFeature("uvProjectionPaint", false);
    const after = counts(scene);
    expect(after.textures).toBe(before.textures);
    expect(after.meshes).toBe(before.meshes);
  });
});
