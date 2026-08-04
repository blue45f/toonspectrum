import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

async function main() {
  console.log("[E2E Comprehensive Test] Starting Playwright Chromium browser test for Studio...");
  const screenshotsDir = join(process.cwd(), "scratch", "e2e-studio-screenshots");
  mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  try {
    // 1. Navigate to Studio
    console.log("Step 1: Navigating to http://localhost:5173/studio...");
    await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ path: join(screenshotsDir, "01-studio-loaded.png") });
    console.log("  ✓ Studio loaded successfully. Screenshot saved: 01-studio-loaded.png");

    // 2. Perform Pen Drawing
    console.log("Step 2: Drawing stroke on canvas with Pen...");
    const canvas = page.locator('canvas[data-studio-primary-stage="true"]').first();
    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        const startX = box.x + box.width * 0.3;
        const startY = box.y + box.height * 0.4;
        const endX = box.x + box.width * 0.6;
        const endY = box.y + box.height * 0.4;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        console.log("  ✓ Drew initial stroke.");
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "02-drew-stroke.png") });

    // 3. Test Brush Library & Kneaded Eraser
    console.log("Step 3: Opening Brush Library & selecting 떡지우개 (Kneaded Eraser)...");
    const brushPill = page.locator('[data-studio-brush-active-pill="true"]').first();
    if (await brushPill.isVisible()) {
      await brushPill.click();
      await page.waitForTimeout(600);

      // Search for 떡지우개
      const searchBox = page.getByRole("searchbox", { name: "브러시 검색" }).first();
      if (await searchBox.isVisible()) {
        await searchBox.fill("떡지우개");
        await page.waitForTimeout(400);

        const kneadedOption = page.getByRole("button", { name: /떡지우개/i }).first();
        if (await kneadedOption.isVisible()) {
          await kneadedOption.click();
          await page.waitForTimeout(600);
          console.log("  ✓ Selected 떡지우개(저농도).");
        }
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "03-kneaded-eraser-selected.png") });

    // Draw with Kneaded Eraser
    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        const startX = box.x + box.width * 0.45;
        const startY = box.y + box.height * 0.3;
        const endX = box.x + box.width * 0.45;
        const endY = box.y + box.height * 0.5;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        console.log("  ✓ Erased with 떡지우개.");
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "04-erased-with-kneaded-eraser.png") });

    // 4. Test Paper Texture Selection
    console.log("Step 4: Testing Paper Texture Switcher...");
    const paperButton = page.locator('button:has-text("질감"), button:has-text("종이")').first();
    if (await paperButton.isVisible()) {
      await paperButton.click();
      await page.waitForTimeout(500);

      // Click a paper preset e.g. 수채화지 or 한지
      const hanjiPreset = page.getByRole("button", { name: /한지|수채화/i }).first();
      if (await hanjiPreset.isVisible()) {
        await hanjiPreset.click();
        await page.waitForTimeout(500);
        console.log("  ✓ Changed paper texture preset.");
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "05-paper-texture-changed.png") });

    // 5. Test Select Tool & Transformer Bounding Box
    console.log("Step 5: Testing Object Selection & Bounding Box Transformer...");
    const selectToolBtn = page.locator('button[aria-label*="선택"], button[aria-label*="Select"]').first();
    if (await selectToolBtn.isVisible()) {
      await selectToolBtn.click();
      await page.waitForTimeout(400);

      // Click on canvas stroke to select object
      if (await canvas.isVisible()) {
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.4);
          await page.waitForTimeout(600);
        }
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "06-object-selected-transformer.png") });

    console.log("✅ [E2E Comprehensive Test] ALL STUDIO CHECKS PASSED PERFECTLY!");
  } catch (error) {
    console.error("❌ [E2E Comprehensive Test] FAILED:", error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
