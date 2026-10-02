import { describe, expect, it } from "vitest";

import { buildFixture } from "../../bench/fixtures/stroke-fixtures";
import { parseReport } from "../../bench/report/report-schema";
import { createMockLane, mockDescriptor, mockEnvironment, unavailableDescriptor } from "../testing/mock-lane";
import { createMockRunner } from "../testing/mock-runner";

import { createLabActions, createLabStore } from "./lab-store";
import { probeAllLanes, probeLane, resolveFixture, resolveProgram, runCompare } from "./run-compare";

import type { CompareDeps } from "./run-compare";
import type { CapturedStroke } from "../../bench/fixtures/fixture-schema";
import type { LaneDescriptor } from "../../lanes/lane";
import type { MockLane } from "../testing/mock-lane";

function deps(registry: readonly LaneDescriptor[], initial: Parameters<typeof createLabStore>[0] = {}): CompareDeps {
  const store = createLabStore({ laneA: "cpu-reference", laneB: "canvas2d", canvasSize: 64, ...initial });
  return { registry, env: mockEnvironment(), runner: createMockRunner(), store, actions: createLabActions(store) };
}

describe("resolveProgram / resolveFixture", () => {
  it("프리셋 + 오버라이드를 검증된 프로그램과 16자리 해시로 해석하고, 실패 사유는 문자열로 돌려준다", () => {
    const ok = resolveProgram({ presetId: "pencil-hb", overrides: { sizePx: 20 } });
    expect(ok.program?.tip.sizePx).toBe(20);
    expect(ok.hash).toMatch(/^[0-9a-f]{16}$/u);
    expect(ok.error).toBeNull();
    const base = resolveProgram({ presetId: "pencil-hb", overrides: {} });
    expect(base.hash).not.toBe(ok.hash);
    const missing = resolveProgram({ presetId: "없음", overrides: {} });
    expect(missing.program).toBeNull();
    expect(missing.error).toContain("없음");
    const invalid = resolveProgram({ presetId: "pencil-hb", overrides: { hardness: 5 } });
    expect(invalid.program).toBeNull();
    expect(invalid.error).toContain("스키마");
  });

  it("내장 fixture는 캔버스 크기로, 캡처 획은 캡처 당시 크기로 fixture를 만든다", () => {
    const builtin = resolveFixture({ fixtureId: "line", fixtureSource: "builtin", captured: null, canvasSize: 128 });
    expect(builtin.id).toBe("line");
    expect(builtin.width).toBe(128);
    const base = buildFixture("line", { width: 128, height: 128 });
    expect(builtin.samples).toEqual(base.samples);
    const captured: CapturedStroke = {
      version: "1.0.0",
      userAgent: "test",
      pointerType: "pen",
      width: 300,
      height: 200,
      capturedAt: null,
      samples: [
        { ...base.samples[0]!, phase: "down" },
        { ...base.samples[1]!, phase: "up" },
      ],
    };
    const live = resolveFixture({ fixtureId: "line", fixtureSource: "captured", captured, canvasSize: 128 });
    expect(live.id).toBe("captured:live");
    expect(live.width).toBe(300);
    expect(live.height).toBe(200);
    expect(live.samples).toHaveLength(2);
    // 캡처 출처인데 캡처 획이 없으면 내장 fixture로 돌아간다
    const fallback = resolveFixture({ fixtureId: "line", fixtureSource: "captured", captured: null, canvasSize: 64 });
    expect(fallback.id).toBe("line");
  });
});

describe("probeLane / probeAllLanes", () => {
  it("reserved 레인과 생성 실패는 not-implemented, 나머지는 레인 probe 결과를 그대로 기록한다", async () => {
    const env = mockEnvironment();
    const reserved = mockDescriptor({ id: "wasm-cpu", status: "reserved" });
    expect(await probeLane(reserved, env)).toMatchObject({ status: "unavailable", reasons: ["not-implemented"] });
    const broken: LaneDescriptor = {
      ...mockDescriptor({ id: "webgl2-instanced" }),
      create: () => {
        throw new Error("생성 실패");
      },
    };
    expect(await probeLane(broken, env)).toMatchObject({ status: "unavailable", reasons: ["not-implemented"] });
    const registry = [
      mockDescriptor({ id: "cpu-reference" }),
      unavailableDescriptor("webgpu-compute", ["webgpu-api-unavailable", "adapter-unavailable"]),
      reserved,
    ];
    const d = deps(registry);
    await probeAllLanes(d);
    const cap = d.store.get().capability;
    expect(cap["cpu-reference"]?.status).toBe("supported");
    expect(cap["webgpu-compute"]?.reasons).toEqual(["webgpu-api-unavailable", "adapter-unavailable"]);
    expect(cap["wasm-cpu"]?.reasons).toEqual(["not-implemented"]);
    expect(cap.canvas2d).toBeNull();
  });
});

