/**
 * 썸네일 — `thumbnailSources`(지오메트리 프리셋의 임시 리그)와 캡처 직렬화·일시 적용 구간. NullEngine 하네스.
 * 모의 readback(`installFakeReadback`)의 지연 Promise로 "readback 대기 중에는 이미 원래 상태로 복원됐다"와
 * "캡처가 겹치지 않는다"를 확인한다(실제 GPU 비동기 readback 타이밍은 브라우저 미검증).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_FRAMING, DEFAULT_SHADING } from "../contracts";
import { sha256Hex } from "../shared/hash";
import { rasterEquals } from "../testing/raster-fixtures";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { THUMBNAIL_LAYER_MASK, createNullEngineHarness, installFakeReadback } from "./testing/null-engine-harness";
import { createPackagePlanFixture } from "./testing/package-plan-fixture";
import { boxGeometry, createProceduralFixture } from "./testing/procedural-fixture";

import type { CharacterSource, HumanoidModelData, ThumbnailRequest } from "../contracts";
import type { ReadbackLane } from "./readback";
import type { NullEngineHarness } from "./testing/null-engine-harness";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

async function makeHarness(options: { lane?: ReadbackLane; fetchBytes?: (url: string) => Promise<Uint8Array> } = {}): Promise<NullEngineHarness> {
  const harness = await createNullEngineHarness({ now: () => 11_000, ...(options.lane ? { lane: options.lane } : {}), ...(options.fetchBytes ? { fetchBytes: options.fetchBytes, verifyPackageSha: false } : {}) });
  cleanups.push(() => harness.dispose());
  await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  return harness;
}

/** 헤어 파츠를 키운 변형(다른 헤어 프리셋을 흉내) */
function bigHairModel(): HumanoidModelData {
  const model = createProceduralFixture();
  const geometry = boxGeometry([0, 1.85, -0.02], [0.5, 0.4, 0.5]);
  return { ...model, parts: model.parts.map((part) => (part.role === "hair" ? { ...part, ...geometry } : part)) };
}

/** 헤어가 없는 변형 */
function noHairModel(): HumanoidModelData {
  const model = createProceduralFixture();
  const parts = model.parts.filter((part) => part.role !== "hair");
  return { ...model, parts, partIdPalette: Object.fromEntries(Object.entries(model.partIdPalette).filter(([id]) => Number(id) !== 3)) };
}

function request(source?: CharacterSource, overrides: Partial<ThumbnailRequest> = {}): ThumbnailRequest {
  return { presetId: "hair/soft-bob", plan: applyPlanFixture({ parts: [] }), size: 96, framing: DEFAULT_FRAMING, ...(source ? { source } : {}), ...overrides };
}

function opaqueCount(raster: { readonly rgba: Uint8ClampedArray }): number {
  let count = 0;
  for (let i = 3; i < raster.rgba.length; i += 4) if ((raster.rgba[i] ?? 0) > 0) count += 1;
  return count;
}

