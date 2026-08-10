import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";


import {
  encodeRgbaToPng,
  renderSceneToPixels as renderWithSkia,
} from "@toonspectrum/studio-engine-skia";
import { loadCanvasKitNode } from "@toonspectrum/studio-engine-skia/node";
import { renderSceneToPixels as renderWithVello } from "@toonspectrum/studio-engine-vello";
import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import type { SceneIR } from "@toonspectrum/studio-project-model";
import type { CanvasKit } from "canvaskit-wasm";

/**
 * Phase 1 gate (V11 §13): the same SceneIR rendered by two independent
 * verified engines (CanvasKit and vello_cpu) must agree within anti-aliasing
 * tolerance, and the vello_cpu lane must be bit-stable against committed
 * golden images. REGEN_V11_GOLDENS=1 re-materializes goldens + raw metrics.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "vector");
const GOLDEN_DIR = join(CORPUS_DIR, "golden");
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const REGEN = process.env.REGEN_V11_GOLDENS === "1";

// Cross-engine gate: symmetric neighborhood fuzzy match. Probes (recorded in
// docs/candidates/renderer-2d) show straight edges agree within ±1/255 while
// curved edges shift by a sub-pixel phase from different curve-flattening
// tolerances, moving mid-ramp AA values by up to ~40/255 — legitimate AA
// divergence, not structural error. A pixel passes if any pixel in the other
// image within Chebyshev radius 1 matches it within FUZZY_DELTA per channel,
// checked in both directions so both extra ink and missing ink fail.
// Structural divergence (missing strokes, wrong blend/color/opacity regions,
// deltas >= ~64/255) has no matching neighbor and trips the gate; systematic
// tonal drift is separately pinned by the flat-region scenes (04-07), which
// must stay at fuzzyMismatchPct 0. Sub-pixel hairlines (< 1px) are a known
// cross-engine divergence class and are excluded from the gated corpus.
const FUZZY_DELTA = 48;
const FUZZY_MISMATCH_PCT_GATE = 0.5;

interface DiffMetrics {
  scene: string;
  width: number;
  height: number;
  maxDelta: number;
  meanDelta: number;
  pctPixelsOver8: number;
  fuzzyMismatchPct: number;
}

function directionalMismatches(
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const other = (ny * width + nx) * 4;
          let channelMax = 0;
          for (let c = 0; c < 4; c += 1) {
            const delta = Math.abs((from[base + c] ?? 0) - (to[other + c] ?? 0));
            if (delta > channelMax) channelMax = delta;
          }
          if (channelMax <= FUZZY_DELTA) matched = true;
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

function fuzzyMismatchPct(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
): number {
  const worst = Math.max(
    directionalMismatches(a, b, width, height),
    directionalMismatches(b, a, width, height),
  );
  return (worst / (width * height)) * 100;
}

function diffMetrics(
  scene: string,
  width: number,
  height: number,
  a: Uint8Array,
  b: Uint8Array,
): DiffMetrics {
  if (a.length !== b.length) {
    throw new Error(`pixel buffer size mismatch for ${scene}: ${a.length} vs ${b.length}`);
  }
  let maxDelta = 0;
  let sum = 0;
  let over = 0;
  const pixels = width * height;
  for (let p = 0; p < pixels; p += 1) {
    let pixelOver = false;
    for (let c = 0; c < 4; c += 1) {
      const index = p * 4 + c;
      const delta = Math.abs((a[index] ?? 0) - (b[index] ?? 0));
      sum += delta;
      if (delta > maxDelta) maxDelta = delta;
      if (delta > 8) pixelOver = true;
    }
    if (pixelOver) over += 1;
  }
  return {
    scene,
    width,
    height,
    maxDelta,
    meanDelta: sum / (pixels * 4),
    pctPixelsOver8: (over / pixels) * 100,
    fuzzyMismatchPct: fuzzyMismatchPct(a, b, width, height),
  };
}

/** Deterministic PRNG so the dense line-art scene is identical everywhere. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function denseLineartScene(): SceneIR {
  const random = mulberry32(0x7001);
  const size = 256;
  const nodes: SceneIR["nodes"] = [];
  for (let index = 0; index < 120; index += 1) {
    const x0 = random() * size;
    const y0 = random() * size;
    nodes.push({
      id: `stroke-${index}`,
      kind: "stroke-path",
      path: {
        verbs: [
          { v: "M", x: x0, y: y0 },
          {
            v: "Q",
            cx: x0 + (random() - 0.5) * 120,
            cy: y0 + (random() - 0.5) * 120,
            x: random() * size,
            y: random() * size,
          },
        ],
      },
      paint: {
        kind: "solid",
        color: { r: random() * 0.4, g: random() * 0.4, b: random() * 0.4, a: 1 },
      },
      strokeWidth: 1.5 + random() * 3.0,
      cap: "round",
      join: "round",
      miterLimit: 4,
      opacity: 1,
      blend: "src-over",
    });
  }
  return sceneIRSchema.parse({
    version: 11,
    width: size,
    height: size,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes,
  });
}

function decodePng(ck: CanvasKit, bytes: Uint8Array): Uint8Array {
  const image = ck.MakeImageFromEncoded(bytes);
  if (!image) throw new Error("failed to decode PNG");
  try {
    const pixels = image.readPixels(0, 0, {
      width: image.width(),
      height: image.height(),
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    if (!pixels) throw new Error("failed to read decoded PNG pixels");
    return new Uint8Array(pixels as Uint8Array);
  } finally {
    image.delete();
  }
}

let ck: CanvasKit;
let corpus: Array<{ name: string; scene: SceneIR }> = [];
const collectedMetrics: DiffMetrics[] = [];

beforeAll(async () => {
  [ck] = await Promise.all([loadCanvasKitNode(), loadVelloNode()]);
  const files = (await readdir(CORPUS_DIR)).filter((file) => file.endsWith(".json"));
  expect(files.length).toBeGreaterThanOrEqual(7);
  corpus = await Promise.all(
    files.sort().map(async (file) => ({
      name: file.replace(/\.json$/, ""),
      scene: sceneIRSchema.parse(JSON.parse(await readFile(join(CORPUS_DIR, file), "utf8"))),
    })),
  );
  corpus.push({ name: "08-dense-lineart", scene: denseLineartScene() });
});

describe("cross-renderer visual diff (CanvasKit vs vello_cpu)", () => {
  it("every corpus scene agrees within anti-aliasing tolerance", async () => {
    for (const { name, scene } of corpus) {
      const skiaPixels = renderWithSkia(ck, scene);
      const velloPixels = renderWithVello(scene);
      const raw = diffMetrics(name, scene.width, scene.height, skiaPixels, velloPixels);
      collectedMetrics.push(raw);
      expect
        .soft(raw.fuzzyMismatchPct, `${name} fuzzyMismatchPct`)
        .toBeLessThanOrEqual(FUZZY_MISMATCH_PCT_GATE);
      // Flat-region scenes pin systematic tonal drift: any blend/gradient/
      // opacity math divergence must surface here as a non-zero mismatch.
      // 09-sweep-gradient joins the pin because both engines share the sweep
      // sampling model exactly (θ ∈ [0°,360°), clamped t) — measured maxDelta
      // is 1/255, the same class as the linear/radial gradient scenes.
      if (/^0[4-7]-|^09-/.test(name)) {
        expect.soft(raw.fuzzyMismatchPct, `${name} flat-region drift`).toBe(0);
      }
    }
    if (REGEN) {
      await mkdir(RESULTS_DIR, { recursive: true });
      await writeFile(
        join(RESULTS_DIR, "cross-renderer-diff.json"),
        `${JSON.stringify(
          {
            harness: "tests/visual/cross-renderer-diff.test.ts",
            engines: {
              a: "skia-canvaskit 0.41.1 (CPU surface, unpremul sRGB)",
              b: "vello-cpu (vello_cpu 0.2.0, baseline SIMD, single thread)",
            },
            gates: {
              scope: `symmetric 3x3-neighborhood fuzzy match, per-channel delta <= ${FUZZY_DELTA}; raw maxDelta/meanDelta/pctPixelsOver8 rows are evidence only; flat-region scenes (04-07, 09) must stay at 0`,
              fuzzyMismatchPct: FUZZY_MISMATCH_PCT_GATE,
            },
            scenes: collectedMetrics,
          },
          null,
          2,
        )}\n`,
      );
    }
  });

  it("vello_cpu output is bit-stable against committed goldens", async () => {
    await mkdir(GOLDEN_DIR, { recursive: true });
    for (const { name, scene } of corpus) {
      const pixels = renderWithVello(scene);
      const goldenPath = join(GOLDEN_DIR, `${name}.vello-cpu.png`);
      if (REGEN) {
        await writeFile(goldenPath, encodeRgbaToPng(ck, pixels, scene.width, scene.height));
        continue;
      }
      const golden = decodePng(ck, new Uint8Array(await readFile(goldenPath)));
      expect(golden.length, `${name} golden size`).toBe(pixels.length);
      expect(
        Buffer.from(golden).equals(Buffer.from(pixels)),
        `${name}: vello_cpu output diverged from committed golden`,
      ).toBe(true);
    }
  });

  it("renders are deterministic per engine (two passes, byte-equal)", () => {
    const scene = corpus[0]?.scene;
    if (!scene) throw new Error("corpus empty");
    expect(
      Buffer.from(renderWithVello(scene)).equals(Buffer.from(renderWithVello(scene))),
    ).toBe(true);
    expect(
      Buffer.from(renderWithSkia(ck, scene)).equals(Buffer.from(renderWithSkia(ck, scene))),
    ).toBe(true);
  });
});
