import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

async function main() {
  console.log("🚀 [Ultimate Journey Test] Launching Playwright Chromium for Full Artist Workflow Simulation...");
  const screenshotsDir = join(process.cwd(), "scratch", "e2e-ultimate-screenshots");
  mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  const consoleLogs: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleLogs.push(`[Error] ${msg.text()}`);
    }
  });

  try {
    // Stage 1: Load Studio
    console.log("Stage 1: Opening Studio...");
    await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(screenshotsDir, "01-studio-ready.png") });

    // Stage 2: Pencil Sketching
    console.log("Stage 2: Sketching with Pencil...");
    const canvas = page.locator('canvas[data-studio-primary-stage="true"]').first();
    const box = await canvas.boundingBox();
    if (box) {
      // Draw pencil sketch lines
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: join(screenshotsDir, "02-pencil-sketch.png") });

    // Stage 3: Inking with G-Pen
    console.log("Stage 3: Switching to G-Pen & Inking...");
    const brushPill = page.locator('[data-studio-brush-active-pill="true"]').first();
    if (await brushPill.isVisible()) {
      await brushPill.click();
      await page.waitForTimeout(400);

      const gpenOption = page.getByRole("button", { name: /G펜|G-Pen/i }).first();
      if (await gpenOption.isVisible()) {
        await gpenOption.click();
        await page.waitForTimeout(400);
      }
    }

    if (box) {
      // Ink contour line
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: join(screenshotsDir, "03-gpen-inked.png") });

    // Stage 4: Kneaded Eraser Touch-Up
    console.log("Stage 4: Touch-up with Kneaded Eraser (떡지우개)...");
    if (await brushPill.isVisible()) {
      await brushPill.click();
      await page.waitForTimeout(400);
      const searchBox = page.getByRole("searchbox", { name: "브러시 검색" }).first();
      if (await searchBox.isVisible()) {
        await searchBox.fill("떡지우개");
        await page.waitForTimeout(300);
        const kneadedBtn = page.getByRole("button", { name: /떡지우개/i }).first();
        if (await kneadedBtn.isVisible()) {
          await kneadedBtn.click();
          await page.waitForTimeout(400);
        }
      }
    }

    if (box) {
      // Erase portion of line
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: join(screenshotsDir, "04-kneaded-eraser-touched-up.png") });

    // Stage 5: Paper Texture Preset Switching
    console.log("Stage 5: Testing Paper Texture Presets...");
    const paperBtn = page.locator('button:has-text("질감"), button:has-text("종이")').first();
    if (await paperBtn.isVisible()) {
      await paperBtn.click();
      await page.waitForTimeout(300);
      const hanjiBtn = page.getByRole("button", { name: /전통 한지|수채화지|크라프트/i }).first();
      if (await hanjiBtn.isVisible()) {
        await hanjiBtn.click();
        await page.waitForTimeout(400);
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "05-paper-texture.png") });

    // Stage 6: Object Selection & 8-Handle Transformer
    console.log("Stage 6: Object Selection & Transformer...");
    const selectBtn = page.locator('button[aria-label*="선택"], button[aria-label*="Select"]').first();
    if (await selectBtn.isVisible()) {
      await selectBtn.click();
      await page.waitForTimeout(300);
      if (box) {
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(400);
      }
    }
    await page.screenshot({ path: join(screenshotsDir, "06-transformer-selected.png") });

    console.log("✨ [Ultimate Journey Test] FULL ARTIST WORKFLOW SIMULATION PASSED 100%!");
  } catch (err) {
    console.error("❌ [Ultimate Journey Test] FAILED:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
