import { beforeAll, describe, expect, it } from "vitest";

import { StrokeBudgetExceededError, InvalidStateError } from "../core/errors";
import { StrokePipeline } from "../dynamics/stroke-pipeline";
import { PRESET_CATALOG, presetById } from "../presets/catalog";
import { splitFrames, Surface, tipChainFor } from "../raster/reference-renderer";
import { cornerStroke, lineStroke, parametricStroke, zigzagStroke } from "../testing/synthetic-strokes";
import { TIP_KINDS_ORDERED } from "../texture/mip-chain";

import { loadEmbeddedKernel } from "./embedded";
import { tipAtlasFloats } from "./kernel-abi";
import { flattenTipAtlas, WasmSurface } from "./wasm-surface";

import type { SumiKernel } from "./loader";
import type { RawSample, TipKind } from "../core/types";
import type { BrushProgram } from "../presets/program-schema";
import type { TipMask } from "../texture/tip-generators";

/**
 * WasmSurface(wasm 타일 래스터) ↔ CPU 참조 Surface 일치. 같은 StrokePipeline이 만든 같은 배치를 두 표면에 먹이고
 * 표시 문서(선형 premultiplied f32, 습식 층·릴리프 조명 포함)를 비교한다. WasmSurface는 Surface를 상속하고 획 레이어만 wasm으로
 * 바꾸므로 습식 층(수채·유화)·플래튼·표시 합성은 같은 코드이며, 카탈로그의 모든 침착 모델(임파스토 포함)을 덮는다.
 */
const SIZE = 64;
let kernel: SumiKernel;

beforeAll(async () => {
  // 내장 바이트가 pkg/sumi_kernel.wasm과 같다는 것은 lanes/wasm-kernel-seal.test.ts가 고정한다.
  kernel = await loadEmbeddedKernel();
});

type FixtureId = "zigzag" | "curve" | "tilt-sweep" | "line" | "corner";

/** `engine/**`는 bench를 import하지 않으므로 합성 획으로 대체한다(두 표면에 같은 입력을 먹이는 것이 목적이다). */
function strokeFor(id: FixtureId): RawSample[] {
  switch (id) {
    case "zigzag":
      return zigzagStroke(SIZE);
    case "line":
      return lineStroke(SIZE * 0.1, SIZE * 0.5, SIZE * 0.9, SIZE * 0.5, 0.6, { durationMs: 300 });
    case "corner":
      return cornerStroke(SIZE);
    case "curve":
      return parametricStroke(
        (t) => ({ x: SIZE * (0.1 + 0.8 * t), y: SIZE * (0.5 + 0.3 * Math.sin(t * Math.PI * 2)), pressure: 0.2 + 0.7 * Math.sin(t * Math.PI) }),
        { durationMs: 500 },
      );
    case "tilt-sweep":
      return parametricStroke(
        (t) => ({ x: SIZE * (0.1 + 0.8 * t), y: SIZE * (0.3 + 0.4 * t), pressure: 0.6, tiltXDeg: -60 + 120 * t, tiltYDeg: 20 }),
        { durationMs: 500 },
      );
  }
}

function backdrop(...docs: Float32Array[]): void {
  for (const doc of docs) {
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const o = (y * SIZE + x) * 4;
        doc[o] = x / SIZE;
        doc[o + 1] = 0.5;
        doc[o + 2] = 1 - x / SIZE;
        doc[o + 3] = 1;
      }
    }
  }
}

function drawStroke(surface: Surface, program: BrushProgram, samples: readonly RawSample[], seed: number): number {
  surface.beginStroke(program, seed);
  const pipeline = new StrokePipeline(program, seed, undefined, surface.paperField());
  let dabs = 0;
  for (const frame of splitFrames(samples)) {
    const batch = pipeline.push(frame);
    dabs += batch.count;
    surface.addDabs(batch);
  }
  const tail = pipeline.finish();
  dabs += tail.count;
  surface.addDabs(tail);
  surface.endStroke();
  return dabs;
}

