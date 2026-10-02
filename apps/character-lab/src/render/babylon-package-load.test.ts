/**
 * 제작 패키지 GLB 로드 — **실제** `public/assets/characters/*\/*.glb`를 Node에서 읽어 NullEngine에 로드하고
 * GLB JSON 청크(정답)와 대조한다: 메시 이름·프리미티브 분리·morph 수·본 수·헤어 LOD 가시성·좌표계·모델 공간 포즈 규약.
 * `_Outline` 셸·멀티 프리미티브·규약 밖 이름은 실제 패키지에 없거나 일부만 있어 합성 GLB(`testing/glb-fixture.ts`)로 확인한다.
 * 텍스처 디코드·셰이더 컴파일·렌더 결과는 NullEngine이 검증하지 못한다(브라우저 미검증).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SHADING, isLabFailure } from "../contracts";
import { sha256Hex } from "../shared/hash";
import { qMultiply, qRotateVec3, v3Add, v3Sub } from "../shared/math";
import { parseGlb } from "../testing/minimal-glb";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { buildMultiMeshGlb } from "./testing/glb-fixture";
import { chooseHairLod, createNullEngineHarness, splitPackageMeshName } from "./testing/null-engine-harness";
import { createPackagePlanFixture, summarizeGlb } from "./testing/package-plan-fixture";

import type { AuthoredPackagePlan, LabFailure, Quat, Vec3 } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

const CHARACTERS_ROOT = path.resolve(process.cwd().endsWith("character-lab") ? process.cwd() : path.join(process.cwd(), "apps", "character-lab"), "public", "assets", "characters");
const PACKAGE_IDS = ["avatar-orion-authored", "reference-character"] as const;

function readPackageBytes(id: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(CHARACTERS_ROOT, id, `${id}.glb`)));
}

function planFor(id: string, bytes: Uint8Array, preferredLod = 0): AuthoredPackagePlan {
  return createPackagePlanFixture({ characterId: id, glbUrl: `/assets/characters/${id}/${id}.glb`, bytes, preferredLod });
}

interface GltfMeshJson {
  readonly primitives: ReadonlyArray<{ readonly targets?: readonly unknown[] }>;
}
interface GltfJson {
  readonly nodes: ReadonlyArray<{ readonly name?: string; readonly mesh?: number }>;
  readonly meshes: readonly GltfMeshJson[];
  readonly skins?: ReadonlyArray<{ readonly joints: readonly number[] }>;
}

/** GLB JSON에서 Babylon이 만들 메시 이름과 프리미티브별 morph target 수 */
function expectedMeshes(bytes: Uint8Array): Map<string, number> {
  const json = parseGlb(bytes).json as unknown as GltfJson;
  const out = new Map<string, number>();
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const mesh = json.meshes[node.mesh];
    const primitives = mesh?.primitives ?? [];
    primitives.forEach((primitive, index) => {
      out.set(primitives.length > 1 ? `${node.name}_primitive${index}` : (node.name ?? ""), primitive.targets?.length ?? 0);
    });
  }
  return out;
}

const harnesses: NullEngineHarness[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  while (harnesses.length > 0) harnesses.pop()?.dispose();
});

async function loadPackage(id: string, options: { preferredLod?: number; verifySha?: boolean; plan?: AuthoredPackagePlan } = {}) {
  const bytes = readPackageBytes(id);
  const plan = options.plan ?? planFor(id, bytes, options.preferredLod);
  const requested: string[] = [];
  const harness = await createNullEngineHarness({
    fetchBytes: async (url) => {
      requested.push(url);
      return bytes;
    },
    verifyPackageSha: options.verifySha ?? false,
    now: () => 7_000,
  });
  harnesses.push(harness);
  const capabilities = await harness.engine.loadSource({ kind: "package", plan });
  return { harness, engine: harness.engine, plan, bytes, requested, capabilities };
}

