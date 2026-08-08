import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { importMybBrush } from "../../../studio-format-gateway/src/myb";
import {
  applyMybSettings,
  columnInkProfile,
  frameInkStats,
  pearsonCorrelation,
  renderLibMypaintStroke,
} from "../libmypaint";
import { loadLibMypaint } from "../libmypaint/index";
import {
  compileRasterBrush,
  renderCompiledBrushStroke,
} from "../raster-compile";

import type { LibMypaintRaw } from "../libmypaint/index";
import type { HokusaiModuleLike } from "../raster-compile";

/**
 * ADR-0011 lane 11 — MyPaint reference parity lab.
 *
 * libmypaint v1.6.1 (pinned wasm build, json-c bypassed, injection API only)
 * is the natural-media REFERENCE; Hokusai is the CHALLENGER. Both engines
 * render the same `.myb` corpus brushes over the same deterministic zigzag
 * pressure-ramp stroke, and the alpha-channel ink metrics land in
 * tests/benchmarks/results/libmypaint-parity.json.
 *
 * Deterministic fields (frame shas, ink stats, correlations) are asserted
 * against the committed measurement; throughput fields are recorded evidence
 * only (timing is machine-dependent). REGEN_LIBMYPAINT_PARITY=1 rewrites the
 * results file.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "myb");
const HOKUSAI_PKG_DIR = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
const LIBMYPAINT_DIR = join(
  REPO_ROOT,
  "packages",
  "studio-brush-platform",
  "src",
  "libmypaint",
);
const RESULTS_PATH = join(
  REPO_ROOT,
  "tests",
  "benchmarks",
  "results",
  "libmypaint-parity.json",
);
const REGEN = process.env.REGEN_LIBMYPAINT_PARITY === "1";

const WIDTH = 192;
const HEIGHT = 96;
const SAMPLE_COUNT = 96;
const SEED = 7;
const THROUGHPUT_RUNS = 12;
const THROUGHPUT_WARMUPS = 2;
const CORPUS_BRUSHES = ["wash-soft", "ink-crisp"] as const;

/**
 * Large-brush throughput lane: the matrix E11↔E12 gate talks about 1000px
 * brushes; a full 1000px dab is too heavy for a unit-test loop, so this is a
 * scaled proxy (radius_logarithmic 4.5 ≈ e^4.5 ≈ 90 px radius ≈ 180 px dab on
 * 512×256). Recorded as evidence with its scope named — not a substitute for
 * a full-size run before any final demotion decision.
 */
const LARGE = {
  width: 512,
  height: 256,
  sampleCount: 48,
  radiusLogarithmic: 4.5,
  dabDiameterPx: Math.round(2 * Math.exp(4.5)),
} as const;

type HokusaiModule = typeof import("../../../studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");

interface EngineRender {
  frame: Uint8Array;
  sha256: string;
  stats: ReturnType<typeof frameInkStats>;
  profile: number[];
}

interface BrushParityRecord {
  libmypaint: {
    sha256: string;
    totalAlpha: number;
    inkedPixels: number;
    meanInkedAlpha: number;
  };
  hokusai: {
    sha256: string;
    totalAlpha: number;
    inkedPixels: number;
    meanInkedAlpha: number;
  };
  parity: {
    columnProfileCorrelation: number;
    coverageRatio: number;
    inkedPixelRatio: number;
  };
  throughput: {
    libmypaintMsMedian: number;
    hokusaiMsMedian: number;
    libmypaintPxPerMs: number;
    hokusaiPxPerMs: number;
    hokusaiOverLibmypaint: number;
  };
  largeBrushThroughput: {
    dabDiameterPx: number;
    libmypaintMsMedian: number;
    hokusaiMsMedian: number;
    hokusaiOverLibmypaint: number;
  };
}

let lmp: LibMypaintRaw;
let hokusai: HokusaiModuleLike;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readCorpusDocument(id: (typeof CORPUS_BRUSHES)[number]) {
  const bytes = readFileSync(join(CORPUS_DIR, `${id}.myb`));
  return importMybBrush(new Uint8Array(bytes), id, id);
}

function renderLibmypaint(id: (typeof CORPUS_BRUSHES)[number]): EngineRender {
  const { document } = readCorpusDocument(id);
  const result = renderLibMypaintStroke(lmp, document, {
    width: WIDTH,
    height: HEIGHT,
    seed: SEED,
    sampleCount: SAMPLE_COUNT,
  });
  return {
    frame: result.frame,
    sha256: sha256(result.frame),
    stats: frameInkStats(result.frame),
    profile: columnInkProfile(result.frame, WIDTH, HEIGHT),
  };
}