describe("thumbnailSources 계약", () => {
  it("엔진은 임시 소스 썸네일을 지원한다고 선언한다", async () => {
    const { engine } = await makeHarness();
    expect(engine.thumbnailSources).toBe(true);
  });

  it("임시 소스의 지오메트리로 그린다: 다른 헤어·헤어 없음 소스는 현재 소스와 다르고 같은 소스는 현재 소스와 같다", async () => {
    const { engine } = await makeHarness();
    const current = await engine.renderThumbnail(request());
    const same = await engine.renderThumbnail(request({ kind: "procedural", model: createProceduralFixture() }));
    const big = await engine.renderThumbnail(request({ kind: "procedural", model: bigHairModel() }));
    const none = await engine.renderThumbnail(request({ kind: "procedural", model: noHairModel() }));
    // 같은 소스는 현재 소스와 바이트까지 같다(결정적)
    expect(rasterEquals(same, current)).toBe(true);
    // 프레이밍은 임시 소스의 bounds를 따르므로 헤어 크기에 따라 캐릭터 크기가 달라진다(키 큰 헤어 → 더 멀리, 없음 → 더 가까이)
    expect(rasterEquals(big, current)).toBe(false);
    expect(rasterEquals(none, current)).toBe(false);
    expect(opaqueCount(big)).toBeLessThan(opaqueCount(current));
    expect(opaqueCount(none)).toBeGreaterThan(opaqueCount(current));
  });

  it("주 리그·플랜·물리 바인딩·장면 객체를 건드리지 않는다(누수 없음, 5회 반복)", async () => {
    const { engine } = await makeHarness();
    engine.applyPlan(applyPlanFixture({ revision: 4, morphWeights: { "param:eyeSize:+": 0.4 }, parts: [{ partId: 3, visible: false, materialPreset: "hair-aniso" }] }));
    const rigBefore = engine.inspectRig();
    const sceneBefore = engine.inspectScene();
    const digest = engine.planDigest();
    const headBefore = engine.readBone("head");
    for (let i = 0; i < 5; i += 1) {
      await engine.renderThumbnail(request({ kind: "procedural", model: i % 2 === 0 ? bigHairModel() : noHairModel() }, { plan: applyPlanFixture({ revision: 9, morphWeights: { "param:eyeSize:+": 1 } }) }));
    }
    expect(engine.inspectRig()).toEqual(rigBefore);
    expect(engine.planDigest()).toBe(digest);
    expect(engine.readBone("head")).toEqual(headBefore);
    const sceneAfter = engine.inspectScene();
    for (const key of ["meshCount", "viewportMeshCount", "skeletonCount", "materialCount", "textureCount", "transformNodeCount"] as const) expect(sceneAfter[key], key).toBe(sceneBefore[key]);
  });

  it("툰 모드에서도 임시 리그의 툰 재질·스켈레톤·morph 매니저가 모두 해제된다", async () => {
    const { engine } = await makeHarness();
    engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    const before = engine.inspectScene();
    for (let i = 0; i < 3; i += 1) await engine.renderThumbnail(request({ kind: "procedural", model: bigHairModel() }));
    const after = engine.inspectScene();
    for (const key of ["meshCount", "skeletonCount", "materialCount", "textureCount", "transformNodeCount"] as const) expect(after[key], key).toBe(before[key]);
  });

  it("플랜은 임시 리그에 적용된다(헤어를 숨기는 플랜이면 같은 소스라도 다른 래스터가 나온다)", async () => {
    const { engine } = await makeHarness();
    const withHair = await engine.renderThumbnail(request({ kind: "procedural", model: bigHairModel() }));
    const hidden = await engine.renderThumbnail(request({ kind: "procedural", model: bigHairModel() }, { plan: applyPlanFixture({ parts: [{ partId: 3, visible: false, materialPreset: "hair-aniso" }] }) }));
    expect(rasterEquals(hidden, withHair)).toBe(false);
    // 헤어를 숨기면 bounds가 줄어 같은 크기 안에서 캐릭터가 더 크게 보인다
    expect(opaqueCount(hidden)).toBeGreaterThan(opaqueCount(withHair));
  });

  it("검증에 실패한 임시 소스는 LabFailure로 reject하고 주 장면을 오염시키지 않는다", async () => {
    const { engine } = await makeHarness();
    const sceneBefore = engine.inspectScene();
    const model = createProceduralFixture();
    const broken: HumanoidModelData = { ...model, parts: model.parts.map((part, index) => (index === 0 ? { ...part, indices: new Uint32Array([0, 1, 9999]) } : part)) };
    await expect(engine.renderThumbnail(request({ kind: "procedural", model: broken }))).rejects.toMatchObject({ code: expect.any(String) });
    expect(engine.inspectScene()).toEqual(sceneBefore);
    // 실패 뒤에도 다음 썸네일은 정상이다(직렬 체인이 끊기지 않는다)
    await expect(engine.renderThumbnail(request())).resolves.toMatchObject({ width: 96 });
  });

  it("패키지 소스도 임시로 그리고 해제한다(실제 GLB, SHA 검증 생략)", async () => {
    const id = "reference-character";
    const root = path.resolve(process.cwd().endsWith("character-lab") ? process.cwd() : path.join(process.cwd(), "apps", "character-lab"), "public", "assets", "characters");
    const bytes = new Uint8Array(readFileSync(path.join(root, id, `${id}.glb`)));
    const plan = createPackagePlanFixture({ characterId: id, glbUrl: `/assets/characters/${id}/${id}.glb`, bytes });
    const { engine } = await makeHarness({ fetchBytes: async () => bytes });
    const before = engine.inspectScene();
    const raster = await engine.renderThumbnail(request({ kind: "package", plan }, { size: 128 }));
    expect([raster.width, raster.height]).toEqual([128, 128]);
    const after = engine.inspectScene();
    for (const key of ["meshCount", "skeletonCount", "materialCount", "textureCount", "transformNodeCount"] as const) expect(after[key], key).toBe(before[key]);
    // SHA가 맞는 플랜은 그대로 통과하고 어긋나면 임시 소스도 실패로 보고한다
    const wrong = { ...plan, glbSha256: await sha256Hex(new Uint8Array([1])) };
    const verifying = await createNullEngineHarness({ fetchBytes: async () => bytes, verifyPackageSha: true });
    cleanups.push(() => verifying.dispose());
    await verifying.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    await expect(verifying.engine.renderThumbnail(request({ kind: "package", plan: wrong }))).rejects.toMatchObject({ code: "package-sha-mismatch" });
  });
});

