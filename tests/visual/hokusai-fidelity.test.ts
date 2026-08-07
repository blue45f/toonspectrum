import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Brush Fidelity Lab v0 (V11.1 §6.4 / Phase 2): pins the pixel identity of the
 * Hokusai natural-media lane. Each corpus variant runs a deterministic stroke
 * and its full-frame sha256 is committed as a golden; any engine/adapter
 * upgrade that shifts a single pixel fails here and must ship with regenerated
 * goldens plus visual review. REGEN_V11_GOLDENS=1 rewrites the manifest.
 *
 * Parity scope note: this pins Hokusai against itself across upgrades. The
 * libmypaint cross-engine parity lab (matrix E11↔E12) plugs into the same
 * corpus once a libmypaint wasm lane exists — variants deliberately carry
 * `.myb`-expressible parameters only.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const PKG_DIR = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
const GOLDEN_PATH = join(
  REPO_ROOT,
  "tests",
  "corpus",
  "brushes",
  "hokusai-fidelity-goldens.json",
);
const REGEN = process.env.REGEN_V11_GOLDENS === "1";

interface FidelityVariant {
  id: string;
  seed: number;
  colorHsv: [number, number, number];
  radiusLog2: number;
  pressureScale: number;
}

const VARIANTS: FidelityVariant[] = [
  { id: "ink-default", seed: 101, colorHsv: [0, 0, 0.1], radiusLog2: 1.5, pressureScale: 1 },
  { id: "ink-fine", seed: 101, colorHsv: [0, 0, 0.1], radiusLog2: 0.5, pressureScale: 1 },
  { id: "ink-broad", seed: 101, colorHsv: [0, 0, 0.1], radiusLog2: 2.5, pressureScale: 1 },
  { id: "crimson-light-touch", seed: 202, colorHsv: [0.98, 0.85, 0.75], radiusLog2: 1.8, pressureScale: 0.55 },
  { id: "indigo-heavy", seed: 303, colorHsv: [0.64, 0.7, 0.55], radiusLog2: 2.0, pressureScale: 1 },
  { id: "seed-variation", seed: 404, colorHsv: [0.3, 0.6, 0.5], radiusLog2: 1.8, pressureScale: 0.8 },
];

const CANVAS_SIZE = 96;
const SAMPLE_COUNT = 48;

type HokusaiModule = typeof import("../../packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");

let hokusai: HokusaiModule;

beforeAll(async () => {
  hokusai = (await import(
    join(PKG_DIR, "studio_hokusai_wasm.js")
  )) as HokusaiModule;
  const wasmBytes = await readFile(join(PKG_DIR, "studio_hokusai_wasm_bg.wasm"));
  await hokusai.default({ module_or_path: wasmBytes });
});

/** Deterministic S-curve stroke with pressure ramp and gentle tilt sweep. */
function runVariant(variant: FidelityVariant): {
  sha256: string;
  inkedPixels: number;
} {
  const brush = hokusai.HokusaiBrush.naturalMedia();
  const canvas = new hokusai.HokusaiCanvas(CANVAS_SIZE, CANVAS_SIZE, variant.seed);
  try {
    brush.setColorHsv(...variant.colorHsv);
    brush.setRadiusLog(variant.radiusLog2);
    canvas.beginStroke(brush, variant.seed);
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const t = index / (SAMPLE_COUNT - 1);
      const x = 8 + t * (CANVAS_SIZE - 16);
      const y =
        CANVAS_SIZE / 2 + Math.sin(t * Math.PI * 2) * (CANVAS_SIZE / 2 - 14);
      const pressure =
        variant.pressureScale * (0.25 + 0.75 * Math.sin(t * Math.PI));
      canvas.addSample(brush, x, y, pressure, Math.sin(t * 3) * 0.4, 0.2, index * 8);
    }
    canvas.finishStroke(brush);
    const frame = canvas.fullFrame();
    const sha256 = createHash("sha256").update(frame).digest("hex");
    let inkedPixels = 0;
    for (let offset = 3; offset < frame.length; offset += 4) {
      if ((frame[offset] ?? 0) > 0) inkedPixels += 1;
    }
    return { sha256, inkedPixels };
  } finally {
    canvas.dispose();
    canvas.free();
    brush.free();
  }
}

describe("hokusai brush fidelity corpus", () => {
  it("every variant paints and is bit-deterministic across runs", () => {
    for (const variant of VARIANTS) {
      const first = runVariant(variant);
      const second = runVariant(variant);
      expect(second.sha256, `${variant.id} determinism`).toBe(first.sha256);
      expect(first.inkedPixels, `${variant.id} ink coverage`).toBeGreaterThan(200);
    }
  });

  it("radius and color variants produce distinct pixel identities", () => {
    const hashes = new Set(VARIANTS.map((variant) => runVariant(variant).sha256));
    expect(hashes.size).toBe(VARIANTS.length);
  });

  it("matches the committed golden manifest (regen with REGEN_V11_GOLDENS=1)", async () => {
    const current = VARIANTS.map((variant) => ({
      id: variant.id,
      params: variant,
      ...runVariant(variant),
    }));
    if (REGEN) {
      await mkdir(join(REPO_ROOT, "tests", "corpus", "brushes"), { recursive: true });
      await writeFile(
        GOLDEN_PATH,
        `${JSON.stringify(
          {
            harness: "tests/visual/hokusai-fidelity.test.ts",
            engine: "studio-hokusai-wasm (hokusai 0.3.0 pinned, packed transparent RGBA8)",
            canvas: { size: CANVAS_SIZE, samples: SAMPLE_COUNT },
            variants: current,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8")) as {
      variants: Array<{ id: string; sha256: string; inkedPixels: number }>;
    };
    expect(golden.variants).toHaveLength(current.length);
    for (const [index, variant] of current.entries()) {
      expect(variant.sha256, `${variant.id} golden hash`).toBe(
        golden.variants[index]?.sha256,
      );
      expect(variant.inkedPixels, `${variant.id} golden coverage`).toBe(
        golden.variants[index]?.inkedPixels,
      );
    }
  });
});
