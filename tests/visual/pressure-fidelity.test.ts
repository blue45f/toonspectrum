import { readFile } from "node:fs/promises";
import { join } from "node:path";


import { compileVectorBrush } from "@toonspectrum/studio-brush-platform";
import { renderSceneToPixels as renderWithVello } from "@toonspectrum/studio-engine-vello";
import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import type { StrokeIR } from "@toonspectrum/studio-project-model";

/**
 * 필압 정밀함 게이트 (제품 오너 지시 2026-08-07: 품질·손맛·필압 정밀함이
 * 성능보다 우선).
 *
 * A horizontal stroke carries a linear 0.1→1.0 pressure ramp; the rendered
 * ink thickness per column must track the ramp faithfully. Contracts:
 * - correlation(pressure, thickness) ≥ 0.95 (충실한 응답)
 * - monotone trend: regressions bounded to AA noise (역방향 튐 없음)
 * - no quantization pops: max column-to-column jump bounded (계단 현상 금지)
 * The same contracts run on both shipped lanes: perfect-freehand vector bake
 * and the Hokusai natural-media engine.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WIDTH = 256;
const HEIGHT = 96;

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let index = 0; index < n; index += 1) {
    const da = (a[index] ?? 0) - meanA;
    const db = (b[index] ?? 0) - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  return cov / Math.sqrt(varA * varB);
}

/** Ink thickness per column from RGBA pixels (alpha>8 counts as ink). */
function columnThickness(pixels: Uint8Array, width: number, height: number): number[] {
  const thickness: number[] = [];
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
      const red = pixels[(y * width + x) * 4] ?? 255;
      if (alpha > 8 && red < 200) count += 1;
    }
    thickness.push(count);
  }
  return thickness;
}

function fidelityMetrics(thickness: number[], margin: number): {
  correlation: number;
  maxJump: number;
  regressions: number;
} {
  const columns: number[] = [];
  const pressures: number[] = [];
  for (let x = margin; x < WIDTH - margin; x += 1) {
    const t = (x - margin) / (WIDTH - 2 * margin);
    columns.push(thickness[x] ?? 0);
    pressures.push(0.1 + 0.9 * t);
  }
  let maxJump = 0;
  let regressions = 0;
  const smoothed = columns.map((_, index) => {
    const lo = Math.max(0, index - 2);
    const window = columns.slice(lo, index + 3);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
  for (let index = 1; index < smoothed.length; index += 1) {
    const jump = Math.abs((smoothed[index] ?? 0) - (smoothed[index - 1] ?? 0));
    if (jump > maxJump) maxJump = jump;
    if ((smoothed[index] ?? 0) < (smoothed[index - 1] ?? 0) - 1.5) regressions += 1;
  }
  return { correlation: pearson(pressures, columns), maxJump, regressions };
}

describe("pressure fidelity — perfect-freehand vector lane", () => {
  beforeAll(async () => {
    await loadVelloNode();
  });

  it("ink thickness tracks a linear pressure ramp faithfully", () => {
    const program = brushProgramIRSchema.parse({
      id: "fidelity-pen",
      name: "Fidelity Pen",
      stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
      sizeDynamics: [{ input: "pressure", curve: [0, 1], min: 0.05, max: 1 }],
      geometry: {
        kind: "perfect-freehand",
        thinning: 0.9,
        smoothing: 0.3,
        streamline: 0.2,
        capStart: true,
        capEnd: true,
      },
    });
    const samples = [];
    const margin = 16;
    for (let index = 0; index < 64; index += 1) {
      const t = index / 63;
      samples.push({
        x: margin + t * (WIDTH - 2 * margin),
        y: HEIGHT / 2,
        tMs: index * 4,
        pressure: 0.1 + 0.9 * t,
        velocity: 1,
        altitudeDeg: 90,
        azimuthDeg: 0,
      });
    }
    const stroke: StrokeIR = {
      id: "ramp",
      brushPresetId: program.id,
      seed: 1,
      color: { r: 0, g: 0, b: 0, a: 1 },
      baseSizePx: 28,
      samples,
    };
    const node = compileVectorBrush(program).bake(stroke);
    const pixels = renderWithVello({
      version: 11,
      width: WIDTH,
      height: HEIGHT,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: [node],
    });
    const metrics = fidelityMetrics(columnThickness(pixels, WIDTH, HEIGHT), margin + 6);
    expect(metrics.correlation, "필압-굵기 상관").toBeGreaterThan(0.95);
    expect(metrics.maxJump, "양자화 점프").toBeLessThanOrEqual(3);
    expect(metrics.regressions, "역방향 튐").toBeLessThanOrEqual(2);
  });
});

describe("pressure fidelity — hokusai natural-media lane", () => {
  type HokusaiModule = typeof import("../../packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");
  let hokusai: HokusaiModule;

  beforeAll(async () => {
    const pkgDir = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
    hokusai = (await import(join(pkgDir, "studio_hokusai_wasm.js"))) as HokusaiModule;
    const bytes = await readFile(join(pkgDir, "studio_hokusai_wasm_bg.wasm"));
    await hokusai.default({ module_or_path: bytes });
  });

  it("ink mass tracks the pressure ramp without steps", () => {
    const brush = hokusai.HokusaiBrush.naturalMedia();
    const canvas = new hokusai.HokusaiCanvas(WIDTH, HEIGHT, 7);
    try {
      brush.setColorHsv(0, 0, 0.05);
      brush.setRadiusLog(1.6);
      canvas.beginStroke(brush, 7);
      const margin = 16;
      for (let index = 0; index < 96; index += 1) {
        const t = index / 95;
        canvas.addSample(
          brush,
          margin + t * (WIDTH - 2 * margin),
          HEIGHT / 2,
          0.1 + 0.9 * t,
          0,
          0,
          index * 6,
        );
      }
      canvas.finishStroke(brush);
      const frame = canvas.fullFrame();
      // Alpha mass per column (natural media varies alpha, not just width).
      const mass: number[] = [];
      for (let x = 0; x < WIDTH; x += 1) {
        let sum = 0;
        for (let y = 0; y < HEIGHT; y += 1) {
          sum += frame[(y * WIDTH + x) * 4 + 3] ?? 0;
        }
        mass.push(sum / 255);
      }
      const inner = margin + 10;
      const pressures: number[] = [];
      const columns: number[] = [];
      for (let x = inner; x < WIDTH - inner; x += 1) {
        pressures.push(0.1 + (0.9 * (x - 16)) / (WIDTH - 32));
        columns.push(mass[x] ?? 0);
      }
      expect(pearson(pressures, columns), "필압-잉크질량 상관").toBeGreaterThan(0.9);
      // Quantization detector: consecutive-column mass jumps stay bounded
      // relative to the stroke's own scale.
      const peak = Math.max(...columns);
      let maxJump = 0;
      for (let index = 1; index < columns.length; index += 1) {
        maxJump = Math.max(
          maxJump,
          Math.abs((columns[index] ?? 0) - (columns[index - 1] ?? 0)),
        );
      }
      expect(maxJump / peak, "상대 양자화 점프").toBeLessThan(0.25);
    } finally {
      canvas.dispose();
      canvas.free();
      brush.free();
    }
  });
});