describe.each(PACKAGE_IDS)("실제 패키지 %s", (id) => {
  it("메시 이름·프리미티브 분리·메시별 morph target 수가 GLB JSON과 일치한다", async () => {
    const { engine, bytes, requested } = await loadPackage(id);
    const expected = expectedMeshes(bytes);
    const rig = engine.inspectRig();
    expect(rig?.kind).toBe("package");
    expect(rig?.poseConvention).toBe("model-space");
    const actual = new Map<string, number>();
    rig?.parts.forEach((part) => {
      part.meshNames.forEach((name, index) => actual.set(name, part.morphTargetCountsByMesh[index] ?? -1));
    });
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [name, count] of expected) expect(actual.get(name), name).toBe(count);
    expect(requested).toEqual([`/assets/characters/${id}/${id}.glb`]);
  });

  it("본 수·휴머노이드 매핑·morph 이름 매핑이 GLB와 플랜에 맞는다", async () => {
    const { engine, bytes, plan } = await loadPackage(id);
    const json = parseGlb(bytes).json as unknown as GltfJson;
    const joints = json.skins?.[0]?.joints.length ?? 0;
    const rig = engine.inspectRig();
    expect(rig?.skeletonBoneCount).toBe(joints);
    expect(rig?.boneCount).toBe(joints);
    const mappedPresent = Object.keys(plan.boneMap).filter((name) => engine.readBone(name) !== null).length;
    expect(rig?.humanoidBoneCount).toBe(mappedPresent);
    expect(rig?.auxiliaryBoneCount).toBe(joints - mappedPresent);
    // shape key 이름은 플랜(shapeKeyMap)으로 재지정된다: 매핑된 이름만 morphNames에 param:/facs: 형태로 나타난다
    const mappedNames = new Set(Object.values(plan.shapeKeyMap));
    for (const name of mappedNames) expect(rig?.morphNames).toContain(name);
    for (const raw of Object.keys(plan.shapeKeyMap)) expect(rig?.morphNames).not.toContain(raw);
  });

  it("헤어 LOD는 preferredLod 하나만 보이고 나머지는 forceHidden + 한글 사유다", async () => {
    for (const preferred of [0, 1, 2, 9]) {
      const { engine } = await loadPackage(id, { preferredLod: preferred });
      const hair = engine.inspectRig()?.parts.filter((part) => part.role === "hair") ?? [];
      expect(hair).toHaveLength(3);
      const chosen = Math.min(preferred, 2);
      hair.forEach((part, index) => {
        // 파츠 이름은 정렬되어 LOD0·LOD1·LOD2 순이다
        const lod = Number(/LOD(\d+)$/u.exec(part.id)?.[1]);
        expect(lod).toBe(index);
        expect(part.visible).toBe(lod === chosen);
        expect(part.forceHidden).toBe(lod !== chosen);
        if (lod !== chosen) expect(part.forceHiddenReasonKo).toContain(`LOD${lod}`);
      });
    }
  });

  it("partId는 정렬된 파츠 이름 순 1..n이고 팔레트·metadata가 일치한다", async () => {
    const { engine, capabilities } = await loadPackage(id);
    const rig = engine.inspectRig();
    const ids = rig?.parts.map((part) => part.partId) ?? [];
    expect(ids).toEqual(ids.map((_value, index) => index + 1));
    const names = rig?.parts.map((part) => part.id) ?? [];
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const part of rig?.parts ?? []) {
      expect(part.meshMetadataPartIds.every((value) => value === part.partId)).toBe(true);
      expect(capabilities.partIdPalette[part.partId]?.role).toBe(part.role);
    }
  });

  it("SHA-256이 같으면 로드하고 다르면 package-sha-mismatch로 거부한다", async () => {
    const bytes = readPackageBytes(id);
    const digest = await sha256Hex(bytes);
    const good = { ...planFor(id, bytes), glbSha256: digest };
    await expect(loadPackage(id, { plan: good, verifySha: true })).resolves.toBeDefined();
    const bad = { ...planFor(id, bytes), glbSha256: "f".repeat(64) };
    await expect(loadPackage(id, { plan: bad, verifySha: true })).rejects.toMatchObject({ code: "package-sha-mismatch" });
  });

  it("GLB export가 로드한 패키지의 메시·스킨·morph를 보존한다", async () => {
    const { engine, bytes } = await loadPackage(id);
    const exported = await engine.exportGlb();
    expect(new TextDecoder().decode(exported.subarray(0, 4))).toBe("glTF");
    const json = parseGlb(exported).json as unknown as GltfJson;
    const source = parseGlb(bytes).json as unknown as GltfJson;
    expect(json.skins?.length ?? 0).toBe(source.skins?.length ?? 0);
    if (source.skins?.[0]) expect(json.skins?.[0]?.joints).toHaveLength(source.skins[0].joints.length);
    const targetsOf = (doc: GltfJson): number => doc.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((inner, primitive) => inner + (primitive.targets?.length ?? 0), 0), 0);
    expect(targetsOf(json)).toBe(targetsOf(source));
  });
});