interface Pair {
  cpu: Float32Array;
  wasm: Float32Array;
  dabs: number;
  wetPresent: boolean;
}

function runPair(program: BrushProgram, fixtureId: FixtureId = "zigzag"): Pair {
  const cpu = new Surface(SIZE, SIZE);
  const wasm = new WasmSurface(kernel, SIZE, SIZE);
  // smudge·eraser는 빈 문서에서는 아무것도 보이지 않으므로 같은 배경을 깐다.
  if (program.family === "smudge" || program.family === "eraser") backdrop(cpu.document, wasm.document);
  const samples = strokeFor(fixtureId);
  const dabs = drawStroke(cpu, program, samples, 5);
  drawStroke(wasm, program, samples, 5);
  const out: Pair = { cpu: cpu.toLinear(), wasm: wasm.toLinear(), dabs, wetPresent: cpu.wet !== null };
  wasm.dispose();
  return out;
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return worst;
}

function inkOf(linear: Float32Array): number {
  let ink = 0;
  for (let i = 3; i < linear.length; i += 4) ink += linear[i] ?? 0;
  return ink;
}

describe("WasmSurface ↔ CPU 참조 Surface", () => {
  it("Surface를 상속하고 획 레이어만 wasm으로 바꾼다(문서·습식·합성 의미를 복제하지 않는다)", () => {
    const wasm = new WasmSurface(kernel, SIZE, SIZE);
    expect(wasm).toBeInstanceOf(Surface);
    expect(wasm.width).toBe(SIZE);
    expect(wasm.tilesX).toBe(4);
    wasm.dispose();
  });

  it("카탈로그의 모든 프리셋(임파스토 포함)에서 표시 문서가 일치한다(최대 절대 오차 ≤ 2e-6, 그림이 비어 있지 않다)", () => {
    expect(PRESET_CATALOG.length).toBeGreaterThanOrEqual(25);
    const exact: string[] = [];
    for (const program of PRESET_CATALOG) {
      const { cpu, wasm, dabs } = runPair(program);
      expect(dabs, program.id).toBeGreaterThan(0);
      const diff = maxAbsDiff(cpu, wasm);
      expect(diff, program.id).toBeLessThanOrEqual(2e-6);
      if (program.family !== "eraser" && program.family !== "smudge") expect(inkOf(cpu), program.id).toBeGreaterThan(0);
      if (diff === 0) exact.push(program.id);
    }
    // 정수·다항식·sqrt 경로 프리셋은 비트 동일이다(pow/exp/log2 경로만 f32 1 ulp 어긋날 수 있다).
    expect(exact.length).toBeGreaterThanOrEqual(Math.floor(PRESET_CATALOG.length * 0.6));
    for (const id of ["pencil-hb", "ink-g-pen", "marker-alcohol", "eraser-hard"]) expect(exact, id).toContain(id);
  }, 120_000);

  it("smudge: 호스트가 계산한 운반 색을 커널이 쓴다(배경 위에서 CPU와 같다)", () => {
    const { cpu, wasm } = runPair(presetById("smudge-blend"), "curve");
    expect(maxAbsDiff(cpu, wasm)).toBeLessThanOrEqual(2e-6);
  });

  it("wet-flow: 습식 풀 투입·stepWet·표시 시점 합성이 CPU와 같다", () => {
    const { cpu, wasm, wetPresent } = runPair(presetById("watercolor-wet"));
    expect(wetPresent).toBe(true);
    expect(maxAbsDiff(cpu, wasm)).toBeLessThanOrEqual(2e-6);
  }, 60_000);

  it("임파스토: 유화 물감 층(색·부피·밀기)·릴리프가 CPU와 비트 동일하다(타일 래스터에서 임파스토 dab를 건너뛰고 TS 패스를 쓴다)", () => {
    for (const fixture of ["zigzag", "line", "curve"] as const) {
      const { cpu, wasm, wetPresent } = runPair(presetById("oil-impasto"), fixture);
      expect(wetPresent, fixture).toBe(true);
      expect(inkOf(cpu), fixture).toBeGreaterThan(0);
      expect(maxAbsDiff(cpu, wasm), fixture).toBe(0);
    }
  }, 60_000);

  it("습식 층이 쌓인 채 같은 매체의 다음 획과 상호작용하고(재습윤·밀기), 플래튼 뒤에도 CPU와 같다", () => {
    for (const id of ["watercolor-wet", "oil-impasto"]) {
      const program = presetById(id);
      const cpu = new Surface(SIZE, SIZE);
      const wasm = new WasmSurface(kernel, SIZE, SIZE);
      drawStroke(cpu, program, strokeFor("zigzag"), 3);
      drawStroke(wasm, program, strokeFor("zigzag"), 3);
      // 두 번째 획은 첫 획의 습식 층 위를 지난다.
      drawStroke(cpu, program, strokeFor("line"), 4);
      drawStroke(wasm, program, strokeFor("line"), 4);
      expect(maxAbsDiff(cpu.toLinear(), wasm.toLinear()), `${id} 다중 획`).toBeLessThanOrEqual(2e-6);
      cpu.flattenWet();
      wasm.flattenWet();
      expect(maxAbsDiff(cpu.toLinear(), wasm.toLinear()), `${id} 플래튼`).toBeLessThanOrEqual(2e-6);
      // 다른 매체(건식) 획이 시작되면 두 표면 모두 습식 층을 먼저 굽고 같은 결과를 낸다.
      drawStroke(cpu, presetById("pencil-hb"), strokeFor("corner"), 6);
      drawStroke(wasm, presetById("pencil-hb"), strokeFor("corner"), 6);
      expect(maxAbsDiff(cpu.toLinear(), wasm.toLinear()), `${id} 건식 후속`).toBeLessThanOrEqual(2e-6);
      wasm.dispose();
    }
  }, 60_000);

  it("dispose 뒤 beginStroke·addDabs는 InvalidStateError이고 dispose는 멱등이다", () => {
    const surface = new WasmSurface(kernel, 32, 32);
    surface.dispose();
    surface.dispose();
    expect(() => surface.beginStroke(presetById("pencil-hb"), 1)).toThrow(InvalidStateError);
  });

  it("획 풀 용량 초과는 CPU 참조와 같이 StrokeBudgetExceededError", () => {
    const program = presetById("pencil-hb");
    const surface = new WasmSurface(kernel, 128, 128, { strokeCapacityTiles: 2 });
    surface.beginStroke(program, 1);
    const pipeline = new StrokePipeline(program, 1, undefined, surface.paperField());
    const samples = lineStroke(10, 64, 118, 64, 0.6, { durationMs: 300 });
    expect(() => {
      for (const frame of splitFrames(samples)) surface.addDabs(pipeline.push(frame));
      surface.addDabs(pipeline.finish());
    }).toThrow(StrokeBudgetExceededError);
    surface.dispose();
  });

  it("팁 아틀라스 평탄화: 레벨 L은 n×8n 행 우선이고 종류 k는 열 오프셋 k·n이다(커널 규약)", () => {
    const chains = {} as Record<TipKind, TipMask[]>;
    for (const kind of TIP_KINDS_ORDERED) chains[kind] = tipChainFor(kind, 3, { hardness: 0.7, aspect: 1 });
    const flat = flattenTipAtlas(chains, 64, 7);
    expect(flat.length).toBe(tipAtlasFloats(64, 7));
    // 레벨 0(64): (kind 2, x 10, y 20)
    expect(flat[20 * (64 * 8) + 2 * 64 + 10]).toBe(chains["bristle-strands"][0]?.data[20 * 64 + 10]);
    // 레벨 1(32)은 레벨 0 뒤에 이어진다: 오프셋 = 64·(8·64)
    const level1 = 64 * (8 * 64);
    expect(flat[level1 + 4 * (32 * 8) + 1 * 32 + 3]).toBe(chains.flat[1]?.data[4 * 32 + 3]);
  });
});
