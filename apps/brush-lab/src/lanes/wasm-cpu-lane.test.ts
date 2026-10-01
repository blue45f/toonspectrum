import { describe, expect, it } from "vitest";

import { buildFixture } from "../bench/fixtures/stroke-fixtures";
import { pixelHash } from "../bench/metrics/render-metrics";
import { compareLanes } from "../bench/runner/ab-compare";
import { runFixture } from "../bench/runner/run-fixture";
import { alphaSum, fakeEnv } from "../bench/testing/synthetic-images";
import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";
import { embeddedKernelBytes } from "../engine/wasm/embedded";

import { createCpuReferenceLane } from "./cpu-reference-lane";
import { createWasmCpuLane, WASM_CPU_LANE } from "./wasm-cpu-lane";

import type { LaneEnvironment } from "./lane";

const SIZE = 96;

describe("wasm-cpu 레인", () => {
  it("디스크립터는 레인 계약과 일치하고 빈 환경에서도 내장 커널로 supported다", async () => {
    const lane = createWasmCpuLane();
    expect(lane.id).toBe(WASM_CPU_LANE.id);
    expect(lane.status).toBe(WASM_CPU_LANE.status);
    expect(lane.kind).toBe("candidate");
    const report = await lane.probe({ clock: { now: () => 0 } });
    expect(report).toMatchObject({ laneId: "wasm-cpu", status: "supported", reasons: [] });
    expect(report.features).toEqual(["wasm-abi-1"]);
    expect(report.limits.wasmKernelBytes).toBeGreaterThan(1000);
  });

  it("env.wasmBytes = null → wasm-artifact-missing, 변조 바이트 → wasm-integrity-mismatch(probe는 throw하지 않고 init은 LaneUnavailableError)", async () => {
    const lane = createWasmCpuLane();
    const missing: LaneEnvironment = { clock: { now: () => 0 }, wasmBytes: null };
    expect((await lane.probe(missing)).reasons).toEqual(["wasm-artifact-missing"]);
    await expect(lane.init(missing, { width: 16, height: 16, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "wasm-artifact-missing" });
    const tampered = embeddedKernelBytes();
    tampered[100] = (tampered[100] ?? 0) ^ 0xff;
    const bad: LaneEnvironment = { clock: { now: () => 0 }, wasmBytes: tampered };
    const report = await lane.probe(bad);
    expect(report.status).toBe("unavailable");
    expect(report.reasons).toEqual(["wasm-integrity-mismatch"]);
    await expect(lane.init(bad, { width: 16, height: 16, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(LaneUnavailableError);
  });

  it("주입한 정상 바이트도 같은 결과로 로드된다", async () => {
    const lane = createWasmCpuLane();
    const env: LaneEnvironment = { clock: { now: () => 0 }, wasmBytes: embeddedKernelBytes() };
    expect((await lane.probe(env)).status).toBe("supported");
  });

  it("fixture 실행: cpu-reference와 픽셀이 같다(건식·잉크·소프트 프리셋), 영수증·통계·readback이 계약대로 나온다", async () => {
    for (const presetId of ["pencil-hb", "ink-g-pen", "marker-alcohol", "eraser-soft"] as const) {
      const program = presetById(presetId);
      const fixture = buildFixture("zigzag", { width: SIZE, height: SIZE });
      const cpu = await runFixture({ lane: createCpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 3 });
      const lane = createWasmCpuLane();
      const wasm = await runFixture({ lane, env: fakeEnv(), fixture, program, seed: 3, disposeLane: false });
      expect(wasm.laneId).toBe("wasm-cpu");
      expect(wasm.receipt.dabCount).toBe(cpu.receipt.dabCount);
      expect(wasm.receipt.overflowDabs).toBe(0);
      expect(wasm.receipt.timingSource).toBe("unavailable");
      expect(wasm.frames.every((f) => f.submitCount === 1)).toBe(true);
      if (presetId !== "eraser-soft") expect(alphaSum(wasm.image)).toBeGreaterThan(0);
      const cmp = compareLanes(cpu, wasm, program, fixture);
      expect(cmp.hashEqual, `${presetId} 해시 동일`).toBe(true);
      expect(pixelHash(wasm.image)).toBe(pixelHash(cpu.image));
      expect(wasm.linear?.length).toBe(SIZE * SIZE * 4);
      expect(lane.stats()).toMatchObject({ strokes: 1, dabs: wasm.receipt.dabCount });
      lane.dispose();
    }
  });

  it("스프레이·에어브러시·습식(wet-flow) 프리셋도 실행되고 cpu-reference와 δ48 퍼지 불일치 0 · ΔE p99 < 0.5다", async () => {
    for (const presetId of ["spray-splatter", "airbrush", "watercolor-wet"] as const) {
      const program = presetById(presetId);
      const fixture = buildFixture("curve", { width: 64, height: 64 });
      const cpu = await runFixture({ lane: createCpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 2 });
      const wasm = await runFixture({ lane: createWasmCpuLane(), env: fakeEnv(), fixture, program, seed: 2 });
      const cmp = compareLanes(cpu, wasm, program, fixture);
      expect(cmp.fuzzyMismatchPct, presetId).toBe(0);
      expect(cmp.deltaE.p99, presetId).toBeLessThan(0.5);
    }
  });

  it("임파스토도 cpu-reference와 픽셀이 같다(타일 래스터는 임파스토 dab를 건너뛰고 유화 물감 층·밀기는 TS 패스를 그대로 쓴다)", async () => {
    const program = presetById("oil-impasto");
    for (const fixtureId of ["zigzag", "curve"] as const) {
      const fixture = buildFixture(fixtureId, { width: 64, height: 64 });
      const cpu = await runFixture({ lane: createCpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 2 });
      const wasm = await runFixture({ lane: createWasmCpuLane(), env: fakeEnv(), fixture, program, seed: 2 });
      expect(alphaSum(wasm.image), fixtureId).toBeGreaterThan(0);
      expect(compareLanes(cpu, wasm, program, fixture).hashEqual, fixtureId).toBe(true);
      expect(wasm.linear && cpu.linear ? Array.from(wasm.linear) : null).toEqual(cpu.linear ? Array.from(cpu.linear) : undefined);
    }
  });

  it("호출 순서 위반·dispose 뒤 호출은 InvalidStateError, 타일 크기 8은 limit-exceeded", async () => {
    const lane = createWasmCpuLane();
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(InvalidStateError);
    await expect(lane.init(fakeEnv(), { width: 16, height: 16, dpr: 1, tileSize: 8 as 16, seed: 1 })).rejects.toMatchObject({ code: "limit-exceeded" });
    await lane.init(fakeEnv(), { width: 16, height: 16, dpr: 1, tileSize: 16, seed: 1 });
    expect(() => lane.addSamples([])).toThrow(InvalidStateError);
    lane.beginStroke(presetById("pencil-hb"), 1);
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(InvalidStateError);
    lane.dispose();
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
    await expect(lane.init(fakeEnv(), { width: 16, height: 16, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(InvalidStateError);
  });
});