describe("Orion 제작 패키지(스킨·모델 공간 포즈)", () => {
  const ID = "avatar-orion-authored";

  it("바디는 두 프리미티브로 나뉘고 각자 morph target 40개를 가지며 morph 한 개가 양쪽에 적용된다", async () => {
    const { engine } = await loadPackage(ID);
    const body = engine.inspectRig()?.parts.find((part) => part.role === "skin");
    expect(body?.meshNames).toEqual(["Avatar_Orion_Body_primitive0", "Avatar_Orion_Body_primitive1"]);
    expect(body?.morphTargetCountsByMesh).toEqual([40, 40]);
    expect(body?.morphTargetCount).toBe(80);
    expect(body?.skinned).toBe(true);
    engine.applyPlan(applyPlanFixture({ morphWeights: { "param:jawWidth:+": 0.5 } }));
    const after = engine.inspectRig();
    expect(after?.morphInfluences["param:jawWidth:+"]).toBeCloseTo(0.5, 6);
    // 같은 이름의 타깃이 프리미티브마다 하나씩 → 양쪽 메시에서 1개씩 활성
    expect(after?.parts.find((part) => part.role === "skin")?.activeMorphTargetsByMesh).toEqual([1, 1]);
    // morph 이름이 플랜에 없으면 건너뜀으로 보고된다
    const receipt = engine.applyPlan(applyPlanFixture({ morphWeights: { "param:jawWidth:+": 0.5, "param:earAngle:+": 1 } }));
    expect(receipt.appliedMorphs).toBe(1);
    expect(receipt.skippedMorphs).toEqual(["param:earAngle:+"]);
  });

  it("미터 단위·+Z 정면·캐릭터 왼쪽 +X로 로드된다(우수 좌표, 변환 노드 없음)", async () => {
    const { engine } = await loadPackage(ID);
    const bone = (name: string) => {
      const reading = engine.readBone(name);
      if (!reading) throw new Error(`본 없음: ${name}`);
      return reading.position;
    };
    expect(bone("hips")[1]).toBeGreaterThan(0.8);
    expect(bone("hips")[1]).toBeLessThan(1.2);
    expect(bone("head")[1]).toBeGreaterThan(1.3);
    expect(bone("head")[1]).toBeLessThan(1.9);
    expect(bone("leftUpperArm")[0]).toBeGreaterThan(0.05);
    expect(bone("rightUpperArm")[0]).toBeLessThan(-0.05);
    // 눈은 머리 본보다 앞(+Z)에 있다
    expect(bone("leftEye")[2]).toBeGreaterThan(bone("head")[2] + 0.05);
    expect(bone("leftEye")[0]).toBeGreaterThan(bone("rightEye")[0]);
    expect(engine.inspectScene().rightHanded).toBe(true);
  });

  it("모델 공간 포즈: leftUpperArm을 Z축 −90° 돌리면 팔꿈치·손이 어깨 둘레로 회전한다", async () => {
    const { engine } = await loadPackage(ID);
    const read = (name: string): Vec3 => engine.readBone(name)?.position ?? [Number.NaN, 0, 0];
    const pivot = read("leftUpperArm");
    const elbow = read("leftLowerArm");
    const hand = read("leftHand");
    const quarter = Math.SQRT1_2;
    const pose: Quat = [0, 0, -quarter, quarter];
    const receipt = engine.applyPlan(applyPlanFixture({ boneRotations: { leftUpperArm: pose } }));
    expect(receipt.appliedBones).toBe(1);
    const expectedAround = (point: Vec3): Vec3 => v3Add(pivot, qRotateVec3(pose, v3Sub(point, pivot)));
    for (const [name, rest] of [["leftLowerArm", elbow], ["leftHand", hand]] as const) {
      const expected = expectedAround(rest);
      const actual = read(name);
      expect(actual[0], `${name}.x`).toBeCloseTo(expected[0], 4);
      expect(actual[1], `${name}.y`).toBeCloseTo(expected[1], 4);
      expect(actual[2], `${name}.z`).toBeCloseTo(expected[2], 4);
    }
    // 피벗(어깨 관절)은 움직이지 않고 반대쪽 팔은 그대로다
    expect(read("leftUpperArm")[0]).toBeCloseTo(pivot[0], 5);
    // 포즈를 비우면 rest로 돌아온다
    engine.applyPlan(applyPlanFixture({ revision: 2 }));
    expect(read("leftHand")[0]).toBeCloseTo(hand[0], 4);
    expect(read("leftHand")[1]).toBeCloseTo(hand[1], 4);
  });

  it("부모 포즈가 자식 월드 회전에 누적된다(model-space 규약: world = pose ∘ rest)", async () => {
    const { engine } = await loadPackage(ID);
    const restRotation = engine.readBone("leftLowerArm")?.rotation as Quat;
    const quarter = Math.SQRT1_2;
    const pose: Quat = [0, 0, -quarter, quarter];
    engine.applyPlan(applyPlanFixture({ boneRotations: { leftUpperArm: pose } }));
    const rotated = engine.readBone("leftLowerArm")?.rotation as Quat;
    const expected = qMultiply(pose, restRotation);
    // 쿼터니언 부호 이중성을 허용해 비교한다
    const sign = Math.sign(rotated.reduce((sum, value, i) => sum + value * (expected[i] ?? 0), 0)) || 1;
    for (let i = 0; i < 4; i += 1) expect(rotated[i] ?? 0).toBeCloseTo(sign * (expected[i] ?? 0), 4);
  });

  it("관절 핸들·포즈 프레임 스켈레톤: 휴머노이드 이름, 항등 rest 회전, 보조 본 유지", async () => {
    const { engine } = await loadPackage(ID);
    const handles = engine.jointHandles();
    expect(handles).toHaveLength(54);
    expect(handles.some((handle) => handle.bone === "jaw")).toBe(false);
    const skeleton = engine.poseSkeleton();
    expect(skeleton).not.toBeNull();
    const byName = new Map((skeleton?.bones ?? []).map((bone) => [bone.name, bone]));
    expect(byName.get("leftUpperArm")?.parent).toBe("leftShoulder");
    expect(byName.get("hips")?.parent).toBeNull();
    expect(byName.get("head")?.parent).toBe("neck");
    expect((skeleton?.bones ?? []).every((bone) => bone.restRotation.join(",") === "0,0,0,1")).toBe(true);
    expect((skeleton?.bones ?? []).filter((bone) => bone.auxiliary).length).toBe(engine.inspectRig()?.auxiliaryBoneCount);
    // rest 월드 위치 재구성이 리그의 실제 월드 위치와 일치한다(부모 오프셋의 합)
    const world = (name: string): Vec3 => {
      let cursor = byName.get(name);
      const out: [number, number, number] = [0, 0, 0];
      while (cursor) {
        out[0] += cursor.restTranslation[0];
        out[1] += cursor.restTranslation[1];
        out[2] += cursor.restTranslation[2];
        cursor = cursor.parent ? byName.get(cursor.parent) : undefined;
      }
      return out;
    };
    for (const name of ["head", "leftHand", "rightFoot", "leftEye"]) {
      const expected = engine.readBone(name)?.position ?? [Number.NaN, 0, 0];
      const actual = world(name);
      expect(actual[0], `${name}.x`).toBeCloseTo(expected[0], 4);
      expect(actual[1], `${name}.y`).toBeCloseTo(expected[1], 4);
      expect(actual[2], `${name}.z`).toBeCloseTo(expected[2], 4);
    }
  });

  it("pick이 패키지 포즈를 따른다: 팔을 내리면 옛 손 위치는 비고 새 손 위치가 몸에 맞는다", async () => {
    const { engine } = await loadPackage(ID);
    const ndcOf = (bone: string): [number, number] => {
      const handle = engine.jointHandles().find((candidate) => candidate.bone === bone);
      const camera = engine.viewportCamera();
      if (!handle) throw new Error(`핸들 없음: ${bone}`);
      return [(handle.screen[0] / camera.width) * 2 - 1, 1 - (handle.screen[1] / camera.height) * 2];
    };
    const elbowRest = ndcOf("leftLowerArm");
    expect(engine.pick(...elbowRest)).toMatchObject({ role: "skin" });
    const quarter = Math.SQRT1_2;
    engine.applyPlan(applyPlanFixture({ boneRotations: { leftUpperArm: [0, 0, -quarter, quarter] } }));
    expect(engine.pick(...elbowRest)).toBeNull();
    expect(engine.pick(...ndcOf("leftLowerArm"))).toMatchObject({ role: "skin" });
  });

  it("알베도 텍스처가 있는 파츠는 보존되고(레시피 색 틴트 미적용) 툰 전환 시 같은 텍스처를 쓴다", async () => {
    const { engine } = await loadPackage(ID);
    const body = engine.inspectRig()?.parts.find((part) => part.role === "skin");
    expect(body?.hasAlbedoTexture).toBe(true);
    engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    expect(engine.inspectRig()?.parts.find((part) => part.role === "skin")?.materialClass).toBe("ShaderMaterial");
    const hair = engine.inspectRig()?.parts.find((part) => part.role === "hair" && part.visible);
    expect(hair?.hasToonMaterial).toBe(true);
  });
});

