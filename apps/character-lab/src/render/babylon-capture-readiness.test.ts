/**
 * 캡처 재질 준비 대기(실브라우저 결함의 회귀 방지): Babylon은 `isReady()`가 false인 재질의 메시를 그리지 않아 준비 전에 RTT를 렌더하면 완전 투명 결과가 나온다
 * (IBL 텍스처가 죽어 PBR이 영원히 미준비였던 실측 사례). 캡처는 **실제** `material.isReady(mesh)`를 폴링해 모든 재질(PBR·툰·OpenPBR·NodeMaterial)이 준비된 뒤에만 그리고,
 * 시간 안에 안 되면 `capture-shader-timeout` LabFailure로 사유를 알린다(무음 폴백·투명 결과 없음). 모의 readback 레인이라 픽셀 내용이 아니라 대기 배선을 검증한다.
 * lit 패스는 SSS 없는 변종으로 그리므로 그 변종의 준비를 본다(`withScatteringOff`).
 */
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SHADING, RENDER_PASS_IDS, isLabFailure } from "../contracts";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { bindFixtureRig, createNullEngineHarness, createOpenPbrMaterial, installFakeReadback, withScatteringOff } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { CaptureRequest, ShadingProfile } from "../contracts";
import type { FixtureRig, NullEngineHarness, NullHarnessOptions } from "./testing/null-engine-harness";
import type { Material } from "@babylonjs/core/Materials/material.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function request(passes: CaptureRequest["passes"] = ["lit"]): CaptureRequest {
  return { width: 16, height: 16, passes, transparentBackground: true, settleSteps: 0 };
}

async function boot(options: NullHarnessOptions = {}): Promise<NullEngineHarness> {
  cleanups.push(installFakeReadback((_pass, width, height) => new Uint8Array(width * height * 4).fill(200)));
  const harness = await createNullEngineHarness({ lane: "webgl2", awaitShaderCompile: true, captureCompileTimeoutMs: 150, now: () => 9_000, ...options });
  cleanups.push(() => harness.dispose());
  await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  return harness;
}

function materialOf(harness: NullEngineHarness, meshName: string): Material {
  const material = harness.nullEngine.scenes[0]?.getMeshByName(meshName)?.material;
  if (!material) throw new Error(`${meshName} 재질이 없습니다.`);
  return material;
}

/**
 * 장면 메시의 재질 준비 여부를 지정한다. NullEngine은 셰이더를 컴파일하지 못해 커스텀 ShaderMaterial·NodeMaterial·OpenPBR이 영원히 미준비라
 * (PBRMaterial만 준비로 나온다) 실제 컴파일 대신 `isReady`를 대체해 **대기 배선**을 검증한다. 실제 컴파일 대기는 실브라우저에서 확인했다(docs/parity/render.md).
 */
function setReady(harness: NullEngineHarness, ready: (meshName: string) => boolean): void {
  const scene = harness.nullEngine.scenes[0];
  for (const mesh of scene?.meshes ?? []) {
    const material = mesh.material;
    if (material) material.isReady = () => ready(mesh.name);
  }
}

function toon(): ShadingProfile {
  return { ...DEFAULT_SHADING, mode: "toon" };
}

