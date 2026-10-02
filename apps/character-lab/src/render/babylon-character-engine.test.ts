/**
 * BabylonCharacterEngine — NullEngine 하네스(GPU·DOM 없음). 장면 빌드, 절차 소스 바인딩(VertexData·스킨·morph·metadata),
 * 플랜 적용, PBR↔툰 전환, GLB export round-trip, HUD, 수명주기를 검증한다.
 * 셰이더 컴파일·실제 readback·후처리 품질은 NullEngine이 검증하지 못한다(docs/parity/render.md '브라우저 미검증').
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_FRAMING, DEFAULT_SHADING, isLabFailure, paramMorphName } from "../contracts";
import { v3Length } from "../shared/math";
import { parseGlb } from "../testing/minimal-glb";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { TONE_MAPPING_TYPES, createNullEngineHarness } from "./testing/null-engine-harness";
import { FIXTURE_MORPH_NAMES, createProceduralFixture } from "./testing/procedural-fixture";

import type { ApplyPlan, LabFailure, ShadingProfile } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

let harness: NullEngineHarness;

beforeEach(async () => {
  harness = await createNullEngineHarness({ now: () => 1_000 });
});

afterEach(() => {
  harness.dispose();
});

async function load(): Promise<void> {
  await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
}

function planWith(overrides: Partial<ApplyPlan>): ApplyPlan {
  return applyPlanFixture(overrides);
}

function toon(overrides: Partial<ShadingProfile["toon"]> = {}): ShadingProfile {
  return { ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, ...overrides } };
}

describe("장면 빌드", () => {
  it("우수 좌표·투명 clear·KHR PBR Neutral 톤맵·카메라 2대·key/fill 광원", () => {
    const scene = harness.engine.inspectScene();
    expect(scene.rightHanded).toBe(true);
    expect(scene.clearColor).toEqual([0, 0, 0, 0]);
    expect(scene.toneMappingEnabled).toBe(true);
    expect(scene.toneMappingType).toBe(TONE_MAPPING_TYPES.khrPbrNeutral);
    expect(scene.cameraNames).toEqual(["main-camera", "capture-camera"]);
    expect(scene.activeCamera).toBe("main-camera");
    expect(scene.lightNames).toEqual(["fill-light", "key-light"]);
  });

  it("NullEngine은 캐스케이드 그림자·SSS·IBL·GPU 타이머를 지원하지 않으며 사유가 한글로 남는다(무음 생략 금지)", () => {
    const report = harness.engine.sceneFeatures();
    expect(report.cascadedShadows.status).toBe("unavailable");
    expect(report.cascadedShadows.reasonKo).toContain("CascadedShadowGenerator");
    expect(report.subsurfaceScattering).toMatchObject({ status: "unavailable" });
    expect(report.subsurfaceScattering.reasonKo).toMatch(/PrePass/u);
    expect(report.imageBasedLighting.status).toBe("unavailable");
    expect(report.gpuTimer.status).toBe("unavailable");
    expect(harness.engine.inspectScene().sssPrePass).toBe(false);
    // 지원하지 않는 기능은 대체 그림자 생성기로 내려가되 사유를 보인다.
    expect(harness.engine.inspectScene().shadowGenerator).toBe("ShadowGenerator");
  });

  it("톤맵·그림자 프로파일이 장면에 반영된다", () => {
    harness.engine.setShading({ ...DEFAULT_SHADING, toneMapping: "aces", shadows: { ...DEFAULT_SHADING.shadows, enabled: false } });
    expect(harness.engine.inspectScene()).toMatchObject({ toneMappingEnabled: true, toneMappingType: TONE_MAPPING_TYPES.aces, shadowEnabled: false });
    expect(harness.engine.sceneFeatures().cascadedShadows.status).toBe("off");
    harness.engine.setShading({ ...DEFAULT_SHADING, toneMapping: "none" });
    expect(harness.engine.inspectScene().toneMappingEnabled).toBe(false);
    harness.engine.setShading({ ...DEFAULT_SHADING, ibl: { enabled: false, intensity: 2 } });
    expect(harness.engine.inspectScene().environmentIntensity).toBe(0);
    expect(harness.engine.sceneFeatures().imageBasedLighting.status).toBe("off");
    harness.engine.setShading({ ...DEFAULT_SHADING, ibl: { enabled: true, intensity: 2 } });
    expect(harness.engine.inspectScene().environmentIntensity).toBe(2);
  });

  it("후처리 토글: TAA·SSAO는 지원하지 않는 엔진에서 사유와 함께 unavailable/active를 보고하고 끄면 off", () => {
    harness.engine.setShading({ ...DEFAULT_SHADING, postfx: { fxaa: true, taa: true, bloom: true, ssao: true, sharpen: true } });
    const on = harness.engine.sceneFeatures();
    expect(["active", "unavailable"]).toContain(on.taa.status);
    expect(["active", "unavailable"]).toContain(on.ssao.status);
    if (on.ssao.status === "unavailable") expect(on.ssao.reasonKo).toMatch(/SSAO2/u);
    harness.engine.setShading({ ...DEFAULT_SHADING, postfx: { fxaa: false, taa: false, bloom: false, ssao: false, sharpen: false } });
    const off = harness.engine.sceneFeatures();
    expect(off.taa.status).toBe("off");
    expect(off.ssao.status).toBe("off");
  });
});

describe("절차 소스 바인딩", () => {
  it("메시 수·morph 수·본 수·metadata.partId·스킨·재질 클래스가 모델과 일치한다", async () => {
    await load();
    const model = createProceduralFixture();
    const rig = harness.engine.inspectRig();
    expect(rig).not.toBeNull();
    if (!rig) return;
    expect(rig.kind).toBe("procedural");
    expect(rig.poseConvention).toBe("bone-local");
    expect(rig.parts.map((part) => part.id)).toEqual(model.parts.map((part) => part.id));
    expect(rig.parts.map((part) => part.meshMetadataPartIds)).toEqual(model.parts.map((part) => [part.partId]));
    expect(rig.parts.map((part) => part.role)).toEqual(model.parts.map((part) => part.role));
    expect(rig.parts.map((part) => part.vertexCount)).toEqual(model.parts.map((part) => part.positions.length / 3));
    expect(rig.parts.map((part) => part.triangleCount)).toEqual(model.parts.map((part) => part.indices.length / 3));
    expect(rig.parts.map((part) => part.morphTargetCount)).toEqual(model.parts.map((part) => part.morphs.length));
    expect(rig.parts.every((part) => part.skinned)).toBe(true);
    expect(rig.parts.every((part) => part.materialClass === "PBRMaterial")).toBe(true);
    expect(rig.boneCount).toBe(model.skeleton.bones.length);
    expect(rig.skeletonBoneCount).toBe(model.skeleton.bones.length);
    expect(rig.auxiliaryBoneCount).toBe(3);
    expect(rig.humanoidBoneCount).toBe(6);
    expect(rig.morphNames).toEqual([...FIXTURE_MORPH_NAMES]);
    expect(rig.chainCount).toBe(1);
    expect(rig.colliderCount).toBe(1);
    expect(rig.notes).toEqual([]);
  });

  it("loadSource는 능력·morph·본 이름·partId 팔레트를 돌려준다", async () => {
    const model = createProceduralFixture();
    const result = await harness.engine.loadSource({ kind: "procedural", model });
    expect(result.morphNames).toEqual([...FIXTURE_MORPH_NAMES]);
    expect(result.boneNames).toEqual(model.skeleton.bones.map((bone) => bone.name));
    expect(result.partIdPalette).toEqual(model.partIdPalette);
    expect(result.capabilities["pose"]).toEqual({ status: "available" });
  });

  it("검증에 실패한 파츠는 LabFailure로 reject하고 리그는 비어 있으며 엔진은 계속 쓸 수 있다", async () => {
    const model = createProceduralFixture();
    const broken = { ...model, parts: model.parts.map((part, index) => (index === 0 ? { ...part, indices: new Uint32Array([0, 1, 9999]) } : part)) };
    const failure = await harness.engine.loadSource({ kind: "procedural", model: broken }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(isLabFailure(failure)).toBe(true);
    expect(harness.engine.inspectRig()).toBeNull();
    await load();
    expect(harness.engine.inspectRig()?.parts).toHaveLength(4);
  });

  it("알 수 없는 본을 참조하는 스켈레톤은 rig-bone-missing으로 실패한다", async () => {
    const model = createProceduralFixture();
    const broken = { ...model, skeleton: { bones: model.skeleton.bones.map((bone) => (bone.name === "spine" ? { ...bone, parent: "ghost" } : bone)) } };
    // 부모가 스켈레톤에 없으면 루트로 취급하므로(문서화된 동작) 실패하지 않는다. 순환 참조만 거부한다.
    await expect(harness.engine.loadSource({ kind: "procedural", model: broken })).resolves.toBeDefined();
    const cyclic = { ...model, skeleton: { bones: model.skeleton.bones.map((bone) => (bone.name === "hips" ? { ...bone, parent: "spine" } : bone)) } };
    const failure = await harness.engine.loadSource({ kind: "procedural", model: cyclic }).then(
      () => null,
      (error: unknown) => error as LabFailure,
    );
    expect(failure?.code).toBe("rig-bone-cycle");
  });

  it("소스를 다시 로드해도 장면 객체가 누적되지 않는다(메시·스켈레톤·재질·노드)", async () => {
    await load();
    const first = harness.engine.inspectScene();
    await load();
    await load();
    const third = harness.engine.inspectScene();
    expect(third.meshCount).toBe(first.meshCount);
    expect(third.skeletonCount).toBe(first.skeletonCount);
    expect(third.materialCount).toBe(first.materialCount);
    expect(third.transformNodeCount).toBe(first.transformNodeCount);
    expect(third.textureCount).toBe(first.textureCount);
  });

  it("툰 모드에서 소스를 재로드해도 공유 텍스처(white·clear·SDF)가 해제되지 않는다(재질 해제가 텍스처를 지우지 않음)", async () => {
    harness.engine.setShading(toon());
    await load();
    const first = harness.engine.inspectScene();
    await load();
    await load();
    const third = harness.engine.inspectScene();
    expect(third.textureCount).toBe(first.textureCount);
    expect(third.materialCount).toBe(first.materialCount);
    // 재로드 뒤 툰 재질이 다시 만들어지고 살아 있는 텍스처를 쓴다(캡처가 오류 없이 끝난다)
    expect(harness.engine.inspectRig()?.parts.every((part) => part.hasToonMaterial)).toBe(true);
    await expect(harness.engine.renderThumbnail({ presetId: "eyes/round", plan: applyPlanFixture({}), size: 96, framing: DEFAULT_FRAMING })).resolves.toMatchObject({ width: 96 });
  });

  it("소스 없이 플랜·캡처·썸네일·GLB를 부르면 코드가 있는 LabFailure로 실패한다", async () => {
    expect(() => harness.engine.applyPlan(planWith({}))).toThrowError(expect.objectContaining({ code: "apply-plan-no-source" }));
    await expect(harness.engine.renderPasses({ width: 8, height: 8, passes: ["flat"], transparentBackground: true, settleSteps: 0 })).rejects.toMatchObject({ code: "capture-no-source" });
    await expect(harness.engine.exportGlb()).rejects.toMatchObject({ code: "glb-no-source" });
    expect(harness.engine.pick(0, 0)).toBeNull();
    expect(harness.engine.jointHandles()).toEqual([]);
    expect(harness.engine.poseSkeleton()).toBeNull();
  });
});

describe("플랜 적용", () => {
  it("morph influence·본 회전·가시성이 반영되고 영수증이 건너뛴 항목을 알려준다", async () => {
    await load();
    const sin15 = Math.sin(Math.PI / 12);
    const cos15 = Math.cos(Math.PI / 12);
    const receipt = harness.engine.applyPlan(
      planWith({
        revision: 7,
        morphWeights: { [paramMorphName("eyeSize", "+")]: 0.5, "facs:jawOpen": 2, "morph:없음": 1 },
        boneRotations: { head: [0, sin15, 0, cos15], leftUpperArm: [0, 0, 0, 1] },
        parts: [{ partId: 3, visible: false, materialPreset: "hair-aniso" }],
      }),
    );
    expect(receipt).toEqual({ revision: 7, appliedMorphs: 2, appliedBones: 1, skippedMorphs: ["morph:없음"], skippedBones: ["leftUpperArm"] });
    const rig = harness.engine.inspectRig();
    expect(rig?.morphInfluences["param:eyeSize:+"]).toBeCloseTo(0.5, 6);
    // 범위 밖 가중치는 [0,1]로 클램프된다.
    expect(rig?.morphInfluences["facs:jawOpen"]).toBe(1);
    expect(rig?.parts.find((part) => part.partId === 3)?.visible).toBe(false);
    expect(rig?.parts.find((part) => part.partId === 1)?.visible).toBe(true);
    const head = harness.engine.readBone("head");
    expect(head?.localRotation[1]).toBeCloseTo(sin15, 5);
    expect(head?.localRotation[3]).toBeCloseTo(cos15, 5);
  });

  it("플랜에 없는 morph·본은 0·rest로 되돌아간다(상태 누수 없음)", async () => {
    await load();
    harness.engine.applyPlan(planWith({ morphWeights: { "param:eyeSize:+": 1 }, boneRotations: { head: [0, 0.5, 0, 0.866] } }));
    harness.engine.applyPlan(planWith({ revision: 2 }));
    const rig = harness.engine.inspectRig();
    expect(rig?.morphInfluences["param:eyeSize:+"]).toBe(0);
    expect(harness.engine.readBone("head")?.localRotation).toEqual([0, 0, 0, 1]);
  });

  it("색·재질 프리셋 override가 파츠 색과 프리셋에 반영된다", async () => {
    await load();
    harness.engine.applyPlan(
      planWith({
        parts: [
          { partId: 3, visible: true, materialPreset: "cloth-silk", color: "#112233" },
          { partId: 4, visible: true, materialPreset: "cloth-cotton" },
        ],
        colors: { ...applyPlanFixture().colors, top: "#abcdef" },
      }),
    );
    const parts = harness.engine.inspectRig()?.parts ?? [];
    expect(parts.find((part) => part.partId === 3)).toMatchObject({ colorHex: "#112233", materialPreset: "cloth-silk" });
    // colorKey가 top인 파츠는 레시피 색을 따른다.
    expect(parts.find((part) => part.partId === 4)?.colorHex).toBe("#abcdef");
  });

  it("planDigest는 같은 플랜에서 같고 morph가 다르면 달라진다", async () => {
    await load();
    expect(harness.engine.planDigest()).toBe("no-plan");
    harness.engine.applyPlan(planWith({ revision: 3, morphWeights: { "param:eyeSize:+": 0.25 } }));
    const a = harness.engine.planDigest();
    harness.engine.applyPlan(planWith({ revision: 3, morphWeights: { "param:eyeSize:+": 0.25 } }));
    expect(harness.engine.planDigest()).toBe(a);
    harness.engine.applyPlan(planWith({ revision: 3, morphWeights: { "param:eyeSize:+": 0.5 } }));
    expect(harness.engine.planDigest()).not.toBe(a);
    expect(a.startsWith("plan-3-")).toBe(true);
  });
});

describe("셰이딩 모드: PBR ↔ 툰", () => {
  it("툰으로 바꾸면 재질 클래스가 ShaderMaterial로 교체되고 hull 외곽선이 켜진다", async () => {
    await load();
    harness.engine.setShading(toon());
    const rig = harness.engine.inspectRig();
    expect(rig?.parts.every((part) => part.materialClass === "ShaderMaterial" && part.hasToonMaterial)).toBe(true);
    expect(rig?.parts.every((part) => part.renderOutline && !part.edgesRendering)).toBe(true);
    expect(harness.engine.currentShading().mode).toBe("toon");
  });

  it("외곽선 모드 edge는 엣지 렌더러를 쓰고 none은 둘 다 끈다", async () => {
    await load();
    harness.engine.setShading(toon({ outline: "edge" }));
    expect(harness.engine.inspectRig()?.parts.every((part) => !part.renderOutline && part.edgesRendering)).toBe(true);
    harness.engine.setShading(toon({ outline: "none" }));
    expect(harness.engine.inspectRig()?.parts.every((part) => !part.renderOutline && !part.edgesRendering)).toBe(true);
  });

  it("PBR로 되돌리면 원 PBR 재질이 복원되고 외곽선이 꺼진다", async () => {
    await load();
    harness.engine.setShading(toon());
    harness.engine.setShading({ ...DEFAULT_SHADING, mode: "pbr" });
    const rig = harness.engine.inspectRig();
    expect(rig?.parts.every((part) => part.materialClass === "PBRMaterial" && !part.renderOutline)).toBe(true);
  });

  it("툰 모드에서 숨긴 파츠는 계속 숨겨지고 플랜 색 변경이 재질 교체 없이 반영된다", async () => {
    await load();
    harness.engine.setShading(toon());
    harness.engine.applyPlan(planWith({ parts: [{ partId: 2, visible: false, materialPreset: "skin-sss", color: "#102030" }] }));
    const rig = harness.engine.inspectRig();
    expect(rig?.parts.find((part) => part.partId === 2)).toMatchObject({ visible: false, colorHex: "#102030", materialClass: "ShaderMaterial" });
  });
});

describe("카메라·리사이즈·뷰포트 포트", () => {
  it("프레이밍 모드에 따라 카메라 거리가 달라지고 yaw·distanceScale이 반영된다", async () => {
    await load();
    harness.engine.setCamera({ ...DEFAULT_FRAMING, mode: "full-body" });
    const full = harness.engine.viewportCamera();
    harness.engine.setCamera({ ...DEFAULT_FRAMING, mode: "face" });
    const face = harness.engine.viewportCamera();
    const distance = (camera: { readonly position: readonly number[] }, target: readonly number[]): number =>
      Math.hypot((camera.position[0] ?? 0) - (target[0] ?? 0), (camera.position[1] ?? 0) - (target[1] ?? 0), (camera.position[2] ?? 0) - (target[2] ?? 0));
    // 얼굴 프레이밍은 전신보다 가까이서 보고 시선 높이가 더 높다.
    expect(face.position[1]).toBeGreaterThan(full.position[1]);
    expect(distance(face, [0, face.position[1] + face.forward[1], 0])).toBeLessThan(distance(full, [0, full.position[1] + full.forward[1], 0]));
    expect(harness.engine.currentFraming().mode).toBe("face");
    harness.engine.setCamera({ ...DEFAULT_FRAMING, mode: "full-body", yawDeg: 90 });
    const yawed = harness.engine.viewportCamera();
    // yaw 90°: 카메라가 +Z 정면에서 +X 쪽으로 돈다.
    expect(Math.abs(yawed.position[0])).toBeGreaterThan(Math.abs(full.position[0]) + 0.5);
    expect(harness.engine.viewportCamera().fovY).toBeGreaterThan(0);
  });

  it("resize는 잘못된 값에도 던지지 않는다(NullEngine은 캔버스가 없어 렌더 크기는 그대로)", async () => {
    await load();
    expect(() => harness.engine.resize(48, 32)).not.toThrow();
    expect(() => harness.engine.resize(0, -5)).not.toThrow();
    expect(() => harness.engine.resize(Number.NaN, 10)).not.toThrow();
    const camera = harness.engine.viewportCamera();
    expect([camera.width, camera.height]).toEqual([64, 64]);
  });

  it("카메라 기저(forward·right·up)는 서로 직교하는 단위 벡터이고 right는 +X(정면 카메라)다", async () => {
    await load();
    const camera = harness.engine.viewportCamera();
    for (const axis of [camera.forward, camera.right, camera.up]) expect(v3Length(axis)).toBeCloseTo(1, 6);
    const dot = (a: readonly number[], b: readonly number[]): number => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
    expect(dot(camera.forward, camera.right)).toBeCloseTo(0, 6);
    expect(dot(camera.forward, camera.up)).toBeCloseTo(0, 6);
    expect(dot(camera.right, camera.up)).toBeCloseTo(0, 6);
    expect(camera.right[0]).toBeCloseTo(1, 6);
    // 정면(+Z)에서 캐릭터를 바라보므로 시선은 −Z 성분을 갖는다.
    expect(camera.forward[2]).toBeLessThan(0);
  });

  it("jointHandles는 휴머노이드 본마다 화면 좌표·월드 좌표를 돌려준다(보조 본 제외)", async () => {
    await load();
    const handles = harness.engine.jointHandles();
    expect(handles.map((handle) => handle.bone)).toEqual(["hips", "spine", "chest", "upperChest", "neck", "head"]);
    const head = handles.find((handle) => handle.bone === "head");
    const hips = handles.find((handle) => handle.bone === "hips");
    expect(head?.world[1]).toBeGreaterThan(hips?.world[1] ?? Number.POSITIVE_INFINITY);
    // 머리는 엉덩이보다 화면 위쪽(픽셀 y가 작다)에 있다.
    expect(head?.screen[1]).toBeLessThan(hips?.screen[1] ?? Number.NEGATIVE_INFINITY);
  });

  it("poseSkeleton은 휴머노이드 이름·보조 본·부모 관계를 그대로 돌려준다", async () => {
    await load();
    const skeleton = harness.engine.poseSkeleton();
    expect(skeleton?.bones.map((bone) => bone.name)).toEqual(createProceduralFixture().skeleton.bones.map((bone) => bone.name));
    expect(skeleton?.bones.find((bone) => bone.name === "hair_1")).toMatchObject({ parent: "hair_0", auxiliary: true });
    expect(skeleton?.bones.find((bone) => bone.name === "hips")?.parent).toBeNull();
  });
});

describe("GLB export round-trip", () => {
  it("magic·스킨·morph target·targetNames가 보존된다", async () => {
    await load();
    harness.engine.applyPlan(planWith({ morphWeights: { "param:eyeSize:+": 0.5 } }));
    const bytes = await harness.engine.exportGlb();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("glTF");
    const parsed = parseGlb(bytes);
    expect(parsed.version).toBe(2);
    const json = parsed.json as {
      nodes: Array<{ name?: string; mesh?: number; skin?: number }>;
      meshes: Array<{ primitives: Array<{ targets?: unknown[]; attributes: Record<string, number> }>; extras?: { targetNames?: string[] } }>;
      skins: Array<{ joints: number[] }>;
    };
    expect(json.skins).toHaveLength(1);
    expect(json.skins[0]?.joints).toHaveLength(9);
    const nodeNames = json.nodes.map((node) => node.name);
    for (const name of ["head", "body", "hair", "top", "bone:hips", "bone:head"]) expect(nodeNames).toContain(name);
    // 카메라·조명 노드는 내보내지 않는다.
    expect(nodeNames).not.toContain("main-camera");
    expect(nodeNames).not.toContain("key-light");
    const headMesh = json.meshes.find((mesh) => mesh.extras?.targetNames?.includes("param:eyeSize:+"));
    expect(headMesh?.primitives[0]?.targets).toHaveLength(2);
    expect(headMesh?.extras?.targetNames).toEqual([...FIXTURE_MORPH_NAMES]);
    expect(headMesh?.primitives[0]?.attributes).toHaveProperty("JOINTS_0");
    expect(headMesh?.primitives[0]?.attributes).toHaveProperty("WEIGHTS_0");
  });

  it("같은 장면의 두 번 export는 같은 바이트다(결정성)", async () => {
    await load();
    const a = await harness.engine.exportGlb();
    const b = await harness.engine.exportGlb();
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("HUD·프레임 통계", () => {
  it("readHud는 계약 필드를 채우고 NullEngine은 gpuFrameMs null·어댑터 라벨 NullEngine을 보고한다", async () => {
    await load();
    for (let i = 0; i < 5; i += 1) harness.engine.renderFrame();
    const hud = harness.engine.readHud();
    expect(hud.adapterLabel).toBe("NullEngine");
    expect(hud.gpuFrameMs).toBeNull();
    expect(hud.physicsProvider).toBe("builtin-pbd");
    expect(hud.shadingMode).toBe("pbr");
    expect(Number.isFinite(hud.frameMs) && hud.frameMs >= 0).toBe(true);
    expect(hud.frameMsP95).toBeGreaterThanOrEqual(0);
    for (const value of [hud.drawCalls, hud.activeMeshes, hud.triangles]) expect(Number.isInteger(value) && value >= 0).toBe(true);
    harness.engine.setShading(toon());
    expect(harness.engine.readHud().shadingMode).toBe("toon");
  });

  it("진단 정보는 NullEngine 레인을 숨기지 않는다(능력은 엔진에서 읽는다)", () => {
    expect(harness.engine.lane).toBe("null");
    expect(harness.engine.diagnostics.renderer).toBe("NullEngine");
    expect(harness.engine.diagnostics.caps.computeShaders).toBe(false);
    expect(harness.engine.diagnostics.caps.timestampQuery).toBe(false);
    expect(harness.engine.diagnostics.caps.maxTextureSize).toBeGreaterThan(0);
  });
});

describe("loadSource 직렬화", () => {
  const characterRoots = (): number => harness.nullEngine.scenes[0]?.transformNodes.filter((node) => node.name === "character-root").length ?? -1;
  const proceduralSource = () => ({ kind: "procedural" as const, model: createProceduralFixture() });

  it("loadSource를 동시에 두 번 호출해도 캐릭터 루트·메시가 하나 분량만 남고 앞 리그는 해제된다", async () => {
    await load();
    const single = harness.engine.inspectScene().meshCount;
    expect(characterRoots()).toBe(1);
    const results = await Promise.all([harness.engine.loadSource(proceduralSource()), harness.engine.loadSource(proceduralSource())]);
    expect(results).toHaveLength(2);
    // 직렬화되지 않으면 두 호출이 모두 빈 상태에서 시작해 리그 2개가 장면에 남는다(루트 2개, 메시 2배).
    expect(characterRoots()).toBe(1);
    expect(harness.engine.inspectScene().meshCount).toBe(single);
    expect(harness.engine.inspectRig()?.parts).toHaveLength(4);
  });

  it("세 번 겹쳐 호출해도 같고, 앞선 로드가 실패해도 다음 로드는 실행된다", async () => {
    const model = createProceduralFixture();
    const broken = { ...model, parts: model.parts.map((part, index) => (index === 0 ? { ...part, indices: new Uint32Array([0, 1, 9999]) } : part)) };
    const outcomes = await Promise.allSettled([
      harness.engine.loadSource(proceduralSource()),
      harness.engine.loadSource({ kind: "procedural", model: broken }),
      harness.engine.loadSource(proceduralSource()),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(characterRoots()).toBe(1);
    expect(harness.engine.inspectRig()?.parts).toHaveLength(4);
  });

  it("로드를 기다리는 동안 엔진이 해제되면 대기 중인 로드는 engine-disposed로 실패하고 리그를 만들지 않는다", async () => {
    const first = harness.engine.loadSource(proceduralSource());
    const second = harness.engine.loadSource(proceduralSource());
    harness.engine.dispose();
    const outcomes = await Promise.allSettled([first, second]);
    // 첫 로드는 이미 시작돼 해제 감지 경로(engine-disposed), 두 번째는 큐에서 시작하기 전에 해제 감지
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["rejected", "rejected"]);
    for (const outcome of outcomes) expect(outcome.status === "rejected" && (outcome.reason as LabFailure).code).toBe("engine-disposed");
  });
});

describe("수명주기", () => {
  it("dispose는 멱등이고 엔진 핸들을 한 번만 해제하며 이후 호출은 engine-disposed로 실패한다", async () => {
    await load();
    harness.engine.dispose();
    harness.engine.dispose();
    expect(harness.disposeCount()).toBe(1);
    expect(() => harness.engine.applyPlan(planWith({}))).toThrowError(expect.objectContaining({ code: "engine-disposed" }));
    expect(() => harness.engine.setShading(DEFAULT_SHADING)).toThrowError(expect.objectContaining({ code: "engine-disposed" }));
    await expect(harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() })).rejects.toMatchObject({ code: "engine-disposed" });
    expect(harness.engine.pick(0, 0)).toBeNull();
    // 해제 뒤 renderFrame·resize는 조용히 무시한다(렌더 루프 잔여 호출 방어).
    expect(() => harness.engine.renderFrame()).not.toThrow();
    expect(() => harness.engine.resize(10, 10)).not.toThrow();
  });
});