describe("reference-character(스켈레톤 없음)", () => {
  const ID = "reference-character";

  it("스켈레톤이 없다는 사실을 notes로 알리고 포즈 관련 API는 비어 있다", async () => {
    const { engine } = await loadPackage(ID);
    expect(engine.sourceNotes().some((note) => note.includes("스켈레톤"))).toBe(true);
    expect(engine.jointHandles()).toEqual([]);
    expect(engine.poseSkeleton()).toBeNull();
    const receipt = engine.applyPlan(applyPlanFixture({ boneRotations: { leftUpperArm: [0, 0, 0.7071, 0.7071] } }));
    expect(receipt.appliedBones).toBe(0);
    expect(receipt.skippedBones).toEqual(["leftUpperArm"]);
  });

  it("얼굴 shape key 24개가 param morph 이름으로 재지정되어 머리 메시 하나에서 구동된다", async () => {
    const { engine } = await loadPackage(ID);
    const head = engine.inspectRig()?.parts.find((part) => part.role === "head");
    expect(head?.morphTargetCount).toBe(24);
    engine.applyPlan(applyPlanFixture({ morphWeights: { "param:eyeSize:+": 1, "param:noseWidth:-": 0.5 } }));
    const rig = engine.inspectRig();
    expect(rig?.morphInfluences["param:eyeSize:+"]).toBe(1);
    expect(rig?.parts.find((part) => part.role === "head")?.activeMorphTargetsByMesh).toEqual([2]);
  });
});

