import { describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, APPEARANCE_SLOT_KINDS, CHARACTER_SLOT_KINDS, HUMANOID_BONE_NAMES, MIN_PRESETS_PER_SLOT, validateMeshPartData } from "../contracts";
import { createPaintSession } from "../paint/paint-session";
import { createMockEngine, createMockEngineFactory } from "../testing/mock-engine";

import { COMPOSED_PANELS, composeCharacterLab, uploadPaintLayers } from "./composition";

import type { ThumbnailRequest } from "../contracts";

function canvasStub(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

describe("app/composition", () => {
  it("실제 영역 모듈로 조립하면 카탈로그 94개(외형 64 + 연기 30)가 불변식을 통과하고 failure가 없다", () => {
    const runtime = composeCharacterLab();
    expect(runtime.catalogFailures).toEqual([]);
    expect(runtime.store.getState().failures).toEqual([]);
    expect(runtime.catalog.entries).toHaveLength(94);
    for (const slot of CHARACTER_SLOT_KINDS) {
      expect(runtime.catalog.bySlot(slot).length).toBeGreaterThanOrEqual(MIN_PRESETS_PER_SLOT[slot]);
    }
    expect(APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + runtime.catalog.bySlot(slot).length, 0)).toBe(64);
    expect(runtime.panels).toBe(COMPOSED_PANELS);
    expect(Object.keys(COMPOSED_PANELS).sort()).toEqual([
      "ExportPanel",
      "ExpressionPanel",
      "PackagePanel",
      "PaintPanel",
      "ParamPanel",
      "PhysicsPanel",
      "PosePanel",
      "RenderPanel",
      "SlotPanel",
      "ViewportPane",
      "VisionPanel",
    ]);
    runtime.dispose();
  });

  it("기본 절차 소스의 능력 맵은 처음부터 15슬롯 전부 지원이다(엔진 선택 전에도 슬롯 패널이 쓸 수 있다)", () => {
    const runtime = composeCharacterLab();
    expect(runtime.store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
    runtime.dispose();
  });

  it("GPU가 없는 환경에서 WebGPU/WebGL2 명시 선택은 capability 차단 사유로 failed가 되고 엔진을 만들지 않는다", async () => {
    const runtime = composeCharacterLab();
    await runtime.engineSession.select("webgpu", canvasStub());
    expect(runtime.engineSession.status()).toMatchObject({ phase: "failed", backend: "webgpu", failure: { code: "webgpu-unsupported" } });
    await runtime.engineSession.select("webgl2", canvasStub());
    expect(runtime.engineSession.status()).toMatchObject({ phase: "failed", backend: "webgl2", failure: { code: "webgl2-unsupported" } });
    expect(runtime.engineSession.engine()).toBeNull();
    runtime.dispose();
  });

  it("실제 휴머노이드·플래너로 조립한 파이프라인이 모의 엔진에 절차 소스를 올리고, 지오메트리 슬롯을 바꿀 때만 소스를 다시 만든다", async () => {
    const engine = createMockEngine();
    const factory = createMockEngineFactory({ engine });
    const runtime = composeCharacterLab({ loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), subdivisionLevels: 0 });
    const stop = runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();

    expect(runtime.store.getState().failures).toEqual([]);
    expect(engine.loadedSources).toHaveLength(1);
    const first = engine.loadedSources[0];
    if (first?.kind !== "procedural") throw new Error("절차 소스가 올라가야 합니다.");
    expect(first.model.parts.length).toBeGreaterThan(0);
    for (const part of first.model.parts) expect(validateMeshPartData(part)).toBeNull();
    expect(first.model.skeleton.bones.slice(0, HUMANOID_BONE_NAMES.length).map((bone) => bone.name)).toEqual([...HUMANOID_BONE_NAMES]);
    expect(engine.appliedPlans).toHaveLength(1);
    // 모든 슬롯이 지원이라 플랜에 미지원 사유가 없다
    expect(engine.appliedPlans[0]?.unsupported).toEqual([]);

    // 색 변경은 플랜만 다시 적용한다
    runtime.store.dispatch({ type: "color/set", key: "skin", value: "#c8a080" });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    expect(engine.appliedPlans).toHaveLength(2);

    // 헤어 슬롯 변경은 지오메트리가 바뀌므로 소스를 다시 올리고 플랜도 다시 적용한다
    const currentHair = runtime.store.getState().recipe.slots.hair;
    const otherHair = runtime.catalog.bySlot("hair").find((entry) => entry.id !== currentHair);
    if (!otherHair) throw new Error("다른 헤어 프리셋이 필요합니다.");
    runtime.store.dispatch({ type: "slot/apply", slot: "hair", presetId: otherHair.id });
    await runtime.applyLoop.flush();
    expect(runtime.store.getState().failures).toEqual([]);
    expect(engine.loadedSources).toHaveLength(2);
    expect(engine.appliedPlans).toHaveLength(3);
    stop();
    runtime.dispose();
  }, 60_000);

  it("엔진이 thumbnailSources를 지원하면 지오메트리 슬롯 카드만 그 프리셋을 입힌 임시 소스로 요청한다", async () => {
    const engine = createMockEngine({ thumbnailSources: true });
    const factory = createMockEngineFactory({ engine });
    const runtime = composeCharacterLab({ loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), subdivisionLevels: 0 });
    const stop = runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();

    const requests = engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as ThumbnailRequest);
    const geometrySlots = new Set<string>(["eyes", "irises", "hair", "top", "bottom", "shoes", "accessory"]);
    const slotOf = (request: ThumbnailRequest): string => request.presetId.slice(0, request.presetId.indexOf("/"));
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      if (geometrySlots.has(slotOf(request))) expect(request.source?.kind).toBe("procedural");
      else expect("source" in request).toBe(false);
    }
    // 헤어 카드는 프리셋마다 지오메트리가 다르다(모두 현재 헤어로 그려지는 것을 막는다)
    const hairShapes = requests
      .filter((request) => slotOf(request) === "hair" && request.source?.kind === "procedural")
      .map((request) => {
        const hair = request.source?.kind === "procedural" ? request.source.model.parts.find((part) => part.role === "hair") : undefined;
        return hair ? `${hair.positions.length}:${hair.positions[0] ?? 0}:${hair.positions[hair.positions.length - 1] ?? 0}` : "none";
      });
    expect(hairShapes).toHaveLength(runtime.catalog.bySlot("hair").length);
    expect(new Set(hairShapes).size).toBeGreaterThan(1);
    expect(runtime.store.getState().failures).toEqual([]);
    stop();
    runtime.dispose();
  }, 60_000);

  it("uploadPaintLayers는 비어 있지 않은 레이어만 엔진에 올린다", () => {
    const session = createPaintSession({ layerSize: 64 });
    const engine = createMockEngine();
    expect(uploadPaintLayers(session, engine)).toBe(0);
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    session.endStroke();
    expect(uploadPaintLayers(session, engine)).toBe(1);
    expect(engine.calls.filter((call) => call.method === "updatePaintTexture")).toHaveLength(1);
  });
});
