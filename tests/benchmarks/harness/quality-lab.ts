/**
 * Quality Lab v1 (V11.1 §3.2 Visual Quality axis, 사용자 지시 2026-08-07:
 * "성능만이 아니라 실제 품질을 비교해 선택").
 *
 * Two decidable quality shootouts against engine-independent references:
 *
 * 1. Downscale 2048→512: every candidate consumes the SAME analytic detail
 *    card; the reference is a float box-average (area) reduction computed in
 *    plain JS. Metrics: PSNR + mean 8×8 luma SSIM. Reference and candidate
 *    outputs are committed as PNGs for human review (승인 요건: reference
 *    images).
 * 2. Gaussian blur σ4 on 512² luma: reference is an exact separable float
 *    gaussian; candidates are CanvasKit ImageFilter, OpenCV and wasm-vips.
 *
 * Results feed the ProviderBenchmarkRegistry visualQuality axis so provider
 * SELECTION is quality-weighted, not just fast. Run:
 * pnpm run bench:quality-lab
 */
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { encodeRgbaToPng } from "@toonspectrum/studio-engine-skia";
import { loadCanvasKitNode } from "@toonspectrum/studio-engine-skia/node";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const ARTIFACT_DIR = join(REPO_ROOT, "tests", "benchmarks", "artifacts", "quality-lab");

const SRC = 2048;
const DST = 512;

/**
 * Analytic detail card (luma): hairline grid, concentric rings (moiré
 * stressor), diagonal strokes and a smooth ramp — the content classes where
 * downscale quality differences are visible.
 */
function detailCardLuma(size: number): Float64Array {
  const card = new Float64Array(size * size);
  const scale = size / 512;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let value = 0.5 + 0.45 * (x / size); // base ramp
      // hairline grid every 8 logical px (1 logical px wide)
      if (Math.floor(x / scale) % 8 === 0 || Math.floor(y / scale) % 8 === 0) {
        value = 0.08;
      }
      // concentric rings centered at (0.7, 0.3)
      const dx = x - size * 0.7;
      const dy = y - size * 0.3;
      const radius = Math.hypot(dx, dy);
      if (Math.sin(radius / (1.5 * scale)) > 0.6) value = Math.min(value, 0.15);
      // diagonal strokes
      if ((x + y) % Math.round(11 * scale) < 1.2 * scale) value = 0.92;
      card[y * size + x] = value;
    }
  }
  return card;
}

function lumaToRgba(luma: Float64Array): Uint8Array {
  const out = new Uint8Array(luma.length * 4);
  for (let index = 0; index < luma.length; index += 1) {
    const v = Math.round(Math.min(1, Math.max(0, luma[index] ?? 0)) * 255);
    out[index * 4] = v;
    out[index * 4 + 1] = v;
    out[index * 4 + 2] = v;
    out[index * 4 + 3] = 255;
  }
  return out;
}

/** Engine-independent reference: float area-average (box) reduction. */
function boxReduce(luma: Float64Array, src: number, dst: number): Float64Array {
  const factor = src / dst;
  const out = new Float64Array(dst * dst);
  for (let y = 0; y < dst; y += 1) {
    for (let x = 0; x < dst; x += 1) {
      let sum = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          sum += luma[(y * factor + sy) * src + (x * factor + sx)] ?? 0;
        }
      }
      out[y * dst + x] = sum / (factor * factor);
    }
  }
  return out;
}

function rgbaToLuma(rgba: Uint8Array): Float64Array {
  const out = new Float64Array(rgba.length / 4);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = (rgba[index * 4] ?? 0) / 255;
  }
  return out;
}

function psnr(a: Float64Array, b: Float64Array): number {
  let mse = 0;
  for (let index = 0; index < a.length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    mse += diff * diff;
  }
  mse /= a.length;
  if (mse === 0) return Infinity;
  return Number((10 * Math.log10(1 / mse)).toFixed(2));
}