describe("합성 GLB: 규약 처리(_Outline·멀티 프리미티브·규약 밖 이름)", () => {
  async function loadSynthetic(meshes: Parameters<typeof buildMultiMeshGlb>[0], preferredLod = 0) {
    const bytes = buildMultiMeshGlb(meshes);
    const plan = createPackagePlanFixture({ characterId: "synthetic", glbUrl: "/assets/characters/synthetic/synthetic.glb", bytes, preferredLod });
    const harness = await createNullEngineHarness({ fetchBytes: async () => bytes, verifyPackageSha: false });
    harnesses.push(harness);
    await harness.engine.loadSource({ kind: "package", plan });
    return harness.engine;
  }

  it("`_Outline` 셸은 파츠에 묶이되 기본은 숨기고 툰·hull에서만 보인다", async () => {
    const engine = await loadSynthetic([{ name: "TS_Test_Body" }, { name: "TS_Test_Body_Outline" }]);
    let part = engine.inspectRig()?.parts[0];
    expect(part?.meshNames).toEqual(["TS_Test_Body"]);
    expect(part?.outlineMeshNames).toEqual(["TS_Test_Body_Outline"]);
    expect(part?.outlineMetadataPartIds).toEqual([part?.partId]);
    expect(part?.outlineShellVisible).toBe(false);
    engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    part = engine.inspectRig()?.parts[0];
    expect(part?.outlineShellVisible).toBe(true);
    engine.setShading({ ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, outline: "none" } });
    expect(engine.inspectRig()?.parts[0]?.outlineShellVisible).toBe(false);
  });

  it("멀티 프리미티브 노드는 `_primitiveN` 접미를 떼어 한 파츠로 묶고 각 프리미티브가 morph를 갖는다", async () => {
    const engine = await loadSynthetic([{ name: "TS_Test_Head", primitives: 2, morphTargets: ["faceEyeSizeBig", "unmappedKey"] }]);
    const part = engine.inspectRig()?.parts[0];
    expect(part?.meshNames).toEqual(["TS_Test_Head_primitive0", "TS_Test_Head_primitive1"]);
    expect(part?.morphTargetCountsByMesh).toEqual([2, 2]);
    // 플랜에 매핑된 이름만 재지정되고 매핑이 없는 이름은 원래 이름으로 노출된다(무음 삭제 없음)
    expect(engine.inspectRig()?.morphNames).toContain("param:eyeSize:+");
    expect(engine.inspectRig()?.morphNames).toContain("unmappedKey");
    engine.applyPlan(applyPlanFixture({ morphWeights: { "param:eyeSize:+": 0.7 } }));
    expect(engine.inspectRig()?.parts[0]?.activeMorphTargetsByMesh).toEqual([1, 1]);
  });

  it("플랜 meshRoles에 없는 메시는 숨기고 한글 notes로 알린다", async () => {
    const engine = await loadSynthetic([{ name: "TS_Test_Body" }, { name: "Stray_Object" }]);
    expect(engine.inspectRig()?.parts).toHaveLength(1);
    expect(engine.sourceNotes().some((note) => note.includes("Stray_Object") && note.includes("meshRoles"))).toBe(true);
  });

  it("헤어 LOD 이름 규약: preferredLod 이하 중 가장 상세한 LOD가 보이고 없으면 가장 상세한 것", async () => {
    const meshes = [{ name: "TS_AuthoredHair_short-layered_LOD1" }, { name: "TS_AuthoredHair_short-layered_LOD2" }];
    const engine = await loadSynthetic(meshes, 0);
    // LOD0이 없으므로 가장 상세한 LOD1이 선택된다
    const visible = engine.inspectRig()?.parts.filter((part) => part.visible).map((part) => part.id);
    expect(visible).toEqual(["TS_AuthoredHair_short-layered_LOD1"]);
  });
});

