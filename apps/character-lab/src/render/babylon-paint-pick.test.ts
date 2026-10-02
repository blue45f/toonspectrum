/**
 * pick(Ray)·페인트 텍스처 업로드 — NullEngine 하네스. pick은 CPU 레이캐스트라 NullEngine에서도 동작한다(스킨·morph 반영 확인).
 * MeshUVSpaceRenderer 투영 페인트(베타)와 실제 PBR decal 합성 결과는 GPU가 필요해 브라우저 미검증이다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyPlanFixture } from "../testing/recipe-fixtures";

import { createNullEngineHarness, pickStats } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { PaintLayer, PartRole } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

let harness: NullEngineHarness;

beforeEach(async () => {
  harness = await createNullEngineHarness({ size: 128, now: () => 3_000 });
  await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
});

afterEach(() => {
  harness.dispose();
});

function layer(part: PartRole, size: number, revision: number, fill: number): PaintLayer {
  const rgba = new Uint8ClampedArray(size * size * 4).fill(fill);
  return { part, width: size, height: size, rgba, revision };
}

/** 렌더 픽셀 → NDC(y 위쪽 양수) */
function toNdc(screen: readonly [number, number]): [number, number] {
  const size = harness.engine.viewportCamera();
  return [(screen[0] / size.width) * 2 - 1, 1 - (screen[1] / size.height) * 2];
}

function handleNdc(bone: string): [number, number] {
  const handle = harness.engine.jointHandles().find((candidate) => candidate.bone === bone);
  if (!handle) throw new Error(`핸들 없음: ${bone}`);
  return toNdc(handle.screen);
}