function renderHokusai(id: (typeof CORPUS_BRUSHES)[number]): EngineRender {
  const { preset } = readCorpusDocument(id);
  const compiled = compileRasterBrush(preset);
  const result = renderCompiledBrushStroke(hokusai, compiled, {
    width: WIDTH,
    height: HEIGHT,
    seed: SEED,
    sampleCount: SAMPLE_COUNT,
  });
  return {
    frame: result.frame,
    sha256: sha256(result.frame),
    stats: frameInkStats(result.frame),
    profile: columnInkProfile(result.frame, WIDTH, HEIGHT),
  };
}

/** Same corpus document with the radius raised to the large-brush lane. */
function readLargeDocument(id: (typeof CORPUS_BRUSHES)[number]) {
  const { document } = readCorpusDocument(id);
  const radius = document.settings["radius_logarithmic"];
  return {
    ...document,
    settings: {
      ...document.settings,
      radius_logarithmic: {
        base_value: LARGE.radiusLogarithmic,
        inputs: radius?.inputs ?? {},
      },
    },
  };
}

function renderLibmypaintLarge(id: (typeof CORPUS_BRUSHES)[number]): void {
  renderLibMypaintStroke(lmp, readLargeDocument(id), {
    width: LARGE.width,
    height: LARGE.height,
    seed: SEED,
    sampleCount: LARGE.sampleCount,
  });
}

function renderHokusaiLarge(id: (typeof CORPUS_BRUSHES)[number]): void {
  // Same mutated document, re-imported so both engines see identical source.
  const bytes = new TextEncoder().encode(JSON.stringify(readLargeDocument(id)));
  const { preset } = importMybBrush(bytes, `${id}-large`, `${id}-large`);
  const compiled = compileRasterBrush(preset);
  renderCompiledBrushStroke(hokusai, compiled, {
    width: LARGE.width,
    height: LARGE.height,
    seed: SEED,
    sampleCount: LARGE.sampleCount,
  });
}

