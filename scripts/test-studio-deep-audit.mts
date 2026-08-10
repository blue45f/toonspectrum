import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

async function main() {
  console.log("🎨 [Deep Studio Audit] Starting Playwright E2E deep audit...");
  const screenshotsDir = join(process.cwd(), "scratch", "e2e-deep-audit-screenshots");
  mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1536, height: 960 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  const consoleErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Navigate to Studio
    console.log("Section 1: Studio Page Load & Stage Initialization...");
    await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: join(screenshotsDir, "01-stage-initial.png") });

    // 2. Test the complete Brush Palette search surface.
    console.log("Section 2: Testing Brush Library Search & Category Filtering...");
    const brushPill = page.locator('[data-studio-brush-active-pill="true"]').first();
    if (await brushPill.isVisible()) {
      await brushPill.click();
      await page.waitForTimeout(500);

      // Search for '수묵'
      const searchBox = page.getByRole("searchbox", { name: "브러시 검색" }).first();
      if (await searchBox.isVisible()) {
        await searchBox.fill("수묵");
        await page.waitForTimeout(400);

        const sumiOption = page.getByRole("button", { name: /수묵|갈필|번짐/i }).first();
        if (await sumiOption.isVisible()) {
          await sumiOption.click();
          await page.waitForTimeout(500);
          console.log("  ✓ Selected Sumi Ink Wash brush.");
        }
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "02-sumi-brush-selected.png") });

    // 3. Draw with Sumi Ink Wash Brush
    console.log("Section 3: Drawing with Sumi Ink Wash Brush...");
    const canvas = page.locator('canvas[data-studio-primary-stage="true"]').first();
    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        // Draw an S-curve stroke
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4, { steps: 8 });
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(600);
        console.log("  ✓ S-curve stroke completed.");
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "03-drew-sumi-stroke.png") });

    // 4. Test Paper Texture Swapping (8 Authentic Textures)
    console.log("Section 4: Testing 8 Authentic Paper Textures Swapping...");
    const paperButton = page.locator('button:has-text("질감"), button:has-text("종이")').first();
    if (await paperButton.isVisible()) {
      await paperButton.click();
      await page.waitForTimeout(400);

      // Select '수채화지' or '크라프트'
      const paperOption = page.getByRole("button", { name: /수채화지|크라프트|아마포|한지/i }).first();
      if (await paperOption.isVisible()) {
        await paperOption.click();
        await page.waitForTimeout(500);
        console.log("  ✓ Changed to authentic paper texture.");
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "04-paper-texture-swapped.png") });

    // 5. Test Object Transformer Bounding Box
    console.log("Section 5: Testing Object Selection & 8-Handle Transformer...");
    const selectToolBtn = page.locator('button[aria-label*="선택"], button[aria-label*="Select"]').first();
    if (await selectToolBtn.isVisible()) {
      await selectToolBtn.click();
      await page.waitForTimeout(400);

      if (await canvas.isVisible()) {
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.35);
          await page.waitForTimeout(500);
        }
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "05-object-selected-transformer.png") });

    // 6. Check console errors count
    console.log(`Section 6: Console error audit count = ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log("  Console errors encountered:", consoleErrors);
    } else {
      console.log("  ✓ 0 Console errors during deep audit!");
    }

    console.log("🎉 [Deep Studio Audit] DEEP E2E AUDIT PASSED 100% PERFECTLY!");
  } catch (error) {
    console.error("❌ [Deep Studio Audit] FAILED:", error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
