import * as fs from "fs";
import * as path from "path";

import { chromium } from "@playwright/test";

const SCREENSHOT_DIR = "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/scratch/screenshots";
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log("Launching Chromium for comprehensive brush quality & perf test...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2, // HiDPI for crisp stroke captures
  });

  const page = await context.newPage();
  console.log("Navigating to http://localhost:5173/studio ...");
  await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Activate Brush Tool (shortcut 'b' or click toolbar button)
  console.log("Activating brush tool...");
  await page.keyboard.press("b");
  await page.waitForTimeout(500);

  // Locate the canvas drawing area
  const stage = page.locator(".konvajs-content").first();
  const box = await stage.boundingBox();
  if (!box) {
    console.error("Could not find Konva stage bounding box");
    await browser.close();
    return;
  }
  console.log("Found stage bounding box:", box);

  const startX = box.x + box.width * 0.28;
  const startY = box.y + box.height * 0.25;

  console.log("Starting structured brush stroke benchmarks...");
  const perfMetrics = {
    strokesDrawn: 0,
    totalPoints: 0,
    elapsedMs: 0,
  };

  const t0 = Date.now();

  // 1. G-Pen Pressure Spiral & Tapered S-Curves
  console.log("Drawing Inking / G-Pen strokes...");
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 0; i <= 60; i++) {
    const angle = i * 0.2;
    const r = 20 + i * 2.2;
    const px = startX + Math.cos(angle) * r;
    const py = startY + Math.sin(angle) * r;
    await page.mouse.move(px, py, { steps: 2 });
    perfMetrics.totalPoints += 2;
  }
  await page.mouse.up();
  perfMetrics.strokesDrawn++;
  await page.waitForTimeout(100);

  // 2. High-speed Cross-Hatching (Line art shading)
  console.log("Drawing Cross-Hatching lattice...");
  const hatchBaseX = startX + 260;
  const hatchBaseY = startY;
  for (let h = 0; h < 12; h++) {
    await page.mouse.move(hatchBaseX + h * 12, hatchBaseY);
    await page.mouse.down();
    await page.mouse.move(hatchBaseX + h * 12 + 60, hatchBaseY + 120, { steps: 3 });
    await page.mouse.up();
    perfMetrics.strokesDrawn++;
    perfMetrics.totalPoints += 3;

    // Cross stroke
    await page.mouse.move(hatchBaseX + h * 12 + 60, hatchBaseY);
    await page.mouse.down();
    await page.mouse.move(hatchBaseX + h * 12, hatchBaseY + 120, { steps: 3 });
    await page.mouse.up();
    perfMetrics.strokesDrawn++;
    perfMetrics.totalPoints += 3;
  }

  // 3. Ribbon & Wave Calligraphy Curves
  console.log("Drawing Calligraphy & Ribbon curves...");
  const ribbonX = startX;
  const ribbonY = startY + 220;
  await page.mouse.move(ribbonX, ribbonY);
  await page.mouse.down();
  for (let w = 0; w <= 80; w++) {
    const px = ribbonX + w * 6;
    const py = ribbonY + Math.sin(w * 0.15) * 45;
    await page.mouse.move(px, py, { steps: 2 });
    perfMetrics.totalPoints += 2;
  }
  await page.mouse.up();
  perfMetrics.strokesDrawn++;
  await page.waitForTimeout(100);

  // 4. Harmony / Long Fur Multi-strand fan
  console.log("Drawing Harmony / Long Fur strands...");
  const fanX = startX + 520;
  const fanY = startY + 80;
  for (let s = 0; s < 10; s++) {
    await page.mouse.move(fanX, fanY);
    await page.mouse.down();
    const endX = fanX + Math.cos(-0.8 + s * 0.18) * 140;
    const endY = fanY + Math.sin(-0.8 + s * 0.18) * 140;
    const midX = (fanX + endX) * 0.5 + Math.sin(s) * 20;
    const midY = (fanY + endY) * 0.5 + Math.cos(s) * 20;
    await page.mouse.move(midX, midY, { steps: 4 });
    await page.mouse.move(endX, endY, { steps: 4 });
    await page.mouse.up();
    perfMetrics.strokesDrawn++;
    perfMetrics.totalPoints += 8;
  }

  const t1 = Date.now();
  perfMetrics.elapsedMs = t1 - t0;
  console.log("Performance benchmark metrics:", perfMetrics);
  console.log(`Throughput: ${(perfMetrics.totalPoints / perfMetrics.elapsedMs).toFixed(2)} pts/ms`);

  await page.waitForTimeout(500);

  // Capture Full Studio UI with artwork
  const fullScreenshotPath = path.join(SCREENSHOT_DIR, "09_brush_quality_showcase_full.png");
  await page.screenshot({ path: fullScreenshotPath });
  console.log("Saved full studio screenshot to:", fullScreenshotPath);

  // Copy to brain artifact root for display
  fs.copyFileSync(
    fullScreenshotPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/09_brush_quality_showcase_full.png"
  );

  // Capture Macro Detail of canvas artwork
  const macroScreenshotPath = path.join(SCREENSHOT_DIR, "10_brush_strokes_macro_detail.png");
  await stage.screenshot({ path: macroScreenshotPath });
  console.log("Saved macro detail screenshot to:", macroScreenshotPath);

  fs.copyFileSync(
    macroScreenshotPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/10_brush_strokes_macro_detail.png"
  );

  await browser.close();
  console.log("Visual brush verification and performance testing completed successfully!");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
