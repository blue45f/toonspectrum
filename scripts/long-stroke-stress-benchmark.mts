import * as fs from "fs";
import * as path from "path";

import { chromium } from "@playwright/test";

const SCREENSHOT_DIR = "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/scratch/screenshots";
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log("Launching Chromium for Long-Stroke Stress & Latency Benchmark...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  console.log("Navigating to http://localhost:5173/studio ...");
  await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Activate Brush Tool
  await page.keyboard.press("b");
  await page.waitForTimeout(500);

  const stage = page.locator(".konvajs-content").first();
  const box = await stage.boundingBox();
  if (!box) {
    console.error("Could not find Konva stage bounding box");
    await browser.close();
    return;
  }

  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.45;

  console.log("Executing ultra-long continuous spiral stroke (1,200 points)...");
  const moveLatencies: number[] = [];
  const tStart = Date.now();

  await page.mouse.move(cx, cy);
  await page.mouse.down();

  const totalSteps = 600;
  for (let i = 0; i <= totalSteps; i++) {
    const angle = i * 0.12;
    const r = 10 + i * 0.55;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;

    const tMove0 = performance.now();
    await page.mouse.move(px, py, { steps: 2 });
    const tMove1 = performance.now();
    moveLatencies.push(tMove1 - tMove0);
  }

  await page.mouse.up();
  const tEnd = Date.now();

  const totalPoints = totalSteps * 2;
  const totalElapsedMs = tEnd - tStart;
  const minLatency = Math.min(...moveLatencies);
  const maxLatency = Math.max(...moveLatencies);
  const avgLatency = moveLatencies.reduce((a, b) => a + b, 0) / moveLatencies.length;
  moveLatencies.sort((a, b) => a - b);
  const p95Latency = moveLatencies[Math.floor(moveLatencies.length * 0.95)] ?? 0;
  const p99Latency = moveLatencies[Math.floor(moveLatencies.length * 0.99)] ?? 0;

  console.log("Long-Stroke Benchmark Results:");
  console.log(`- Total Points: ${totalPoints}`);
  console.log(`- Total Elapsed: ${totalElapsedMs} ms`);
  console.log(`- Min Move Latency: ${minLatency.toFixed(2)} ms`);
  console.log(`- Avg Move Latency: ${avgLatency.toFixed(2)} ms`);
  console.log(`- p95 Move Latency: ${p95Latency.toFixed(2)} ms`);
  console.log(`- p99 Move Latency: ${p99Latency.toFixed(2)} ms`);
  console.log(`- Max Move Latency: ${maxLatency.toFixed(2)} ms`);

  // Draw second test: high-speed dense zigzag hatching (800 points)
  console.log("Executing high-density zigzag hatching sweep...");
  const hx = box.x + box.width * 0.22;
  const hy = box.y + box.height * 0.22;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  for (let z = 0; z < 80; z++) {
    const x1 = hx + z * 4;
    const y1 = hy + (z % 2 === 0 ? 0 : 90);
    await page.mouse.move(x1, y1, { steps: 4 });
  }
  await page.mouse.up();

  await page.waitForTimeout(600);

  // Capture Full Canvas
  const fullScreenshotPath = path.join(SCREENSHOT_DIR, "11_long_stroke_stress_canvas.png");
  await page.screenshot({ path: fullScreenshotPath });
  console.log("Saved full screenshot to:", fullScreenshotPath);

  fs.copyFileSync(
    fullScreenshotPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/11_long_stroke_stress_canvas.png"
  );

  // Capture Canvas Detail
  const detailScreenshotPath = path.join(SCREENSHOT_DIR, "12_long_stroke_detail_zoom.png");
  await stage.screenshot({ path: detailScreenshotPath });
  console.log("Saved detail screenshot to:", detailScreenshotPath);

  fs.copyFileSync(
    detailScreenshotPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/12_long_stroke_detail_zoom.png"
  );

  await browser.close();
  console.log("Long-stroke stress testing completed successfully!");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