describe("캡처가 재질 준비를 기다린다", () => {
  it("모든 재질이 준비로 보고되면 바로 캡처한다", async () => {
    const harness = await boot();
    setReady(harness, () => true);
    const result = await harness.engine.renderPasses(request(["lit"]));
    expect(result.passes.lit?.rgba).toHaveLength(16 * 16 * 4);
  });

  it("패스 전용 ShaderMaterial(flat·normal·depth·id)이 준비되지 않으면(NullEngine은 컴파일 못 함) 그 패스도 기다리다 실패한다", async () => {
    const harness = await boot();
    const failure = await harness.engine.renderPasses(request([...RENDER_PASS_IDS])).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: "capture-shader-timeout" });
  });

  it("준비되지 않은 재질이 있으면 시간 안에 `capture-shader-timeout`(한글 사유)으로 실패하고 투명 결과를 돌려주지 않는다", async () => {
    const harness = await boot();
    const head = materialOf(harness, "head");
    head.isReady = () => false;
    const failure = await harness.engine.renderPasses(request()).then(
      () => null,
      (error: unknown) => error,
    );
    expect(isLabFailure(failure)).toBe(true);
    if (!isLabFailure(failure)) return;
    expect(failure.code).toBe("capture-shader-timeout");
    expect(failure.reasonKo).toContain("150ms 안에 끝나지 않았습니다");
    expect(failure.reasonKo).toContain("미준비 1개");
  });

  it("늦게 준비되는 재질은 폴링으로 기다린 뒤 캡처한다(준비되기 전에 그리지 않는다)", async () => {
    const harness = await boot({ captureCompileTimeoutMs: 5_000 });
    let calls = 0;
    setReady(harness, () => true);
    materialOf(harness, "head").isReady = () => {
      calls += 1;
      return calls >= 4;
    };
    const result = await harness.engine.renderPasses(request());
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(result.passes.lit).toBeDefined();
  });

  it("툰 모드: 패스 재질(ShaderMaterial)과 툰 재질의 준비를 본다", async () => {
    const harness = await boot();
    harness.engine.setShading(toon());
    expect(materialOf(harness, "head").getClassName()).toBe("ShaderMaterial");
    setReady(harness, (name) => name !== "head");
    const failure = await harness.engine.renderPasses(request()).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: "capture-shader-timeout" });
    expect((failure as { reasonKo: string }).reasonKo).toContain("미준비 1개");
    setReady(harness, () => true);
    await expect(harness.engine.renderPasses(request())).resolves.toBeDefined();
  });

  it("NodeMaterial 툰(베타)이 끼워져 있으면 그 재질의 미준비도 실패로 알린다", async () => {
    const harness = await boot({ materialReadyTimeoutMs: 0 });
    harness.engine.setShading(toon());
    expect((await harness.engine.setBetaFeature("nodeMaterialToon", true)).status).toBe("active");
    expect(materialOf(harness, "head").getClassName()).toBe("NodeMaterial");
    setReady(harness, (name) => name !== "head");
    await expect(harness.engine.renderPasses(request())).rejects.toMatchObject({ code: "capture-shader-timeout" });
    setReady(harness, () => true);
    await expect(harness.engine.renderPasses(request())).resolves.toBeDefined();
  });

  it("OpenPBR(베타)이 끼워져 있으면 그 재질의 미준비(외부 노이즈 텍스처 미수신)도 실패로 알린다", async () => {
    const harness = await boot({ capabilities: { webGLVersion: 2 }, materialReadyTimeoutMs: 0 });
    expect((await harness.engine.setBetaFeature("openPbr", true)).status).toBe("active");
    expect(materialOf(harness, "head").getClassName()).toBe("OpenPBRMaterial");
    setReady(harness, (name) => name !== "head");
    await expect(harness.engine.renderPasses(request())).rejects.toMatchObject({ code: "capture-shader-timeout" });
    setReady(harness, () => true);
    await expect(harness.engine.renderPasses(request())).resolves.toBeDefined();
  });

  it("lit 패스는 SSS를 끈 변종의 준비를 확인하고 끝나면 SSS를 되돌린다(뷰포트는 SSS 그대로)", async () => {
    const harness = await boot();
    const head = materialOf(harness, "head") as unknown as { subSurface: { isScatteringEnabled: boolean }; isReady: () => boolean };
    head.subSurface.isScatteringEnabled = true;
    const seen: boolean[] = [];
    head.isReady = () => {
      seen.push(head.subSurface.isScatteringEnabled);
      return true;
    };
    await harness.engine.renderPasses(request(["lit"]));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((enabled) => !enabled)).toBe(true);
    expect(head.subSurface.isScatteringEnabled).toBe(true);
  });

  it("기본 NullEngine 하네스는 컴파일하지 않으므로 기다리지 않는다(합성 래스터)", async () => {
    const harness = await createNullEngineHarness({ now: () => 9_000 });
    cleanups.push(() => harness.dispose());
    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    const head = materialOf(harness, "head");
    head.isReady = () => false;
    harness.engine.applyPlan(applyPlanFixture({}));
    const result = await harness.engine.renderPasses(request());
    expect(result.provenance.synthetic).toBe(true);
  });
});

describe("withScatteringOff", () => {
  let fixture: FixtureRig | null = null;
  afterEach(() => {
    fixture?.dispose();
    fixture = null;
  });

  it("PBR 피부의 산란을 동기 구간에서만 끄고 되돌린다(예외가 나도 되돌린다)", () => {
    fixture = bindFixtureRig(createProceduralFixture());
    const { rig } = fixture;
    const skin = rig.parts.find((part) => part.role === "head");
    if (!skin) throw new Error("head 파츠가 없습니다.");
    skin.pbr.subSurface.isScatteringEnabled = true;
    withScatteringOff(rig, true, () => {
      expect(skin.pbr.subSurface.isScatteringEnabled).toBe(false);
    });
    expect(skin.pbr.subSurface.isScatteringEnabled).toBe(true);
    expect(() =>
      withScatteringOff(rig, true, () => {
        throw new Error("렌더 실패");
      }),
    ).toThrow("렌더 실패");
    expect(skin.pbr.subSurface.isScatteringEnabled).toBe(true);
    // 끄지 않는 패스(flat·normal 등)는 건드리지 않는다
    withScatteringOff(rig, false, () => {
      expect(skin.pbr.subSurface.isScatteringEnabled).toBe(true);
    });
  });

  it("OpenPBR의 subsurfaceWeight도 같은 구간에서만 0으로 둔다", () => {
    fixture = bindFixtureRig(createProceduralFixture(), { webGLVersion: 2 });
    const { rig, scene } = fixture;
    const part = rig.parts.find((entry) => entry.role === "head");
    if (!part) throw new Error("head 파츠가 없습니다.");
    const material = createOpenPbrMaterial(scene, "openpbr:test", {
      baseColor: [1, 1, 1],
      baseMetalness: 0,
      specularRoughness: 0.5,
      coatWeight: 0,
      coatRoughness: 0,
      coatIor: 1.5,
      fuzzWeight: 0,
      fuzzRoughness: 0.5,
      fuzzColor: [1, 1, 1],
      specularRoughnessAnisotropy: 0,
      geometryTangent: [1, 0],
      subsurfaceWeight: 1,
      subsurfaceColor: [1, 0.8, 0.7],
      subsurfaceRadius: 0.004,
      subsurfaceRadiusScale: [1, 0.3, 0.3],
      emissionColor: [1, 1, 1],
      emissionLuminance: 0,
      unlit: false,
      backFaceCulling: true,
      twoSidedLighting: false,
    });
    for (const mesh of part.meshes) mesh.material = material;
    withScatteringOff(rig, true, () => {
      expect(material.subsurfaceWeight).toBe(0);
    });
    expect(material.subsurfaceWeight).toBe(1);
  });
});