/** Mean SSIM over non-overlapping 8×8 luma windows (C1/C2 per the paper). */
function meanSsim(a: Float64Array, b: Float64Array, size: number): number {
  const window = 8;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  let total = 0;
  let count = 0;
  for (let by = 0; by + window <= size; by += window) {
    for (let bx = 0; bx + window <= size; bx += window) {
      let meanA = 0;
      let meanB = 0;
      for (let y = 0; y < window; y += 1) {
        for (let x = 0; x < window; x += 1) {
          meanA += a[(by + y) * size + (bx + x)] ?? 0;
          meanB += b[(by + y) * size + (bx + x)] ?? 0;
        }
      }
      const n = window * window;
      meanA /= n;
      meanB /= n;
      let varA = 0;
      let varB = 0;
      let cov = 0;
      for (let y = 0; y < window; y += 1) {
        for (let x = 0; x < window; x += 1) {
          const da = (a[(by + y) * size + (bx + x)] ?? 0) - meanA;
          const db = (b[(by + y) * size + (bx + x)] ?? 0) - meanB;
          varA += da * da;
          varB += db * db;
          cov += da * db;
        }
      }
      varA /= n - 1;
      varB /= n - 1;
      cov /= n - 1;
      total +=
        ((2 * meanA * meanB + c1) * (2 * cov + c2)) /
        ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));
      count += 1;
    }
  }
  return Number((total / count).toFixed(4));
}

/** Exact separable float gaussian (radius 4σ) — blur reference. */
function gaussianReference(luma: Float64Array, size: number, sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 4);
  const kernel: number[] = [];
  let kernelSum = 0;
  for (let index = -radius; index <= radius; index += 1) {
    const weight = Math.exp(-(index * index) / (2 * sigma * sigma));
    kernel.push(weight);
    kernelSum += weight;
  }
  for (let index = 0; index < kernel.length; index += 1) {
    kernel[index] = (kernel[index] ?? 0) / kernelSum;
  }
  const horizontal = new Float64Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sx = Math.min(size - 1, Math.max(0, x + k));
        sum += (luma[y * size + sx] ?? 0) * (kernel[k + radius] ?? 0);
      }
      horizontal[y * size + x] = sum;
    }
  }
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sy = Math.min(size - 1, Math.max(0, y + k));
        sum += (horizontal[sy * size + x] ?? 0) * (kernel[k + radius] ?? 0);
      }
      out[y * size + x] = sum;
    }
  }
  return out;
}

interface QualityRow {
  candidate: string;
  psnrDb: number;
  ssim: number;
  wallMs: number;
  artifact: string;
}

