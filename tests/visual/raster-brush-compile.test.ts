import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  compileRasterBrush,
  renderCompiledBrushStroke,
  standardZigzagStrokeSamples,
} from "@toonspectrum/studio-brush-platform";
import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  CompiledRasterBrush,
  HokusaiModuleLike,
} from "@toonspectrum/studio-brush-platform";
import type { BrushProgramIR } from "@toonspectrum/studio-project-model";

/**
 * V12 natural-media lane gate: MYB (BrushProgramIR) → Hokusai raster compile
 * bridge. Follows the hokusai-fidelity harness contracts — full-frame sha256
 * goldens, bit determinism, REGEN_V11_GOLDENS=1 regen — and adds the
 * pressure-fidelity gate (품질·손맛·필압 > 성능): the compiled brush must
 * preserve a linear pressure ramp as a monotone, highly correlated ink-mass
 * profile along the standard zigzag stroke.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const PKG_DIR = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
const MYB_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "myb");
const GOLDEN_PATH = join(
  REPO_ROOT,
  "tests",
  "corpus",
  "brushes",
  "raster-compile-goldens.json",
);
const REGEN = process.env.REGEN_V11_GOLDENS === "1";

const WIDTH = 192;
const HEIGHT = 96;
const SAMPLE_COUNT = 96;

interface CorpusBrush {
  id: string;
  file: string;
  seed: number;
}

const CORPUS: CorpusBrush[] = [
  { id: "wash-soft", file: "wash-soft.myb", seed: 5 },
  { id: "ink-crisp", file: "ink-crisp.myb", seed: 11 },
];

let hokusai: HokusaiModuleLike;
const mybBytes = new Map<string, Uint8Array>();

beforeAll(async () => {
  const loaded = await import(join(PKG_DIR, "studio_hokusai_wasm.js"));
  const wasmBytes = await readFile(join(PKG_DIR, "studio_hokusai_wasm_bg.wasm"));
  await loaded.default({ module_or_path: wasmBytes });
  hokusai = loaded as unknown as HokusaiModuleLike;
  for (const brush of CORPUS) {
    mybBytes.set(brush.id, new Uint8Array(await readFile(join(MYB_DIR, brush.file))));
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function programFromMybBytes(id: string, bytes: Uint8Array): BrushProgramIR {
  return brushProgramIRSchema.parse({
    id,
    name: id,
    output: { target: "raster-tiles", bake: "flatten" },
    providerPreference: ["hokusai-natural-media"],
    sourcePayload: {
      format: "myb-v3",
      base64: Buffer.from(bytes).toString("base64"),
    },
  });
}

function corpusProgram(id: string): BrushProgramIR {
  const bytes = mybBytes.get(id);
  if (!bytes) throw new Error(`corpus brush ${id} not loaded`);
  return programFromMybBytes(id, bytes);
}

function mutatedProgram(
  id: string,
  baseId: string,
  mutate: (doc: {
    settings: Record<string, { base_value: number }>;
  }) => void,
): BrushProgramIR {
  const bytes = mybBytes.get(baseId);
  if (!bytes) throw new Error(`corpus brush ${baseId} not loaded`);
  const document = JSON.parse(new TextDecoder().decode(bytes)) as {
    settings: Record<string, { base_value: number }>;
  };
  mutate(document);
  return programFromMybBytes(id, new TextEncoder().encode(JSON.stringify(document)));
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function renderCorpus(brush: CorpusBrush, compiled: CompiledRasterBrush): {
  frameSha256: string;
  inkedPixels: number;
  frame: Uint8Array;
} {
  const { frame } = renderCompiledBrushStroke(hokusai, compiled, {
    width: WIDTH,
    height: HEIGHT,
    seed: brush.seed,
    sampleCount: SAMPLE_COUNT,
  });
  let inkedPixels = 0;
  for (let offset = 3; offset < frame.length; offset += 4) {
    if ((frame[offset] ?? 0) > 0) inkedPixels += 1;
  }
  return { frameSha256: sha256(frame), inkedPixels, frame };
}

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

/**
 * Per-column dab coverage (ink area, alpha > 8) and alpha mass along the
 * stroke direction. Area is the primary fidelity signal — natural media
 * responds exponentially in alpha, which linear Pearson would misread as
 * infidelity; coverage tracks the ramp directly. Mass backs the
 * quantization-jump bound (pressure-fidelity 패턴 준용).
 */
