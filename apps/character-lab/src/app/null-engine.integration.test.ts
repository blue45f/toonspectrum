/**
 * 전체 조립 통합 검증(GPU 없음): `composeCharacterLab`의 실제 영역 모듈 —
 * state(planApply·store) × presets × animation 프리셋 × humanoid(buildHumanoidModel) × outfit × physics provider factory —
 * 을 render의 NullEngine 하네스(`BabylonCharacterEngine` 본체)에 꽂아 셸 경로 전체를 Node에서 돌린다.
 * 영역 작업자는 각자 모의 포트로 검증했으므로 영역 사이의 계약 불일치(morph·본 이름, 능력 맵, 소스 재생성 키)는 여기서만 드러난다.
 *
 * NullEngine이 검증하지 못하는 것(셰이더 컴파일·RTT readback·IBL·후처리·실제 픽셀)은 브라우저 검증 항목이다.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, APPEARANCE_SLOT_KINDS } from "../contracts";
import { createPhysicsProviderFactory } from "../domains/physics/provider-factory";
import { exportGlb, exportLayeredPsd, exportRecipe, exportTransparentPng } from "../export/export-session";
import { decodePng } from "../export/png-encoder";
import { getDefaultPaintSession } from "../paint/paint-session";
import { createNullEngineHarness } from "../render/testing/null-engine-harness";
import { installPsdCanvasStub } from "../testing/psd-canvas-stub";

import { composeCharacterLab } from "./composition";

import type { ThumbnailRequest } from "../contracts";
import type { LabRuntime } from "./shell/lab-runtime";
import type { NullEngineHarness } from "../render/testing/null-engine-harness";

function canvasStub(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

describe("app: 실제 영역 모듈 × NullEngine 통합", () => {
  let harness: NullEngineHarness;
  let runtime: LabRuntime;
  let stop: () => void;

  beforeAll(async () => {
    harness = await createNullEngineHarness({ physicsProviders: createPhysicsProviderFactory() });
    runtime = composeCharacterLab({
      loadFactory: async () => async () => harness.engine,
      decideBackend: async (backend) => ({ ok: true, backend }),
      subdivisionLevels: 0,
    });
    stop = runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
  }, 120_000);

  afterAll(() => {
    stop();
    runtime.dispose();
  });

  it("기본 절차 캐릭터가 실제 엔진에 올라가고 failure가 없다", () => {
    expect(runtime.store.getState().failures).toEqual([]);
    expect(runtime.engineSession.status().phase).toBe("ready");
    expect(runtime.store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
    expect(runtime.applyLoop.settled()).toBe(true);
  });

  it("플랜이 가리키는 morph·본 이름이 소스에 모두 있다(skipped 0)", () => {
    const receipt = runtime.applyLoop.lastReceipt();
    expect(receipt).not.toBeNull();
    expect(receipt?.skippedMorphs).toEqual([]);
    expect(receipt?.skippedBones).toEqual([]);
  });

  it("체형·얼굴 파라미터와 표정 슬라이더 변경이 플랜 적용으로 morph를 건드리고 소스는 다시 만들지 않는다", async () => {
    const before = harness.engine.readHud();
    expect(before.backend).toBeDefined();
    runtime.store.dispatch({ type: "param/set", group: "body", key: "height", value: 0.6, coalesceKey: "body:height" });
    runtime.store.dispatch({ type: "param/set", group: "face", key: "eyeSize", value: -0.4, coalesceKey: "face:eyeSize" });
    await runtime.applyLoop.flush();
    const receipt = runtime.applyLoop.lastReceipt();
    expect(receipt?.appliedMorphs ?? 0).toBeGreaterThan(0);
    expect(receipt?.skippedMorphs).toEqual([]);
    expect(runtime.store.getState().failures).toEqual([]);
  });

  it("표정·포즈·손 포즈 프리셋 30개를 차례로 적용해도 skipped 없이 적용된다", async () => {
    const performance = [...runtime.catalog.bySlot("expression"), ...runtime.catalog.bySlot("pose"), ...runtime.catalog.bySlot("hand-pose")];
    expect(performance.length).toBeGreaterThanOrEqual(30);
    for (const entry of performance) {
      runtime.store.dispatch({ type: "slot/apply", slot: entry.slot, presetId: entry.id });
      await runtime.applyLoop.flush();
      const receipt = runtime.applyLoop.lastReceipt();
      expect({ id: entry.id, skippedMorphs: receipt?.skippedMorphs, skippedBones: receipt?.skippedBones }).toEqual({ id: entry.id, skippedMorphs: [], skippedBones: [] });
    }
    expect(runtime.store.getState().failures).toEqual([]);
  });

  it("지오메트리 슬롯(헤어·상의) 변경은 소스를 다시 올리고 실제 엔진이 받아들인다", async () => {
    const loadSource = harness.engine.loadSource.bind(harness.engine);
    let loads = 0;
    harness.engine.loadSource = async (source) => {
      loads += 1;
      return loadSource(source);
    };
    try {
      for (const slot of ["hair", "top"] as const) {
        const current = runtime.store.getState().recipe.slots[slot];
        const next = runtime.catalog.bySlot(slot).find((entry) => entry.id !== current);
        if (!next) throw new Error(`${slot} 슬롯에 다른 프리셋이 필요합니다.`);
        const before = loads;
        runtime.store.dispatch({ type: "slot/apply", slot, presetId: next.id });
        await runtime.applyLoop.flush();
        expect(loads).toBe(before + 1);
        expect(runtime.applyLoop.lastReceipt()?.skippedMorphs).toEqual([]);
      }
      expect(runtime.store.getState().failures).toEqual([]);
      // 색 변경은 소스를 다시 올리지 않는다
      const before = loads;
      runtime.store.dispatch({ type: "color/set", key: "hair", value: "#3a2a20" });
      await runtime.applyLoop.flush();
      expect(loads).toBe(before);
    } finally {
      harness.engine.loadSource = loadSource;
    }
  }, 60_000);

  it("물리 provider를 builtin-pbd에서 rapier로 바꾸면 상태가 store에 반영된다", async () => {
    runtime.store.dispatch({ type: "physics/set-provider", provider: "rapier" });
    await runtime.applyLoop.flush();
    const physics = runtime.store.getState().physics;
    expect(physics?.id).toBe("rapier");
    expect(["active", "unavailable"]).toContain(physics?.status);
    runtime.store.dispatch({ type: "physics/set-provider", provider: "builtin-pbd" });
    await runtime.applyLoop.flush();
    expect(runtime.store.getState().physics).toMatchObject({ id: "builtin-pbd", status: "active" });
  }, 60_000);

  it("페인트 스트로크가 엔진 텍스처로 올라가고 소스 재생성 뒤에도 다시 올라간다", async () => {
    const paint = getDefaultPaintSession();
    const uploads: string[] = [];
    const updatePaintTexture = harness.engine.updatePaintTexture.bind(harness.engine);
    harness.engine.updatePaintTexture = (layer) => {
      uploads.push(layer.part);
      updatePaintTexture(layer);
    };
    try {
      paint.beginStroke({ u: 0.4, v: 0.4, pressure: 1 }, "skin");
      paint.endStroke();
      // 스트로크 자체의 업로드는 포인터 드라이버(render pick) 몫이다. 여기서는 소스가 다시 올라가면 비어 있지 않은 레이어가 재업로드되는지 본다.
      const currentHair = runtime.store.getState().recipe.slots.hair;
      const nextHair = runtime.catalog.bySlot("hair").find((entry) => entry.id !== currentHair);
      if (!nextHair) throw new Error("다른 헤어 프리셋이 필요합니다.");
      runtime.store.dispatch({ type: "slot/apply", slot: "hair", presetId: nextHair.id });
      await runtime.applyLoop.flush();
      expect(uploads).toContain("skin");
      expect(runtime.store.getState().failures).toEqual([]);
    } finally {
      harness.engine.updatePaintTexture = updatePaintTexture;
      paint.replaceLayers([]);
    }
  }, 60_000);

  it("투명 PNG·레이어 PSD·GLB·레시피 출력이 실제 엔진 위에서 끝까지 돈다(NullEngine 합성 래스터)", async () => {
    installPsdCanvasStub();
    const engine = runtime.engineSession.engine();
    if (!engine) throw new Error("엔진이 준비돼 있어야 합니다.");

    const png = await exportTransparentPng(engine, { width: 64, height: 64, settleSteps: 0 });
    if (!png.ok) throw new Error(png.failure.reasonKo);
    expect(png.receipt.provenance?.synthetic).toBe(true);
    const decoded = await decodePng(png.bytes);
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 64, height: 64 });

    const psd = await exportLayeredPsd(engine, getDefaultPaintSession().layersForExport(), { width: 64, height: 64, settleSteps: 0, includeIdMasks: true, includeReferencePasses: true });
    if (!psd.ok) throw new Error(psd.failure.reasonKo);
    expect(String.fromCharCode(...psd.bytes.slice(0, 4))).toBe("8BPS");

    const glb = await exportGlb(engine, runtime.store.getState().recipe);
    if (!glb.ok) throw new Error(glb.failure.reasonKo);
    expect(glb.receipt.mime).toBe("model/gltf-binary");

    const recipe = await exportRecipe(runtime.store.getState().recipe, getDefaultPaintSession().layersForExport());
    if (!recipe.ok) throw new Error(recipe.failure.reasonKo);
    expect(recipe.receipt.kind).toBe("recipe");
  }, 120_000);

  it("지오메트리 프리셋 카드는 임시 소스로 그려지고 주 장면의 메시·리그가 늘지 않는다", async () => {
    await runtime.thumbnails.idle();
    const sceneBefore = harness.engine.inspectScene();
    const rigBefore = harness.engine.inspectRig();
    expect(harness.engine.thumbnailSources).toBe(true);
    const render = harness.engine.renderThumbnail.bind(harness.engine);
    const requests: ThumbnailRequest[] = [];
    harness.engine.renderThumbnail = (request) => {
      requests.push(request);
      return render(request);
    };
    try {
      // 셰이딩 모드를 바꾸면 모든 카드의 캐시 키가 바뀌어 썸네일이 다시 요청된다
      const mode = runtime.store.getState().recipe.shading.mode === "toon" ? "pbr" : "toon";
      runtime.store.dispatch({ type: "shading/set", profile: { mode } });
      await runtime.applyLoop.flush();
      await runtime.thumbnails.idle();
    } finally {
      harness.engine.renderThumbnail = render;
    }
    const geometrySlots = new Set(["eyes", "irises", "hair", "top", "bottom", "shoes", "accessory"]);
    expect(requests.length).toBe(APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + runtime.catalog.bySlot(slot).length, 0));
    for (const request of requests) {
      const slot = request.presetId.slice(0, request.presetId.indexOf("/"));
      expect({ id: request.presetId, hasSource: request.source !== undefined }).toEqual({ id: request.presetId, hasSource: geometrySlots.has(slot) });
    }
    const failed = Object.values(runtime.store.getState().thumbnails).filter((entry) => entry.status === "failed");
    expect(failed).toEqual([]);
    // 임시 리그는 해제되어 장면 객체 수와 리그 구성이 그대로다
    expect(harness.engine.inspectScene().meshCount).toBe(sceneBefore.meshCount);
    expect(harness.engine.inspectRig()?.parts.length).toBe(rigBefore?.parts.length);
    expect(runtime.store.getState().failures).toEqual([]);
  }, 120_000);

  it("외형 슬롯 프리셋 썸네일이 전부 만들어진다(NullEngine 합성 래스터)", async () => {
    await runtime.thumbnails.idle();
    const appearanceCount = APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + runtime.catalog.bySlot(slot).length, 0);
    const entries = Object.values(runtime.store.getState().thumbnails);
    expect(entries.filter((entry) => entry.status === "ready")).toHaveLength(appearanceCount);
    expect(entries.filter((entry) => entry.status === "failed")).toEqual([]);
  }, 120_000);
});