describe("실패 경로(fail-visible)", () => {
  it("GLB가 아닌 바이트는 package-glb-load-failed로 거부한다", async () => {
    const plan = planFor(PACKAGE_IDS[1], readPackageBytes(PACKAGE_IDS[1]));
    const harness = await createNullEngineHarness({ fetchBytes: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), verifyPackageSha: false });
    harnesses.push(harness);
    const failure = await harness.engine.loadSource({ kind: "package", plan }).then(
      () => null,
      (error: unknown) => error as LabFailure,
    );
    expect(failure?.code).toBe("package-glb-load-failed");
    expect(failure?.reasonKo).toContain("제작 패키지 GLB");
    // 실패 뒤에도 리그는 비어 있고 엔진은 쓸 수 있다
    expect(harness.engine.inspectRig()).toBeNull();
  });

  it("바이트 로더가 일반 Error로 reject하면 source-load-failed LabFailure로 감싼다", async () => {
    const plan = planFor(PACKAGE_IDS[1], readPackageBytes(PACKAGE_IDS[1]));
    const harness = await createNullEngineHarness({
      fetchBytes: async () => {
        throw new Error("네트워크 끊김");
      },
      verifyPackageSha: false,
    });
    harnesses.push(harness);
    const failure = await harness.engine.loadSource({ kind: "package", plan }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(isLabFailure(failure)).toBe(true);
    expect((failure as LabFailure).code).toBe("source-load-failed");
    expect((failure as LabFailure).detail).toContain("네트워크 끊김");
  });

  it("기본 fetch가 HTTP 오류를 돌려주면 package-fetch-failed로 거부한다", async () => {
    vi.stubGlobal("fetch", async () => new Response("없음", { status: 404 }));
    const plan = planFor(PACKAGE_IDS[1], readPackageBytes(PACKAGE_IDS[1]));
    const harness = await createNullEngineHarness({ verifyPackageSha: false });
    harnesses.push(harness);
    await expect(harness.engine.loadSource({ kind: "package", plan })).rejects.toMatchObject({ code: "package-fetch-failed" });
  });
});