describe("임시 리그 격리(readback 시점의 장면)", () => {
  it("readPixels 호출 시점에 임시 메시는 레이어 마스크로 뷰포트 카메라에서 숨겨지고 그림자를 받지 않는다", async () => {
    const { engine } = await makeHarness({ lane: "webgl2" });
    const mainMeshes = engine.inspectScene().viewportMeshCount;
    let seen: { viewport: number; total: number } | null = null;
    cleanups.push(
      installFakeReadback((_pass, w, h) => {
        const scene = engine.inspectScene();
        seen = { viewport: scene.viewportMeshCount, total: scene.meshCount };
        return new Uint8Array(w * h * 4).fill(255);
      }),
    );
    const baseline = engine.inspectScene().meshCount;
    await engine.renderThumbnail(request({ kind: "procedural", model: bigHairModel() }));
    expect(seen).not.toBeNull();
    // 임시 리그 메시(4개)가 장면에는 있었지만 뷰포트 카메라가 그리는 메시 수는 그대로다
    expect(seen).toEqual({ viewport: mainMeshes, total: baseline + 4 });
    expect(THUMBNAIL_LAYER_MASK & 0x0fffffff).toBe(0);
  });
});

describe("일시 적용 구간과 캡처 직렬화", () => {
  /** 'lit' readback을 지연시키는 모의 readback. release()로 풀어 준다. */
  function deferLit(): { release: () => void; submitted: () => number } {
    let release: () => void = () => undefined;
    let submitted = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    cleanups.push(
      installFakeReadback((pass, w, h) => {
        submitted += 1;
        const bytes = new Uint8Array(w * h * 4).fill(200);
        return pass === "lit" ? gate.then(() => bytes) : bytes;
      }),
    );
    return { release, submitted: () => submitted };
  }

  it("readback을 기다리는 동안에는 이미 원래 상태로 복원돼 있다(뷰포트 깜빡임 없음)", async () => {
    const { engine } = await makeHarness({ lane: "webgl2" });
    engine.applyPlan(applyPlanFixture({ morphWeights: { "param:eyeSize:+": 0.3 } }));
    const before = engine.inspectRig();
    const gate = deferLit();
    const pending = engine.renderThumbnail(request(undefined, { plan: applyPlanFixture({ morphWeights: { "param:eyeSize:+": 1 }, parts: [{ partId: 3, visible: false, materialPreset: "hair-aniso" }] }) }));
    // readback이 아직 끝나지 않은 시점(마이크로태스크 몇 번 뒤)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(gate.submitted()).toBe(1);
    expect(engine.inspectRig()).toEqual(before);
    gate.release();
    const raster = await pending;
    expect(raster.width).toBe(96);
    expect(engine.inspectRig()).toEqual(before);
  });

  it("캡처 작업은 직렬화된다: 썸네일 readback이 끝나기 전에는 renderPasses가 시작하지 않는다", async () => {
    const { engine } = await makeHarness({ lane: "webgl2" });
    const gate = deferLit();
    const thumbnail = engine.renderThumbnail(request());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(gate.submitted()).toBe(1);
    const passes = engine.renderPasses({ width: 8, height: 8, passes: ["flat"], transparentBackground: true, settleSteps: 0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    // 썸네일이 대기 중이라 flat 패스 readback은 아직 제출되지 않았다
    expect(gate.submitted()).toBe(1);
    gate.release();
    await Promise.all([thumbnail, passes]);
    expect(gate.submitted()).toBe(2);
  });

  it("앞선 캡처가 실패해도 다음 캡처가 실행된다", async () => {
    const { engine } = await makeHarness();
    await expect(engine.renderPasses({ width: 0, height: 8, passes: ["flat"], transparentBackground: true, settleSteps: 0 })).rejects.toMatchObject({ code: "capture-size-invalid" });
    await expect(engine.renderPasses({ width: 8, height: 8, passes: ["flat"], transparentBackground: true, settleSteps: 0 })).resolves.toMatchObject({ width: 8 });
  });
});
