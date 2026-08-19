import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { renderSceneToPixels } from "@toonspectrum/studio-engine-vello";
import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import { beforeAll, describe, expect, it } from "vitest";

import {
  fuzzyMismatchPct,
  loadVelloSvgNative,
  renderSvgToPixelsVelloCpu,
} from "../../packages/studio-engine-vello/src/index";
import { parseSvgToScene } from "../../packages/studio-format-gateway/src/svg";

const SIZE = 128;
const SAMPLES = 20;
const FIXTURE_ROOT = new URL("../../crates/studio-engine-vello/tests/fixtures/svg/",
  import.meta.url,
);
const NATIVE_WASM = new URL("../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello_bg.wasm",
  import.meta.url,
);
const RESVG_WASM = new URL("../../node_modules/@resvg/resvg-wasm/index_bg.wasm",
  import.meta.url,
);

type Candidate = "vello-svg-native-cpu" | "scene-ir-custom" | "resvg-reference";

interface Metrics {
  psnrDb: number | "Infinity";
  ssim: number;
  fuzzyMismatchPct: number;
}

function rgbaToLuma(rgba: Uint8Array): Float64Array {
  const result = new Float64Array(rgba.length / 4);
  for (let index = 0; index < result.length; index += 1) {
    const offset = index * 4;
    result[index] =
      ((rgba[offset] ?? 0) * 0.2126 +
        (rgba[offset + 1] ?? 0) * 0.7152 +
        (rgba[offset + 2] ?? 0) * 0.0722) /
      255;
  }
  return result;
}

function psnr(a: Uint8Array, b: Uint8Array): number | "Infinity" {
  let mse = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    mse += delta * delta;
  }
  mse /= a.length;
  return mse === 0 ? "Infinity" : Number((10 * Math.log10((255 * 255) / mse)).toFixed(3));
}

function meanSsim(a: Uint8Array, b: Uint8Array): number {
  const lumaA = rgbaToLuma(a);
  const lumaB = rgbaToLuma(b);
  const window = 8;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  let sum = 0;
  let windows = 0;
  for (let top = 0; top < SIZE; top += window) {
    for (let left = 0; left < SIZE; left += window) {
      let meanA = 0;
      let meanB = 0;
      for (let y = 0; y < window; y += 1) {
        for (let x = 0; x < window; x += 1) {
          meanA += lumaA[(top + y) * SIZE + left + x] ?? 0;
          meanB += lumaB[(top + y) * SIZE + left + x] ?? 0;
        }
      }
      const count = window * window;
      meanA /= count;
      meanB /= count;
      let varianceA = 0;
      let varianceB = 0;
      let covariance = 0;
      for (let y = 0; y < window; y += 1) {
        for (let x = 0; x < window; x += 1) {
          const deltaA = (lumaA[(top + y) * SIZE + left + x] ?? 0) - meanA;
          const deltaB = (lumaB[(top + y) * SIZE + left + x] ?? 0) - meanB;
          varianceA += deltaA * deltaA;
          varianceB += deltaB * deltaB;
          covariance += deltaA * deltaB;
        }
      }
      varianceA /= count - 1;
      varianceB /= count - 1;
      covariance /= count - 1;
      sum +=
        ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
        ((meanA ** 2 + meanB ** 2 + c1) * (varianceA + varianceB + c2));
      windows += 1;
    }
  }
  return Number((sum / windows).toFixed(6));
}

function metrics(candidate: Uint8Array, reference: Uint8Array): Metrics {
  return {
    psnrDb: psnr(candidate, reference),
    ssim: meanSsim(candidate, reference),
    fuzzyMismatchPct: Number(
      fuzzyMismatchPct(candidate, reference, SIZE, SIZE).toFixed(6),
    ),
  };
}

function renderResvg(svg: string): Uint8Array {
  const renderer = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: false },
    shapeRendering: 2,
  });
  const image = renderer.render();
  const pixels = new Uint8Array(image.pixels);
  image.free();
  renderer.free();
  return pixels;
}

function renderCustomSceneIr(svg: string): Uint8Array {
  const imported = parseSvgToScene(svg, {
    background: { r: 1, g: 1, b: 1, a: 1 },
  });
  if (imported.unsupported.length > 0) {
    throw new Error(`custom importer rejected fixture: ${imported.unsupported.join(", ")}`);
  }
  return renderSceneToPixels(imported.scene);
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number((sorted[index] ?? Number.NaN).toFixed(3));
}

async function timing(render: () => Uint8Array | Promise<Uint8Array>): Promise<{
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  peakObservedRssDeltaBytes: number;
}> {
  await render();
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  const samples: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const start = performance.now();
    await render();
    samples.push(performance.now() - start);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }
  samples.sort((left, right) => left - right);
  return {
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    peakObservedRssDeltaBytes: peakRss - baselineRss,
  };
}

beforeAll(async () => {
  await Promise.all([
    initWasm(new Uint8Array(await readFile(RESVG_WASM))),
    loadVelloSvgNative(new Uint8Array(await readFile(NATIVE_WASM))),
    loadVelloNode(),
  ]);
});

describe("SVG candidate quality tournament", () => {
  it("compares native usvg lowering and custom SceneIR against resvg", async () => {
    const quality: Array<Record<string, unknown>> = [];
    const timings: Partial<Record<Candidate, Awaited<ReturnType<typeof timing>>>> = {};
    for (const name of ["curves", "gradients", "clip"] as const) {
      const svg = await readFile(new URL(`${name}.svg`, FIXTURE_ROOT), "utf8");
      const reference = renderResvg(svg);
      const native = await renderSvgToPixelsVelloCpu(svg, SIZE, SIZE);
      const custom = renderCustomSceneIr(svg);
      const nativeMetrics = metrics(native, reference);
      const customMetrics = metrics(custom, reference);
      quality.push({ name, native: nativeMetrics, custom: customMetrics });

      expect(nativeMetrics.ssim, `${name}: native SSIM`).toBeGreaterThanOrEqual(0.95);
      expect(nativeMetrics.fuzzyMismatchPct, `${name}: native fuzzy mismatch`).toBeLessThanOrEqual(
        2,
      );
      expect(await renderSvgToPixelsVelloCpu(svg, SIZE, SIZE)).toEqual(native);
      expect(renderCustomSceneIr(svg)).toEqual(custom);

      if (name === "gradients") {
        timings["vello-svg-native-cpu"] = await timing(() =>
          renderSvgToPixelsVelloCpu(svg, SIZE, SIZE),
        );
        timings["scene-ir-custom"] = await timing(() => renderCustomSceneIr(svg));
        timings["resvg-reference"] = await timing(() => renderResvg(svg));
      }
    }

    const nativeMeanSsim =
      quality.reduce((sum, row) => sum + ((row.native as Metrics).ssim ?? 0), 0) /
      quality.length;
    const customMeanSsim =
      quality.reduce((sum, row) => sum + ((row.custom as Metrics).ssim ?? 0), 0) /
      quality.length;
    expect(nativeMeanSsim).toBeGreaterThanOrEqual(customMeanSsim);
    console.info(
      `SVG_NATIVE_QUALITY=${JSON.stringify({ quality, timings, nativeMeanSsim, customMeanSsim })}`,
    );
  });
});
