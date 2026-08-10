import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  compileRasterBrush,
  renderCompiledBrushStroke,
  type HokusaiModuleLike,
  type RasterStrokeSample,
} from "@toonspectrum/studio-brush-platform";
import { beforeAll, describe, expect, it } from "vitest";

import { importCspToolFile } from "../../packages/studio-format-gateway/src/csp-sut";
import { importKritaBundle } from "../../packages/studio-format-gateway/src/krita-bundle";
import {
  buildAuthoredSutFixture,
  readAuthoredSutWithNodeSqlite,
} from "../corpus/formats/csp-sut-fixtures";
import {
  buildKritaBundleFixture,
  inflateFixtureRaw,
} from "../corpus/formats/krita-bundle-fixtures";

import fidelityGolden from "./results/external-brush-fidelity.json";

const REPO_ROOT = join(__dirname, "..", "..");
const HOKUSAI_PKG = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
const WIDTH = 192;
const HEIGHT = 96;

let hokusai: HokusaiModuleLike;

beforeAll(async () => {
  const module = await import(join(HOKUSAI_PKG, "studio_hokusai_wasm.js"));
  const wasm = await readFile(join(HOKUSAI_PKG, "studio_hokusai_wasm_bg.wasm"));
  await module.default({ module_or_path: wasm });
  hokusai = module as unknown as HokusaiModuleLike;
});

function lineSamples(pressure: number): RasterStrokeSample[] {
  return Array.from({ length: 72 }, (_, index) => {
    const t = index / 71;
    return {
      x: 18 + t * (WIDTH - 36),
      y: HEIGHT / 2,
      pressure,
      tiltX: 0,
      tiltY: 0,
      tMs: index * 6,
    };
  });
}

function frameMass(frame: Uint8Array): number {
  let mass = 0;
  for (let offset = 3; offset < frame.byteLength; offset += 4) mass += frame[offset] ?? 0;
  return mass;
}

function sha256(frame: Uint8Array): string {
  return createHash("sha256").update(frame).digest("hex");
}

function pearson(left: number[], right: number[]): number {
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = (left[index] ?? 0) - meanLeft;
    const b = (right[index] ?? 0) - meanRight;
    covariance += a * b;
    varianceLeft += a * a;
    varianceRight += b * b;
  }
  return covariance / Math.sqrt(varianceLeft * varianceRight);
}

describe("external brush formats → BrushProgramIR → Hokusai", () => {
  it("renders a partially decoded SUT deterministically with monotone pressure response", async () => {
    const imported = await importCspToolFile(buildAuthoredSutFixture(), {
      kind: "sut",
      sqliteReader: readAuthoredSutWithNodeSqlite,
    });
    const program = imported.programs[0];
    expect(program).toBeDefined();
    const compiled = compileRasterBrush(program!);
    expect(
      compiled.unmapped.some((item) => /^flowDynamics\[\d+\]\.input=constant$/u.test(item)),
    ).toBe(true);
    expect(
      compiled.unmapped.some((item) => /^sizeDynamics\[\d+\]\.input=constant$/u.test(item)),
    ).toBe(true);
    expect(compiled.warnings).toContain(
      "sourcePayload.format=csp-sut is not myb-v3; compiled from IR graphs instead",
    );

    const pressures = [0.2, 0.4, 0.6, 0.8, 1];
    const rendered = pressures.map((pressure) => {
      const first = renderCompiledBrushStroke(hokusai, compiled, {
        width: WIDTH,
        height: HEIGHT,
        seed: 41,
        samples: lineSamples(pressure),
        radiusLog2: 2.8,
      }).frame;
      const second = renderCompiledBrushStroke(hokusai, compiled, {
        width: WIDTH,
        height: HEIGHT,
        seed: 41,
        samples: lineSamples(pressure),
        radiusLog2: 2.8,
      }).frame;
      expect(sha256(second)).toBe(sha256(first));
      return { mass: frameMass(first), sha256: sha256(first) };
    });
    const masses = rendered.map((frame) => frame.mass);
    expect(masses).toEqual(fidelityGolden.sut.frames.map((frame) => frame.alphaMass));
    expect(rendered.map((frame) => frame.sha256))
      .toEqual(fidelityGolden.sut.frames.map((frame) => frame.sha256));
    for (let index = 1; index < masses.length; index += 1) {
      expect(masses[index]).toBeGreaterThan(masses[index - 1] ?? 0);
    }
    expect(pearson(pressures, masses)).toBeGreaterThan(0.9);
    expect(masses.at(-1) ?? 0).toBeGreaterThan((masses[0] ?? 0) * 1.5);
  });

  it("renders a KPP reached through a deflated Krita bundle without changing its program", async () => {
    const bundle = await importKritaBundle(buildKritaBundleFixture({ compression: "deflate" }), {
      inflateRaw: inflateFixtureRaw,
    });
    const brush = bundle.brushes.find((candidate) => candidate.path.endsWith("pressure.kpp"));
    expect(brush).toBeDefined();
    const compiled = compileRasterBrush(brush!.program);
    const first = renderCompiledBrushStroke(hokusai, compiled, {
      width: WIDTH,
      height: HEIGHT,
      seed: 53,
      sampleCount: 96,
      radiusLog2: 2.5,
    }).frame;
    const second = renderCompiledBrushStroke(hokusai, compileRasterBrush(brush!.program), {
      width: WIDTH,
      height: HEIGHT,
      seed: 53,
      sampleCount: 96,
      radiusLog2: 2.5,
    }).frame;
    expect(sha256(second)).toBe(sha256(first));
    expect(frameMass(first)).toBe(fidelityGolden.kritaBundleKpp.frame.alphaMass);
    expect(sha256(first)).toBe(fidelityGolden.kritaBundleKpp.frame.sha256);
  });
});
