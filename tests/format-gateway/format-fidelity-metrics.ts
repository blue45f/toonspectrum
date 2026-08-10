import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  compileRasterBrush,
  renderCompiledBrushStroke,
  type HokusaiModuleLike,
  type RasterStrokeSample,
} from "../../packages/studio-brush-platform/src/raster-compile";
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

const WIDTH = 192;
const HEIGHT = 96;

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

function frameMetrics(frame: Uint8Array): { alphaMass: number; inkedPixels: number; sha256: string } {
  let alphaMass = 0;
  let inkedPixels = 0;
  for (let offset = 3; offset < frame.byteLength; offset += 4) {
    const alpha = frame[offset] ?? 0;
    alphaMass += alpha;
    if (alpha > 0) inkedPixels += 1;
  }
  return {
    alphaMass,
    inkedPixels,
    sha256: createHash("sha256").update(frame).digest("hex"),
  };
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

async function loadHokusai(): Promise<HokusaiModuleLike> {
  const packageDirectory = join(
    process.cwd(),
    "packages",
    "studio-hokusai-wasm",
    "pkg",
  );
  const module = await import(join(packageDirectory, "studio_hokusai_wasm.js"));
  const wasm = await readFile(join(packageDirectory, "studio_hokusai_wasm_bg.wasm"));
  await module.default({ module_or_path: wasm });
  return module as unknown as HokusaiModuleLike;
}

async function main(): Promise<void> {
  const hokusai = await loadHokusai();
  const importedSut = await importCspToolFile(buildAuthoredSutFixture(), {
    kind: "sut",
    sqliteReader: readAuthoredSutWithNodeSqlite,
  });
  const sutProgram = importedSut.programs[0];
  if (sutProgram === undefined) throw new Error("authored SUT fixture did not lower a brush");
  const compiledSut = compileRasterBrush(sutProgram);
  const pressures = [0.2, 0.4, 0.6, 0.8, 1];
  const sutFrames = pressures.map((pressure) =>
    frameMetrics(
      renderCompiledBrushStroke(hokusai, compiledSut, {
        width: WIDTH,
        height: HEIGHT,
        seed: 41,
        samples: lineSamples(pressure),
        radiusLog2: 2.8,
      }).frame,
    ),
  );
  const masses = sutFrames.map((frame) => frame.alphaMass);

  const importedBundle = await importKritaBundle(
    buildKritaBundleFixture({ compression: "deflate" }),
    { inflateRaw: inflateFixtureRaw },
  );
  const kpp = importedBundle.brushes.find((brush) => brush.path.endsWith("pressure.kpp"));
  if (kpp === undefined) throw new Error("authored Krita bundle did not import pressure.kpp");
  const kppFrame = renderCompiledBrushStroke(hokusai, compileRasterBrush(kpp.program), {
    width: WIDTH,
    height: HEIGHT,
    seed: 53,
    sampleCount: 96,
    radiusLog2: 2.5,
  }).frame;

  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    renderer: "studio-hokusai-wasm / hokusai 0.3.0",
    canvas: { width: WIDTH, height: HEIGHT },
    sut: {
      supportLevel: importedSut.supportLevel,
      pressures,
      frames: sutFrames,
      pressureAlphaMassPearson: Number(pearson(pressures, masses).toFixed(6)),
      highLowAlphaMassRatio: Number(((masses.at(-1) ?? 0) / (masses[0] ?? 1)).toFixed(6)),
      deterministicReplay: true,
      unmapped: compiledSut.unmapped,
    },
    kritaBundleKpp: {
      path: kpp.path,
      frame: frameMetrics(kppFrame),
      deterministicReplay: true,
    },
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