describe("순수 헬퍼", () => {
  it("splitPackageMeshName: 프리미티브·outline 접미를 떼어 파츠 이름과 플래그를 돌려준다", () => {
    expect(splitPackageMeshName("Avatar_Orion_Body_primitive1")).toEqual({ baseName: "Avatar_Orion_Body", outline: false });
    expect(splitPackageMeshName("TS_Body_Outline")).toEqual({ baseName: "TS_Body", outline: true });
    expect(splitPackageMeshName("TS_Body_Outline_primitive0")).toEqual({ baseName: "TS_Body", outline: true });
    expect(splitPackageMeshName("TS_Body")).toEqual({ baseName: "TS_Body", outline: false });
  });

  it("chooseHairLod: preferred 이하 중 가장 상세(작은 번호), 없으면 가장 상세, LOD가 없으면 null", () => {
    expect(chooseHairLod([0, 1, 2], 0)).toBe(0);
    expect(chooseHairLod([0, 1, 2], 1)).toBe(1);
    expect(chooseHairLod([0, 1, 2], 9)).toBe(2);
    expect(chooseHairLod([1, 2], 0)).toBe(1);
    expect(chooseHairLod([2, 1, 1], 1)).toBe(1);
    expect(chooseHairLod([], 0)).toBeNull();
  });

  it("summarizeGlb 정답 지표: Orion은 메시 노드 10개·본 67개·바디 2 프리미티브", () => {
    const summary = summarizeGlb(readPackageBytes("avatar-orion-authored"));
    expect(summary.meshNodeNames).toHaveLength(10);
    expect(summary.jointCount).toBe(67);
    expect(summary.primitiveCountByNode["Avatar_Orion_Body"]).toBe(2);
    expect(summary.targetNames.length).toBeGreaterThanOrEqual(24);
  });
});
