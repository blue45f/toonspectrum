import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { decodePng } from "image-js";

const ROOT = process.env.TOONSPECTRUM_SOAK_OUT?.trim()
  || process.argv[2]
  || "artifacts/studio-five-hour-soak/desktop";
const OUT = join(ROOT, "visual-analysis.json");
const DOMINANT_RATIO_LIMIT = 0.985;
const EXTREME_RATIO_LIMIT = 0.99;
const LUMA_STDDEV_MIN = 8;
const MIN_QUANTIZED_COLORS = 24;
const MAX_EXACT_DUPLICATE_STREAK = 2;
const SAMPLE_STRIDE = 4;

interface VisualRow {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly sampledPixels: number;
  readonly lumaMean: number;
  readonly lumaStdDev: number;
  readonly nearWhiteRatio: number;
  readonly nearBlackRatio: number;
  readonly dominantQuantizedRatio: number;
  readonly quantizedColors: number;
  readonly blankLike: boolean;
  readonly reasons: readonly string[];
}

function checkpointOrder(name: string): number {
  if (name === "final.png") return Number.MAX_SAFE_INTEGER;
  const match = /^checkpoint-(\d+)m\.png$/u.exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER - 1;
}

function inspect(name: string): VisualRow {
  const bytes = readFileSync(join(ROOT, name));
  const raw = decodePng(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).getRawImage();
  const counts = new Map<number, number>();
  let samples = 0;
  let lumaSum = 0;
  let lumaSquareSum = 0;
  let white = 0;
  let black = 0;
  const channels = raw.channels;
  const pixelCount = raw.width * raw.height;
  const stride = Math.max(1, SAMPLE_STRIDE);

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const index = pixel * channels;
    const r = raw.data[index] ?? 0;
    const g = raw.data[index + 1] ?? r;
    const b = raw.data[index + 2] ?? r;
    const alpha = channels >= 4 ? (raw.data[index + 3] ?? 255) / 255 : 1;
    const rr = Math.round(r * alpha + 255 * (1 - alpha));
    const gg = Math.round(g * alpha + 255 * (1 - alpha));
    const bb = Math.round(b * alpha + 255 * (1 - alpha));
    const luma = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
    lumaSum += luma;
    lumaSquareSum += luma * luma;
    if (rr >= 248 && gg >= 248 && bb >= 248) white += 1;
    if (rr <= 7 && gg <= 7 && bb <= 7) black += 1;
    const key = ((rr >> 4) << 8) | ((gg >> 4) << 4) | (bb >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    samples += 1;
  }

  const lumaMean = samples ? lumaSum / samples : 0;
  const variance = samples ? Math.max(0, lumaSquareSum / samples - lumaMean * lumaMean) : 0;
  const lumaStdDev = Math.sqrt(variance);
  const dominant = Math.max(0, ...counts.values());
  const nearWhiteRatio = samples ? white / samples : 1;
  const nearBlackRatio = samples ? black / samples : 1;
  const dominantQuantizedRatio = samples ? dominant / samples : 1;
  const reasons: string[] = [];
  if (lumaStdDev < LUMA_STDDEV_MIN) reasons.push(`low visual variance ${lumaStdDev.toFixed(2)}`);
  if (nearWhiteRatio > EXTREME_RATIO_LIMIT) reasons.push(`near-white ${(nearWhiteRatio * 100).toFixed(2)}%`);
  if (nearBlackRatio > EXTREME_RATIO_LIMIT) reasons.push(`near-black ${(nearBlackRatio * 100).toFixed(2)}%`);
  if (dominantQuantizedRatio > DOMINANT_RATIO_LIMIT) {
    reasons.push(`dominant quantized colour ${(dominantQuantizedRatio * 100).toFixed(2)}%`);
  }
  if (counts.size < MIN_QUANTIZED_COLORS) reasons.push(`only ${counts.size} quantized colours`);

  return {
    file: name,
    width: raw.width,
    height: raw.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sampledPixels: samples,
    lumaMean: Number(lumaMean.toFixed(3)),
    lumaStdDev: Number(lumaStdDev.toFixed(3)),
    nearWhiteRatio: Number(nearWhiteRatio.toFixed(6)),
    nearBlackRatio: Number(nearBlackRatio.toFixed(6)),
    dominantQuantizedRatio: Number(dominantQuantizedRatio.toFixed(6)),
    quantizedColors: counts.size,
    blankLike: reasons.length > 0,
    reasons,
  };
}

if (!existsSync(ROOT)) throw new Error(`Studio soak evidence directory not found: ${ROOT}`);
const files = readdirSync(ROOT)
  .filter((name) => /^checkpoint-\d+m\.png$/u.test(name) || name === "final.png")
  .sort((left, right) => checkpointOrder(left) - checkpointOrder(right));
if (files.length === 0) throw new Error(`No visual checkpoints found in ${ROOT}`);

const rows = files.map(inspect);
const failures: Array<{ file: string; reason: string }> = [];
for (const row of rows) {
  for (const reason of row.reasons) failures.push({ file: row.file, reason });
}

let duplicateStreak = 0;
let longestDuplicateStreak = 0;
for (let index = 1; index < rows.length; index += 1) {
  if (rows[index]!.sha256 === rows[index - 1]!.sha256) {
    duplicateStreak += 1;
    longestDuplicateStreak = Math.max(longestDuplicateStreak, duplicateStreak);
  } else {
    duplicateStreak = 0;
  }
}
if (longestDuplicateStreak > MAX_EXACT_DUPLICATE_STREAK) {
  failures.push({
    file: "checkpoint-sequence",
    reason: `${longestDuplicateStreak + 1} consecutive exact-identical screenshots`,
  });
}

const first = rows[0]!;
for (const row of rows.slice(1)) {
  if (row.width !== first.width || row.height !== first.height) {
    failures.push({
      file: row.file,
      reason: `viewport changed ${first.width}x${first.height} -> ${row.width}x${row.height}`,
    });
  }
}

const report = {
  root: ROOT,
  thresholds: {
    dominantRatioLimit: DOMINANT_RATIO_LIMIT,
    extremeRatioLimit: EXTREME_RATIO_LIMIT,
    lumaStdDevMin: LUMA_STDDEV_MIN,
    minQuantizedColors: MIN_QUANTIZED_COLORS,
    maxExactDuplicateStreak: MAX_EXACT_DUPLICATE_STREAK,
    sampleStride: SAMPLE_STRIDE,
  },
  rows,
  longestExactDuplicateRun: longestDuplicateStreak + 1,
  failures,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log(`[studio-five-hour-visual] ${rows.length} screenshots · ${failures.length} visual failures`);
for (const row of rows) {
  console.log(
    `[studio-five-hour-visual] ${row.file} ${row.width}x${row.height} `
      + `σ=${row.lumaStdDev.toFixed(1)} white=${(row.nearWhiteRatio * 100).toFixed(1)}% `
      + `black=${(row.nearBlackRatio * 100).toFixed(1)}% colours=${row.quantizedColors}`,
  );
}
for (const failure of failures.slice(0, 50)) {
  console.error(`[studio-five-hour-visual] FAIL ${failure.file}: ${failure.reason}`);
}
if (failures.length > 0) process.exitCode = 1;