describe("pick", () => {
  it("몸 위 점은 파츠 ID·역할·UV·월드 위치·법선·거리를 돌려준다", () => {
    const hit = harness.engine.pick(...handleNdc("chest"));
    expect(hit).not.toBeNull();
    // 상의(partId 4)가 몸보다 바깥(+Z 0.145)에 있어 먼저 맞는다
    expect(hit).toMatchObject({ partId: 4, role: "top" });
    expect(hit?.worldPosition[2]).toBeCloseTo(0.145, 3);
    expect(hit?.worldNormal[2]).toBeCloseTo(1, 3);
    expect(hit?.uv[0]).toBeGreaterThanOrEqual(0);
    expect(hit?.uv[0]).toBeLessThanOrEqual(1);
    expect(hit?.uv[1]).toBeGreaterThanOrEqual(0);
    expect(hit?.uv[1]).toBeLessThanOrEqual(1);
    expect(hit?.distance).toBeGreaterThan(0);
    expect(harness.engine.pick(...handleNdc("head"))).toMatchObject({ partId: 1, role: "head" });
  });

  it("빈 공간·범위 밖·비수치 좌표는 null이다", () => {
    expect(harness.engine.pick(-0.99, 0.99)).toBeNull();
    expect(harness.engine.pick(5, 5)).toBeNull();
    expect(harness.engine.pick(Number.NaN, 0)).toBeNull();
    expect(harness.engine.pick(0, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("숨긴 파츠는 맞지 않고 그 뒤의 파츠가 맞는다", () => {
    harness.engine.applyPlan(applyPlanFixture({ parts: [{ partId: 4, visible: false, materialPreset: "cloth-cotton" }] }));
    expect(harness.engine.pick(...handleNdc("chest"))).toMatchObject({ partId: 2, role: "skin" });
  });

  it("스키닝 포즈를 반영한다: 엉덩이를 90° 눕히면 원래 가슴 위치는 비고 새 가슴 위치가 맞는다", () => {
    const before = handleNdc("chest");
    expect(harness.engine.pick(...before)).not.toBeNull();
    const quarter = Math.SQRT1_2;
    harness.engine.applyPlan(applyPlanFixture({ boneRotations: { hips: [0, 0, quarter, quarter] } }));
    expect(harness.engine.pick(...before)).toBeNull();
    const after = harness.engine.pick(...handleNdc("chest"));
    expect(after).toMatchObject({ role: "top" });
  });
});

describe("pick 캐시(스키닝·morph 재계산 최소화)", () => {
  it("포즈가 그대로면 재계산하지 않고, 바뀐 메시만 다시 스키닝한다", () => {
    const [x, y] = handleNdc("chest");
    harness.engine.pick(x, y);
    const baseline = pickStats.recomputes;
    for (let i = 0; i < 5; i += 1) harness.engine.pick(x, y);
    expect(pickStats.recomputes).toBe(baseline);
    // 머리 morph만 바꾸면 머리 메시(morph 보유)만 다시 계산된다
    harness.engine.applyPlan(applyPlanFixture({ morphWeights: { "param:eyeSize:+": 1 } }));
    harness.engine.pick(x, y);
    expect(pickStats.recomputes).toBe(baseline + 1);
    // 같은 플랜을 다시 적용해도 스냅샷이 같아 재계산이 없다
    harness.engine.applyPlan(applyPlanFixture({ revision: 2, morphWeights: { "param:eyeSize:+": 1 } }));
    harness.engine.pick(x, y);
    expect(pickStats.recomputes).toBe(baseline + 1);
  });

  it("본 회전은 스킨 메시를 다시 계산한다(상한 = 스킨 메시 수)", () => {
    const [x, y] = handleNdc("chest");
    harness.engine.pick(x, y);
    const baseline = pickStats.recomputes;
    // 스킨 행렬 스냅샷은 스켈레톤 전체 행렬이라 어느 본이 바뀌어도 모든 스킨 메시가 다시 계산된다(안 바뀌면 0).
    harness.engine.applyPlan(applyPlanFixture({ boneRotations: { hips: [0, 0, 0.0871557, 0.9961947] } }));
    harness.engine.pick(x, y);
    const recomputed = pickStats.recomputes - baseline;
    expect(recomputed).toBeGreaterThanOrEqual(1);
    expect(recomputed).toBeLessThanOrEqual(4);
    harness.engine.pick(x, y);
    expect(pickStats.recomputes - baseline).toBe(recomputed);
  });
});

describe("페인트 텍스처", () => {
  it("업로드하면 부위별 텍스처가 invertY=false로 만들어지고 해당 부위 메시에 decal로 연결된다", () => {
    expect(harness.engine.inspectPaint()).toEqual([]);
    harness.engine.updatePaintTexture(layer("skin", 16, 1, 120));
    const [info, ...rest] = harness.engine.inspectPaint();
    expect(rest).toEqual([]);
    expect(info).toEqual({ part: "skin", width: 16, height: 16, revision: 1, invertY: false, decalMeshes: 1, decalEnabled: true });
    // 다른 부위(머리·헤어)는 건드리지 않는다
    expect(harness.engine.inspectPaint().some((entry) => entry.part === "head")).toBe(false);
  });

  it("같은 크기는 같은 텍스처를 갱신하고 크기가 달라지면 다시 만든다(텍스처 누수 없음)", () => {
    harness.engine.updatePaintTexture(layer("skin", 16, 1, 10));
    const textures = harness.engine.inspectScene().textureCount;
    harness.engine.updatePaintTexture(layer("skin", 16, 2, 20));
    expect(harness.engine.inspectPaint()[0]).toMatchObject({ width: 16, revision: 2 });
    expect(harness.engine.inspectScene().textureCount).toBe(textures);
    harness.engine.updatePaintTexture(layer("skin", 32, 3, 30));
    expect(harness.engine.inspectPaint()[0]).toMatchObject({ width: 32, height: 32, revision: 3, decalMeshes: 1 });
    expect(harness.engine.inspectScene().textureCount).toBe(textures);
  });

  it("여러 부위를 따로 올리고 각각 자기 메시에만 연결한다", () => {
    harness.engine.updatePaintTexture(layer("head", 8, 1, 50));
    harness.engine.updatePaintTexture(layer("hair", 8, 1, 60));
    const parts = harness.engine.inspectPaint().map((entry) => entry.part).sort();
    expect(parts).toEqual(["hair", "head"]);
    expect(harness.engine.inspectPaint().every((entry) => entry.decalMeshes === 1 && entry.decalEnabled)).toBe(true);
  });

  it("소스를 다시 로드하면 기존 페인트 텍스처가 새 리그에 다시 붙는다(device lost 복원 경로)", async () => {
    harness.engine.updatePaintTexture(layer("skin", 16, 4, 90));
    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(harness.engine.inspectPaint()[0]).toMatchObject({ part: "skin", revision: 4, decalMeshes: 1, decalEnabled: true });
  });

  it("소스가 없을 때 올린 레이어는 텍스처만 만들어 두고 소스 로드 뒤 연결된다", async () => {
    const empty = await createNullEngineHarness();
    try {
      empty.engine.updatePaintTexture(layer("skin", 8, 1, 70));
      expect(empty.engine.inspectPaint()[0]).toMatchObject({ part: "skin", decalMeshes: 0, decalEnabled: false });
      await empty.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
      expect(empty.engine.inspectPaint()[0]).toMatchObject({ decalMeshes: 1, decalEnabled: true });
    } finally {
      empty.dispose();
    }
  });
});