function columnProfiles(frame: Uint8Array): { area: number[]; mass: number[] } {
  const area: number[] = [];
  const mass: number[] = [];
  for (let x = 0; x < WIDTH; x += 1) {
    let count = 0;
    let sum = 0;
    for (let y = 0; y < HEIGHT; y += 1) {
      const alpha = frame[(y * WIDTH + x) * 4 + 3] ?? 0;
      sum += alpha;
      if (alpha > 8) count += 1;
    }
    area.push(count);
    mass.push(sum / 255);
  }
  return { area, mass };
}

describe("raster brush compile bridge — MYB → Hokusai", () => {
  it("compiles the corpus fully mapped, deterministically, without console noise", () => {
    const warn = vi.spyOn(console, "warn");
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    for (const brush of CORPUS) {
      const first = compileRasterBrush(corpusProgram(brush.id));
      const second = compileRasterBrush(corpusProgram(brush.id));
      expect(first.mybJson, `${brush.id} compile determinism`).toBe(second.mybJson);
      expect(first.unmapped, `${brush.id} fully mapped corpus`).toEqual([]);
      expect(first.warnings, `${brush.id} no inert dimensions`).toEqual([]);
    }
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("same MYB → same compile → same fullFrame sha256, matching goldens", async () => {
    const current = CORPUS.map((brush) => {
      const compiled = compileRasterBrush(corpusProgram(brush.id));
      const first = renderCorpus(brush, compiled);
      const second = renderCorpus(brush, compileRasterBrush(corpusProgram(brush.id)));
      expect(second.frameSha256, `${brush.id} render determinism`).toBe(
        first.frameSha256,
      );
      expect(first.inkedPixels, `${brush.id} ink coverage`).toBeGreaterThan(200);
      return {
        id: brush.id,
        seed: brush.seed,
        mybSha256: sha256(compiled.mybJson),
        frameSha256: first.frameSha256,
        inkedPixels: first.inkedPixels,
        unmapped: compiled.unmapped,
        warnings: compiled.warnings,
      };
    });

    if (REGEN) {
      await mkdir(join(REPO_ROOT, "tests", "corpus", "brushes"), { recursive: true });
      await writeFile(
        GOLDEN_PATH,
        `${JSON.stringify(
          {
            harness: "tests/visual/raster-brush-compile.test.ts",
            engine:
              "compileRasterBrush → studio-hokusai-wasm (hokusai 0.3.0 pinned, packed transparent RGBA8)",
            canvas: { width: WIDTH, height: HEIGHT, samples: SAMPLE_COUNT },
            path: "standardZigzagStrokeSamples (linear 0→1 pressure ramp)",
            variants: current,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8")) as {
      variants: Array<{
        id: string;
        mybSha256: string;
        frameSha256: string;
        inkedPixels: number;
      }>;
    };
    expect(golden.variants).toHaveLength(current.length);
    for (const [index, variant] of current.entries()) {
      expect(variant.mybSha256, `${variant.id} compile golden`).toBe(
        golden.variants[index]?.mybSha256,
      );
      expect(variant.frameSha256, `${variant.id} frame golden`).toBe(
        golden.variants[index]?.frameSha256,
      );
      expect(variant.inkedPixels, `${variant.id} coverage golden`).toBe(
        golden.variants[index]?.inkedPixels,
      );
    }
  });

  it("radius and opacity variants compile to distinct pixel identities", () => {
    const base = renderCorpus(
      CORPUS[0]!,
      compileRasterBrush(corpusProgram("wash-soft")),
    );
    const wider = renderCorpus(
      CORPUS[0]!,
      compileRasterBrush(
        mutatedProgram("wash-soft-wider", "wash-soft", (document) => {
          document.settings["radius_logarithmic"]!.base_value += 0.6;
        }),
      ),
    );
    const fainter = renderCorpus(
      CORPUS[0]!,
      compileRasterBrush(
        mutatedProgram("wash-soft-fainter", "wash-soft", (document) => {
          document.settings["opaque"]!.base_value = 0.25;
        }),
      ),
    );
    expect(wider.frameSha256, "radius variant").not.toBe(base.frameSha256);
    expect(fainter.frameSha256, "opacity variant").not.toBe(base.frameSha256);
    expect(wider.frameSha256, "variants differ from each other").not.toBe(
      fainter.frameSha256,
    );
  });

  it.each(CORPUS.map((brush) => [brush.id, brush] as const))(
    "필압 충실도 게이트 — %s: ramp stroke ink mass is monotone and correlated",
    (_id, brush) => {
      const compiled = compileRasterBrush(corpusProgram(brush.id));
      const samples = standardZigzagStrokeSamples(WIDTH, HEIGHT, SAMPLE_COUNT);
      // Contract precondition: the standard path really is a linear 0→1 ramp.
      expect(samples[0]?.pressure).toBe(0);
      expect(samples.at(-1)?.pressure).toBe(1);
      const { frame } = renderCompiledBrushStroke(hokusai, compiled, {
        width: WIDTH,
        height: HEIGHT,
        seed: brush.seed,
        samples,
      });
      const { area, mass } = columnProfiles(frame);
      const margin = 16;
      const inner = margin + 10;
      const pressures: number[] = [];
      const areaColumns: number[] = [];
      const massColumns: number[] = [];
      for (let x = inner; x < WIDTH - inner; x += 1) {
        pressures.push((x - margin) / (WIDTH - 2 * margin));
        areaColumns.push(area[x] ?? 0);
        massColumns.push(mass[x] ?? 0);
      }

      // Primary gate: dab coverage (ink-area profile) tracks the ramp.
      const areaCorrelation = pearson(pressures, areaColumns);
      expect(areaCorrelation, `${brush.id} 필압-잉크면적 상관`).toBeGreaterThan(0.9);
      // Supporting signal: alpha mass must also correlate strongly (it is
      // legitimately convex for natural media, hence the softer bound).
      expect(
        pearson(pressures, massColumns),
        `${brush.id} 필압-잉크질량 상관`,
      ).toBeGreaterThan(0.85);

      // Monotone trend: bucketed coverage means along stroke progress must
      // not regress beyond noise (zigzag turnarounds + seeded dab jitter).
      const buckets = 8;
      const areaPeak = Math.max(...areaColumns);
      const bucketMeans: number[] = [];
      const perBucket = Math.floor(areaColumns.length / buckets);
      for (let bucket = 0; bucket < buckets; bucket += 1) {
        const slice = areaColumns.slice(bucket * perBucket, (bucket + 1) * perBucket);
        bucketMeans.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      for (let bucket = 1; bucket < buckets; bucket += 1) {
        expect(
          bucketMeans[bucket]!,
          `${brush.id} 단조 증가 (bucket ${bucket})`,
        ).toBeGreaterThanOrEqual(bucketMeans[bucket - 1]! - areaPeak * 0.05);
      }
      expect(bucketMeans.at(-1)!, `${brush.id} ramp gain`).toBeGreaterThan(
        (bucketMeans[0] ?? 0) * 2,
      );

      // Quantization detector (pressure-fidelity 패턴 준용): consecutive
      // column mass jumps stay bounded relative to the stroke's own scale.
      const massPeak = Math.max(...massColumns);
      let maxJump = 0;
      for (let index = 1; index < massColumns.length; index += 1) {
        maxJump = Math.max(
          maxJump,
          Math.abs((massColumns[index] ?? 0) - (massColumns[index - 1] ?? 0)),
        );
      }
      expect(maxJump / massPeak, `${brush.id} 상대 양자화 점프`).toBeLessThan(0.25);
    },
  );

  it("unmapped MYB dimensions all land in the list — never console, never dropped", () => {
    const warn = vi.spyOn(console, "warn");
    const log = vi.spyOn(console, "log");
    const exotic = {
      version: 3,
      settings: {
        opaque: {
          base_value: 0.7,
          inputs: {
            pressure: [
              [0, 0],
              [1, 0.2],
            ],
            future_wetness_input: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        radius_logarithmic: { base_value: 2.0 },
        restore_color: { base_value: 1.0 },
        future_fiber_scatter: {
          base_value: 0.4,
          inputs: {
            pressure: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        elliptical_dab_angle: {
          base_value: 12,
          inputs: {
            barrel_rotation: [
              [0, -30],
              [1, 30],
            ],
          },
        },
      },
    };
    const program = programFromMybBytes(
      "exotic",
      new TextEncoder().encode(JSON.stringify(exotic)),
    );
    const compiled = compileRasterBrush(program);

    expect(compiled.unmapped).toEqual([
      "future_fiber_scatter",
      "future_fiber_scatter.inputs.pressure",
      "opaque.inputs.future_wetness_input",
    ]);
    expect(
      compiled.warnings.some((warning) => warning.includes("restore_color")),
      "inert setting surfaced",
    ).toBe(true);
    expect(
      compiled.warnings.some((warning) => warning.includes("barrel_rotation")),
      "undriven input surfaced",
    ).toBe(true);
    // Unmapped dimensions are excluded from what the engine receives …
    expect(compiled.mybJson).not.toContain("future_fiber_scatter");
    expect(compiled.mybJson).not.toContain("future_wetness_input");
    // … yet nothing left through the console, and the source payload
    // (zero-silent-loss contract) still carries the originals.
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(program.sourcePayload?.base64).toBeTruthy();
    // The compiled JSON is accepted verbatim by the wasm brush parser.
    const brush = new hokusai.HokusaiBrush(compiled.mybJson);
    brush.free();
  });
});