async function main(): Promise<void> {
  const ck = await loadCanvasKitNode();
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const downscale: QualityRow[] = [];
  const blur: QualityRow[] = [];

  const sourceLuma = detailCardLuma(SRC);
  const sourceRgba = lumaToRgba(sourceLuma);
  const referenceLuma = boxReduce(sourceLuma, SRC, DST);
  await writeFile(
    join(ARTIFACT_DIR, "downscale-reference-box.png"),
    encodeRgbaToPng(ck, lumaToRgba(referenceLuma), DST, DST),
  );

  const recordDownscale = async (
    candidate: string,
    pixels: Uint8Array,
    wallMs: number,
  ): Promise<void> => {
    const luma = rgbaToLuma(pixels);
    const artifact = `downscale-${candidate}.png`;
    await writeFile(join(ARTIFACT_DIR, artifact), encodeRgbaToPng(ck, pixels, DST, DST));
    downscale.push({
      candidate,
      psnrDb: psnr(referenceLuma, luma),
      ssim: meanSsim(referenceLuma, luma, DST),
      wallMs: Number(wallMs.toFixed(2)),
      artifact,
    });
  };

  // nearest-neighbor floor
  {
    const start = performance.now();
    const out = new Uint8Array(DST * DST * 4);
    const factor = SRC / DST;
    for (let y = 0; y < DST; y += 1) {
      for (let x = 0; x < DST; x += 1) {
        const so = ((y * factor) * SRC + x * factor) * 4;
        const dofs = (y * DST + x) * 4;
        out[dofs] = sourceRgba[so] ?? 0;
        out[dofs + 1] = sourceRgba[so + 1] ?? 0;
        out[dofs + 2] = sourceRgba[so + 2] ?? 0;
        out[dofs + 3] = 255;
      }
    }
    await recordDownscale("nearest-floor", out, performance.now() - start);
  }

  // CanvasKit: cubic (Mitchell) and linear (no mips) via drawImageRect*
  {
    const info = {
      width: SRC,
      height: SRC,
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    };
    const image = ck.MakeImage(info, sourceRgba, SRC * 4);
    if (!image) throw new Error("MakeImage failed");
    const runCk = (mode: "cubic" | "linear"): { pixels: Uint8Array; wallMs: number } => {
      const surface = ck.MakeSurface(DST, DST);
      if (!surface) throw new Error("MakeSurface failed");
      const canvas = surface.getCanvas();
      const start = performance.now();
      const src = ck.XYWHRect(0, 0, SRC, SRC);
      const dst = ck.XYWHRect(0, 0, DST, DST);
      if (mode === "cubic") {
        canvas.drawImageRectCubic(image, src, dst, 1 / 3, 1 / 3);
      } else {
        canvas.drawImageRectOptions(
          image,
          src,
          dst,
          ck.FilterMode.Linear,
          ck.MipmapMode.None,
        );
      }
      surface.flush();
      const wallMs = performance.now() - start;
      const pixels = canvas.readPixels(0, 0, {
        width: DST,
        height: DST,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB,
      });
      surface.dispose();
      if (!pixels) throw new Error("readPixels failed");
      return { pixels: new Uint8Array(pixels as Uint8Array), wallMs };
    };
    const cubic = runCk("cubic");
    await recordDownscale("canvaskit-cubic-mitchell", cubic.pixels, cubic.wallMs);
    const linear = runCk("linear");
    await recordDownscale("canvaskit-linear-nomips", linear.pixels, linear.wallMs);
    image.delete();
  }

  // wasm-vips (lanczos3 default reduce)
  {
    const { default: Vips } = (await import("wasm-vips")) as unknown as {
      default: (options?: Record<string, unknown>) => Promise<{
        Image: {
          newFromMemory(
            data: Uint8Array,
            width: number,
            height: number,
            bands: number,
            format: string,
          ): {
            resize(scale: number): { writeToMemory(): Uint8Array; delete(): void };
            delete(): void;
          };
        };
        concurrency(n: number): void;
      }>;
    };
    const vips = await Vips({ dynamicLibraries: [] });
    vips.concurrency(1);
    const start = performance.now();
    const image = vips.Image.newFromMemory(sourceRgba, SRC, SRC, 4, "uchar");
    const resized = image.resize(DST / SRC);
    const pixels = resized.writeToMemory();
    const wallMs = performance.now() - start;
    resized.delete();
    image.delete();
    await recordDownscale("wasm-vips-lanczos3", new Uint8Array(pixels), wallMs);
  }

  // ---- Gaussian blur shootout (512² luma card, σ4) ----
  const blurSize = DST;
  const blurCardLuma = boxReduce(sourceLuma, SRC, DST); // reuse detail content
  const blurCardRgba = lumaToRgba(blurCardLuma);
  const sigma = 4;
  const blurReference = gaussianReference(blurCardLuma, blurSize, sigma);
  await writeFile(
    join(ARTIFACT_DIR, "blur-reference-float.png"),
    encodeRgbaToPng(ck, lumaToRgba(blurReference), blurSize, blurSize),
  );

  const recordBlur = async (
    candidate: string,
    pixels: Uint8Array,
    wallMs: number,
  ): Promise<void> => {
    const luma = rgbaToLuma(pixels);
    const artifact = `blur-${candidate}.png`;
    await writeFile(
      join(ARTIFACT_DIR, artifact),
      encodeRgbaToPng(ck, pixels, blurSize, blurSize),
    );
    blur.push({
      candidate,
      psnrDb: psnr(blurReference, luma),
      ssim: meanSsim(blurReference, luma, blurSize),
      wallMs: Number(wallMs.toFixed(2)),
      artifact,
    });
  };

  // CanvasKit ImageFilter blur
  {
    const info = {
      width: blurSize,
      height: blurSize,
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    };
    const image = ck.MakeImage(info, blurCardRgba, blurSize * 4);
    if (!image) throw new Error("MakeImage failed");
    const surface = ck.MakeSurface(blurSize, blurSize);
    if (!surface) throw new Error("MakeSurface failed");
    const canvas = surface.getCanvas();
    const paint = new ck.Paint();
    const filter = ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Clamp, null);
    paint.setImageFilter(filter);
    const start = performance.now();
    canvas.drawImage(image, 0, 0, paint);
    surface.flush();
    const wallMs = performance.now() - start;
    const pixels = canvas.readPixels(0, 0, info);
    filter.delete();
    paint.delete();
    surface.dispose();
    image.delete();
    if (!pixels) throw new Error("readPixels failed");
    await recordBlur("canvaskit-imagefilter", new Uint8Array(pixels as Uint8Array), wallMs);
  }

  // OpenCV GaussianBlur (auto kernel from sigma)
  {
    const module = (await import("@techstark/opencv-js")) as unknown as {
      default: PromiseLike<Record<string, unknown>>;
    };
    const cv = (await module.default) as {
      matFromImageData(data: { data: Uint8ClampedArray; width: number; height: number }): {
        data: Uint8Array;
        delete(): void;
      };
      Mat: new () => { data: Uint8Array; delete(): void };
      Size: new (w: number, h: number) => unknown;
      GaussianBlur(src: unknown, dst: unknown, size: unknown, sigma: number): void;
    };
    const src = cv.matFromImageData({
      data: new Uint8ClampedArray(blurCardRgba),
      width: blurSize,
      height: blurSize,
    });
    const dst = new cv.Mat();
    const start = performance.now();
    cv.GaussianBlur(src, dst, new cv.Size(0, 0), sigma);
    const wallMs = performance.now() - start;
    await recordBlur("opencv-gaussian", new Uint8Array(dst.data), wallMs);
    src.delete();
    dst.delete();
  }

  // wasm-vips gaussblur
  {
    const { default: Vips } = (await import("wasm-vips")) as unknown as {
      default: (options?: Record<string, unknown>) => Promise<{
        Image: {
          newFromMemory(
            data: Uint8Array,
            width: number,
            height: number,
            bands: number,
            format: string,
          ): {
            gaussblur(sigma: number): { writeToMemory(): Uint8Array; delete(): void };
            delete(): void;
          };
        };
        concurrency(n: number): void;
      }>;
    };
    const vips = await Vips({ dynamicLibraries: [] });
    vips.concurrency(1);
    const image = vips.Image.newFromMemory(blurCardRgba, blurSize, blurSize, 4, "uchar");
    const start = performance.now();
    const blurred = image.gaussblur(sigma);
    const pixels = blurred.writeToMemory();
    const wallMs = performance.now() - start;
    blurred.delete();
    image.delete();
    await recordBlur("wasm-vips-gaussblur", new Uint8Array(pixels), wallMs);
  }

  const report = {
    harness: "tests/benchmarks/harness/quality-lab.ts",
    generatedAt: new Date().toISOString(),
    host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    references: {
      downscale: "float box-average reduction (engine-independent)",
      blur: "separable float gaussian, radius 4 sigma, clamp edges",
    },
    downscale2048to512: downscale,
    gaussianBlurSigma4: blur,
  };
  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, "quality-lab.json");
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  for (const row of [...downscale, ...blur]) {
    console.log(
      `${row.candidate}: PSNR ${row.psnrDb}dB SSIM ${row.ssim} (${row.wallMs}ms)`,
    );
  }
  console.log(`written: ${target}`);
}

await main();