describe("runCompare", () => {
  it("두 레인이 지원되면 A→B 순차 실행, 비교·리포트 2개·세션 리포트 누적, 레인은 dispose된다", async () => {
    const lanesA: MockLane[] = [];
    const lanesB: MockLane[] = [];
    const registry = [
      mockDescriptor({ id: "cpu-reference", lanes: lanesA }),
      mockDescriptor({ id: "canvas2d", lanes: lanesB, kind: "baseline" }),
    ];
    const d = deps(registry);
    expect(await runCompare(d)).toBe(true);
    const s = d.store.get();
    expect(s.running).toBe(false);
    expect(s.errors).toEqual([]);
    expect(s.results.source).toBe("fixture");
    expect(s.results.a?.laneId).toBe("cpu-reference");
    expect(s.results.b?.laneId).toBe("canvas2d");
    expect(s.results.a?.image.width).toBe(64);
    // 같은 모의 래스터라이저·같은 색이므로 픽셀 동일
    expect(s.results.comparison?.hashEqual).toBe(true);
    expect(s.results.comparison?.iou).toBe(1);
    expect(s.results.comparison?.heatmap.width).toBe(64);
    expect(s.results.reportA?.laneId).toBe("cpu-reference");
    expect(s.results.reportB?.laneId).toBe("canvas2d");
    expect(s.reports).toHaveLength(2);
    for (const r of s.reports) expect(() => parseReport(JSON.parse(JSON.stringify(r)))).not.toThrow();
    expect(s.results.reportA?.pixelHash).toBe(s.results.comparison?.hashA);
    // probe 전용 인스턴스(init 없음) 1개 + 결정성 재실행(기본 on): 본 실행·재실행 레인 2개, init된 레인은 모두 dispose
    const initedA = lanesA.filter((l) => l.calls.includes("init"));
    const initedB = lanesB.filter((l) => l.calls.includes("init"));
    expect(lanesA.filter((l) => !l.calls.includes("init")).map((l) => l.calls)).toEqual([["probe"]]);
    expect(initedA).toHaveLength(2);
    expect(initedB).toHaveLength(2);
    for (const lane of [...initedA, ...initedB]) expect(lane.calls.at(-1)).toBe("dispose");
    expect(initedA[0]?.calls.filter((c) => c === "addSamples").length).toBeGreaterThan(1);
    expect(s.results.reportA?.metrics.render.determinism).toBe(1);
    expect(s.results.reportA?.verdicts["render.determinism"]).toBe("PASS");
    expect(s.results.reportA?.referenceLaneId).toBeNull();
    // B 리포트는 A를 참조 레인으로 비교한다
    expect(s.results.reportB?.referenceLaneId).toBe("cpu-reference");
    expect(s.results.reportB?.metrics.render.coverageIoU).toBe(1);
    expect(s.results.reportA?.seed).toBe(1);
    expect(s.results.reportA?.environment.userAgent).toBe("vitest/jsdom");
  });

  it("결정성 재실행을 끄면 슬롯당 레인 1개만 쓰고 결정성 지표는 측정 불가(UNAVAILABLE 사유)다", async () => {
    const lanesA: MockLane[] = [];
    const registry = [mockDescriptor({ id: "cpu-reference", lanes: lanesA }), mockDescriptor({ id: "canvas2d" })];
    const d = deps(registry, { determinismRerun: false });
    expect(await runCompare(d)).toBe(true);
    expect(lanesA.filter((l) => l.calls.includes("init"))).toHaveLength(1);
    expect(d.store.get().results.reportA?.metrics.render.determinism).toBeNull();
    expect(d.store.get().results.reportA?.verdicts["render.determinism"]).toBeUndefined();
  });

  it("B 레인이 unavailable이면 사유 코드로 오류를 남기고 A만 실행하며 다른 레인으로 전환하지 않는다", async () => {
    const registry = [
      mockDescriptor({ id: "cpu-reference" }),
      unavailableDescriptor("webgpu-compute", ["webgpu-api-unavailable"]),
    ];
    const d = deps(registry, { laneB: "webgpu-compute" });
    expect(await runCompare(d)).toBe(true);
    const s = d.store.get();
    expect(s.laneB).toBe("webgpu-compute");
    expect(s.results.a).not.toBeNull();
    expect(s.results.b).toBeNull();
    expect(s.results.comparison).toBeNull();
    expect(s.reports).toHaveLength(1);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toMatchObject({ laneId: "webgpu-compute", code: "webgpu-api-unavailable" });
    expect(s.errors[0]?.message).toContain("자동 전환하지 않는다");
  });

  it("레지스트리에 없는 레인·init 실패·리포트 실패·잘못된 프로그램은 각각 오류 목록에 남는다", async () => {
    const d1 = deps([mockDescriptor({ id: "cpu-reference" })]);
    expect(await runCompare(d1)).toBe(true);
    expect(d1.store.get().errors[0]).toMatchObject({ laneId: "canvas2d", code: "lane-unknown" });

    const d2 = deps([mockDescriptor({ id: "cpu-reference" }), mockDescriptor({ id: "canvas2d", failInit: "dom-unavailable" })]);
    expect(await runCompare(d2)).toBe(true);
    expect(d2.store.get().errors[0]).toMatchObject({ laneId: "canvas2d", code: "dom-unavailable" });
    expect(d2.store.get().results.b).toBeNull();

    const d3 = deps([mockDescriptor({ id: "cpu-reference" }), mockDescriptor({ id: "canvas2d" })]);
    d3.runner = createMockRunner({ failBuildReport: new Error("리포트 실패") });
    expect(await runCompare(d3)).toBe(false);
    expect(d3.store.get().errors.map((e) => e.laneId)).toEqual(["cpu-reference", "canvas2d"]);
    expect(d3.store.get().results.a).toBeNull();

    const d4 = deps([mockDescriptor({ id: "cpu-reference" })], { presetId: "없음" });
    expect(await runCompare(d4)).toBe(false);
    expect(d4.store.get().errors[0]).toMatchObject({ laneId: null, code: "program-invalid" });
    expect(d4.store.get().running).toBe(false);
  });

  it("실행 중이면 중복 실행하지 않는다", async () => {
    const d = deps([mockDescriptor({ id: "cpu-reference" }), mockDescriptor({ id: "canvas2d" })], { running: true });
    expect(await runCompare(d)).toBe(false);
    expect(d.store.get().results.a).toBeNull();
    const lane = createMockLane();
    expect(lane.stats().strokes).toBe(0);
  });
});
