import * as fs from "fs";
import * as path from "path";

import { chromium } from "@playwright/test";

const SCREENSHOT_DIR = "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/scratch/screenshots";
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log("Launching Chromium for Ink-Wash & Dip Pen Live/Commit Fidelity Verification...");
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

  // 1. Test Inkwash drawing live vs committed
  console.log("1. Testing Ink-Wash stroke live and committed consistency...");
  const x0 = box.x + box.width * 0.25;
  const y0 = box.y + box.height * 0.35;

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(x0 + i * 8, y0 + Math.sin(i * 0.3) * 30, { steps: 2 });
  }

  // Capture LIVE draft screenshot while mouse is DOWN
  const liveInkWashPath = path.join(SCREENSHOT_DIR, "13_inkwash_live_draft.png");
  await page.screenshot({ path: liveInkWashPath });
  console.log("Captured live ink-wash draft to:", liveInkWashPath);

  // Release mouse to COMMIT
  await page.mouse.up();
  await page.waitForTimeout(800);

  // Capture COMMITTED screenshot after pointer up
  const committedInkWashPath = path.join(SCREENSHOT_DIR, "14_inkwash_committed_settled.png");
  await page.screenshot({ path: committedInkWashPath });
  console.log("Captured committed ink-wash to:", committedInkWashPath);

  // 2. Test Dip Pen / Thin Line Ink drawing live vs committed
  console.log("2. Testing Dip Pen stroke live and committed consistency...");
  const dx0 = box.x + box.width * 0.25;
  const dy0 = box.y + box.height * 0.65;

  await page.mouse.move(dx0, dy0);
  await page.mouse.down();
  for (let j = 1; j <= 40; j++) {
    await page.mouse.move(dx0 + j * 7, dy0 + Math.cos(j * 0.25) * 20, { steps: 2 });
  }

  const liveDipPenPath = path.join(SCREENSHOT_DIR, "15_dippen_live_draft.png");
  await page.screenshot({ path: liveDipPenPath });
  console.log("Captured live dip-pen draft to:", liveDipPenPath);

  await page.mouse.up();
  await page.waitForTimeout(800);

  const committedDipPenPath = path.join(SCREENSHOT_DIR, "16_dippen_committed_settled.png");
  await page.screenshot({ path: committedDipPenPath });
  console.log("Captured committed dip-pen to:", committedDipPenPath);

  // Copy to brain artifacts
  fs.copyFileSync(
    liveInkWashPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/13_inkwash_live_draft.png"
  );
  fs.copyFileSync(
    committedInkWashPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/14_inkwash_committed_settled.png"
  );
  fs.copyFileSync(
    liveDipPenPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/15_dippen_live_draft.png"
  );
  fs.copyFileSync(
    committedDipPenPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/16_dippen_committed_settled.png"
  );

  await browser.close();
  console.log("Live vs Committed fidelity testing completed successfully!");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