function medianMs(render: () => unknown): number {
  for (let index = 0; index < THROUGHPUT_WARMUPS; index += 1) render();
  const timings: number[] = [];
  for (let index = 0; index < THROUGHPUT_RUNS; index += 1) {
    const start = performance.now();
    render();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const middle = Math.floor(timings.length / 2);
  const median =
    timings.length % 2 === 0
      ? ((timings[middle - 1] ?? 0) + (timings[middle] ?? 0)) / 2
      : (timings[middle] ?? 0);
  return median;
}

function measureBrush(id: (typeof CORPUS_BRUSHES)[number]): BrushParityRecord {
  const libmypaintRender = renderLibmypaint(id);
  const hokusaiRender = renderHokusai(id);
  const correlation = pearsonCorrelation(
    libmypaintRender.profile,
    hokusaiRender.profile,
  );
  const libmypaintMs = medianMs(() => renderLibmypaint(id));
  const hokusaiMs = medianMs(() => renderHokusai(id));
  const largeLibmypaintMs = medianMs(() => renderLibmypaintLarge(id));
  const largeHokusaiMs = medianMs(() => renderHokusaiLarge(id));
  const pixels = WIDTH * HEIGHT;
  const libmypaintPxPerMs = pixels / libmypaintMs;
  const hokusaiPxPerMs = pixels / hokusaiMs;
  return {
    libmypaint: {
      sha256: libmypaintRender.sha256,
      totalAlpha: libmypaintRender.stats.totalAlpha,
      inkedPixels: libmypaintRender.stats.inkedPixels,
      meanInkedAlpha: libmypaintRender.stats.meanInkedAlpha,
    },
    hokusai: {
      sha256: hokusaiRender.sha256,
      totalAlpha: hokusaiRender.stats.totalAlpha,
      inkedPixels: hokusaiRender.stats.inkedPixels,
      meanInkedAlpha: hokusaiRender.stats.meanInkedAlpha,
    },
    parity: {
      columnProfileCorrelation: correlation,
      coverageRatio:
        libmypaintRender.stats.totalAlpha / hokusaiRender.stats.totalAlpha,
      inkedPixelRatio:
        libmypaintRender.stats.inkedPixels / hokusaiRender.stats.inkedPixels,
    },
    throughput: {
      libmypaintMsMedian: libmypaintMs,
      hokusaiMsMedian: hokusaiMs,
      libmypaintPxPerMs,
      hokusaiPxPerMs,
      hokusaiOverLibmypaint: hokusaiPxPerMs / libmypaintPxPerMs,
    },
    largeBrushThroughput: {
      dabDiameterPx: LARGE.dabDiameterPx,
      libmypaintMsMedian: largeLibmypaintMs,
      hokusaiMsMedian: largeHokusaiMs,
      hokusaiOverLibmypaint: largeLibmypaintMs / largeHokusaiMs,
    },
  };
}

interface ParityResults {
  generatedAt: string;
  pin: Record<string, string>;
  harness: Record<string, number | string>;
  wasmBytes: { mjs: number; wasm: number };
  brushes: Record<string, BrushParityRecord>;
  gate: {
    rule: string;
    hokusaiThroughputAdvantageMin: number;
    hokusaiPasses20pctGate: boolean;
    notes: string[];
  };
}

function loadCommittedResults(): ParityResults {
  return JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as ParityResults;
}

beforeAll(async () => {
  lmp = await loadLibMypaint();
  const hokusaiModule = (await import(
    join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm.js")
  )) as HokusaiModule;
  const wasmBytes = readFileSync(
    join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm_bg.wasm"),
  );
  await hokusaiModule.default({ module_or_path: wasmBytes });
  hokusai = hokusaiModule as unknown as HokusaiModuleLike;

  if (REGEN) {
    const brushes: Record<string, BrushParityRecord> = {};
    for (const id of CORPUS_BRUSHES) {
      brushes[id] = measureBrush(id);
    }
    const advantages = Object.values(brushes).flatMap((record) => [
      record.throughput.hokusaiOverLibmypaint,
      record.largeBrushThroughput.hokusaiOverLibmypaint,
    ]);
    const advantageMin = Math.min(...advantages);
    const results: ParityResults = {
      generatedAt: new Date().toISOString(),
      pin: {
        libmypaint: "v1.6.1 (2768251dacce3939136c839aeca413f4aa4241d0)",
        emcc: "6.0.6",
        build:
          "packages/studio-brush-platform/src/libmypaint/bridge/build.sh (json-c bypassed; injection API only)",
        hokusai: "hokusai-core 0.3.0 via packages/studio-hokusai-wasm",
      },
      harness: {
        width: WIDTH,
        height: HEIGHT,
        sampleCount: SAMPLE_COUNT,
        seed: SEED,
        stroke: "standardZigzagStrokeSamples (linear 0→1 pressure ramp)",
        throughputRuns: THROUGHPUT_RUNS,
        throughputStat: "median ms of full render (program brush + stroke + RGBA8 readback)",
      },
      wasmBytes: {
        mjs: statSync(join(LIBMYPAINT_DIR, "mypaint-wasm.mjs")).size,
        wasm: statSync(join(LIBMYPAINT_DIR, "mypaint-wasm.wasm")).size,
      },
      brushes,
      gate: {
        rule: "matrix E11↔E12: Hokusai may demote libmypaint to reference-only when quality is at parity AND Hokusai throughput ≥ 1.2× libmypaint",
        hokusaiThroughputAdvantageMin: advantageMin,
        hokusaiPasses20pctGate: advantageMin >= 1.2,
        notes: [
          "alpha channel is the cross-engine parity axis; RGB stays in each engine's native channel space (libmypaint v1 non-linear fix15 vs hokusai linear→sRGB readout)",
          "throughput numbers are from the machine that regenerated this file; deterministic fields (shas, ink stats, correlations) are asserted in CI, timing is recorded evidence only",
          "largeBrushThroughput is a 180px-dab proxy for the matrix 1000px gate (full-size run pending); the verdict takes the min advantage across standard + large lanes",
        ],
      },
    };
    writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`);
  }
}, 120_000);

describe("libmypaint wasm loader", () => {
  it("exposes the pinned engine contract", () => {
    expect(lmp.version()).toBe("libmypaint 1.6.1+2768251d (emcc)");
    // v1.6.1 API facts: 64 brush settings, 18 dynamic inputs.
    expect(lmp.settingCount()).toBe(64);
    expect(lmp.inputCount()).toBe(18);
  });

  it("resolves .myb cnames to ids and range-flags unknown names", () => {
    const radius = lmp.settingId("radius_logarithmic");
    expect(radius).toBeGreaterThanOrEqual(0);
    expect(radius).toBeLessThan(lmp.settingCount());
    const pressure = lmp.inputId("pressure");
    expect(pressure).toBeGreaterThanOrEqual(0);
    expect(pressure).toBeLessThan(lmp.inputCount());
    const unknown = lmp.settingId("toonspectrum_no_such_setting");
    expect(unknown < 0 || unknown >= lmp.settingCount()).toBe(true);
  });

  it("round-trips base values through the injection API", () => {
    const brush = lmp.brushNew();
    try {
      const setting = lmp.settingId("radius_logarithmic");
      lmp.brushSetBaseValue(brush, setting, 2.25);
      expect(lmp.brushGetBaseValue(brush, setting)).toBeCloseTo(2.25, 5);
    } finally {
      lmp.brushFree(brush);
    }
  });
});

describe("libmypaint stroke determinism", () => {
  it("renders the same frame sha for the same input (fresh brush per render)", () => {
    const first = renderLibmypaint("wash-soft");
    const second = renderLibmypaint("wash-soft");
    expect(first.sha256).toBe(second.sha256);
    expect(first.stats.inkedPixels).toBeGreaterThan(0);
  });

  it("separates corpus brushes: wash and ink produce different frames", () => {
    expect(renderLibmypaint("wash-soft").sha256).not.toBe(
      renderLibmypaint("ink-crisp").sha256,
    );
  });
});

describe("injection honesty contract", () => {
  it("injects every corpus setting with zero silent loss", () => {
    for (const id of CORPUS_BRUSHES) {
      const { document } = readCorpusDocument(id);
      const brush = lmp.brushNew();
      try {
        const result = applyMybSettings(lmp, brush, document);
        expect(result.applied).toEqual(Object.keys(document.settings).sort());
        expect(result.unknownSettings).toEqual([]);
        expect(result.unknownInputs).toEqual([]);
      } finally {
        lmp.brushFree(brush);
      }
    }
  });

  it("surfaces unknown settings and inputs instead of dropping them", () => {
    const brush = lmp.brushNew();
    try {
      const result = applyMybSettings(lmp, brush, {
        settings: {
          radius_logarithmic: {
            base_value: 2,
            inputs: { made_up_axis: [[0, 0], [1, 1]] },
          },
          made_up_setting: { base_value: 1, inputs: {} },
        },
      });
      expect(result.applied).toEqual(["radius_logarithmic"]);
      expect(result.unknownSettings).toEqual(["made_up_setting"]);
      expect(result.unknownInputs).toEqual([
        "radius_logarithmic.inputs.made_up_axis",
      ]);
    } finally {
      lmp.brushFree(brush);
    }
  });
});

describe("MyPaint reference ↔ Hokusai challenger parity", () => {
  for (const id of CORPUS_BRUSHES) {
    it(`${id}: cross-engine metrics match the committed measurement`, () => {
      const committed = loadCommittedResults().brushes[id];
      expect(committed).toBeDefined();
      if (!committed) return;

      const libmypaintRender = renderLibmypaint(id);
      const hokusaiRender = renderHokusai(id);
      expect(libmypaintRender.sha256).toBe(committed.libmypaint.sha256);
      expect(hokusaiRender.sha256).toBe(committed.hokusai.sha256);
      expect(libmypaintRender.stats.totalAlpha).toBe(
        committed.libmypaint.totalAlpha,
      );
      expect(hokusaiRender.stats.totalAlpha).toBe(committed.hokusai.totalAlpha);

      const correlation = pearsonCorrelation(
        libmypaintRender.profile,
        hokusaiRender.profile,
      );
      expect(correlation).toBeCloseTo(
        committed.parity.columnProfileCorrelation,
        9,
      );
      expect(
        libmypaintRender.stats.totalAlpha / hokusaiRender.stats.totalAlpha,
      ).toBeCloseTo(committed.parity.coverageRatio, 9);
    });
  }

  it("both engines follow the pressure ramp: more ink in the high-pressure half", () => {
    for (const id of CORPUS_BRUSHES) {
      for (const render of [renderLibmypaint(id), renderHokusai(id)]) {
        const half = Math.floor(render.profile.length / 2);
        const low = render.profile
          .slice(0, half)
          .reduce((sum, value) => sum + value, 0);
        const high = render.profile
          .slice(half)
          .reduce((sum, value) => sum + value, 0);
        expect(high).toBeGreaterThan(low);
      }
    }
  });

  it("records throughput evidence and a recomputable 20% gate verdict", () => {
    const committed = loadCommittedResults();
    const advantages = Object.values(committed.brushes).flatMap((record) => [
      record.throughput.hokusaiOverLibmypaint,
      record.largeBrushThroughput.hokusaiOverLibmypaint,
    ]);
    expect(advantages.length).toBe(CORPUS_BRUSHES.length * 2);
    for (const record of Object.values(committed.brushes)) {
      expect(record.throughput.libmypaintMsMedian).toBeGreaterThan(0);
      expect(record.throughput.hokusaiMsMedian).toBeGreaterThan(0);
      expect(record.largeBrushThroughput.libmypaintMsMedian).toBeGreaterThan(0);
      expect(record.largeBrushThroughput.hokusaiMsMedian).toBeGreaterThan(0);
    }
    const advantageMin = Math.min(...advantages);
    expect(committed.gate.hokusaiThroughputAdvantageMin).toBeCloseTo(
      advantageMin,
      9,
    );
    expect(committed.gate.hokusaiPasses20pctGate).toBe(advantageMin >= 1.2);
  });
});
