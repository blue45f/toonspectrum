/**
 * Read-only benchmark runner for the pinned InkWash audit checkout.
 *
 * The competitor source is never bundled or copied into ToonSpectrum. This runner only drives the
 * locally pinned original in Chromium, captures evidence and emits neutral image/performance
 * metrics that our independent implementation can compare against.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

const WIDTH = 512;
const HEIGHT = 384;
const URL = process.env.TOONSPECTRUM_INKWASH_ORACLE_URL ?? "http://127.0.0.1:53987/";
const EVIDENCE = process.env.TOONSPECTRUM_INKWASH_ORACLE_DIR
  ?? join(tmpdir(), `toonspectrum-inkwash-oracle-${Date.now()}`);

function imageFromBottomUp(raw) {
  const output = new Uint8Array(raw.length);
  const stride = WIDTH * 4;
  for (let row = 0; row < HEIGHT; row += 1) {
    output.set(raw.slice(row * stride, row * stride + stride), (HEIGHT - 1 - row) * stride);
  }
  return output;
}

function darknessAt(data, x, y) {
  const index = (y * WIDTH + x) * 4;
  return 255 - ((data[index] ?? 255) + (data[index + 1] ?? 255) + (data[index + 2] ?? 255)) / 3;
}

function darkBounds(data, paper, threshold = 8) {
  let left = WIDTH;
  let top = HEIGHT;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (Math.abs(darknessAt(data, x, y) - darknessAt(paper, x, y)) < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function differenceStats(before, after, bounds) {
  const values = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      values.push(Math.abs(darknessAt(after, x, y) - darknessAt(before, x, y)));
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / Math.max(1, values.length);
  return { mean, standardDeviation: Math.sqrt(variance), maximum: Math.max(...values) };
}

function paperStandardDeviation(data) {
  const values = [];
  for (let y = 24; y < HEIGHT - 80; y += 1) {
    for (let x = 24; x < WIDTH - 24; x += 1) values.push(darknessAt(data, x, y));
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

async function readPixels(page) {
  const raw = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#c");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("InkWash canvas unavailable.");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("InkWash WebGL2 unavailable.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return Array.from(pixels);
  });
  return imageFromBottomUp(raw);
}

async function stroke(page, points, delay = 5) {
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 1, delay });
  await page.mouse.up();
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const diagnostics = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.push(error.message));
    await page.goto(URL, { waitUntil: "load" });
    await page.waitForTimeout(150);
    const paper = await readPixels(page);
    await page.locator("#c").screenshot({ path: join(EVIDENCE, "oracle-paper.png") });

    const line = Array.from({ length: 73 }, (_, index) => {
      const ratio = index / 72;
      return [54 + ratio * 404, 192 + Math.sin(ratio * Math.PI * 4) * 10];
    });
    await stroke(page, line);
    await page.waitForTimeout(220);
    const linePixels = await readPixels(page);
    await page.locator("#c").screenshot({ path: join(EVIDENCE, "oracle-line.png") });

    await page.keyboard.press("b");
    const water = Array.from({ length: 49 }, (_, index) => {
      const ratio = index / 48;
      return [150 + ratio * 212, 192 + Math.sin(ratio * Math.PI * 3) * 14];
    });
    await stroke(page, water, 8);
    await page.waitForTimeout(900);
    const bloomPixels = await readPixels(page);
    await page.locator("#c").screenshot({ path: join(EVIDENCE, "oracle-line-wash.png") });

    const frameIntervals = await page.evaluate(async () => {
      const values = [];
      let previous = performance.now();
      for (let index = 0; index < 90; index += 1) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        values.push(now - previous);
        previous = now;
      }
      return values;
    });
    frameIntervals.sort((left, right) => left - right);

    const lineBounds = darkBounds(linePixels, paper);
    const bloomBounds = darkBounds(bloomPixels, paper);
    const metrics = {
      kind: "toonspectrum/inkwash-read-only-oracle",
      pinnedCommit: "48b7cf0f4f2afaa8c4256460e696c1b46cfab985",
      viewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
      lineBounds,
      bloomBounds,
      lineWashExpansion: {
        width: bloomBounds.width - lineBounds.width,
        height: bloomBounds.height - lineBounds.height,
      },
      washDifference: differenceStats(linePixels, bloomPixels, {
        x: 120,
        y: 130,
        width: 272,
        height: 124,
      }),
      paperLuminanceStandardDeviation: paperStandardDeviation(paper),
      frameTiming: {
        averageMilliseconds: frameIntervals.reduce((sum, value) => sum + value, 0) / frameIntervals.length,
        p95Milliseconds: frameIntervals[Math.floor(frameIntervals.length * 0.95)] ?? 0,
        maximumMilliseconds: Math.max(...frameIntervals),
      },
      diagnostics,
      evidenceDirectory: EVIDENCE,
    };
    writeFileSync(join(EVIDENCE, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
    console.log(JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
