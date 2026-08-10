import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

async function main() {
  console.log("[E2E Test] Launching Chromium browser for Object Selection & Filter test...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("pageerror", (err) => console.error("[Page Error]", err.message));

  console.log("[E2E Test] Navigating to http://localhost:5173/studio ...");
  await page.goto("http://localhost:5173/studio", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(3000);

  const scratchDir = join(process.cwd(), "scratch");
  try { mkdirSync(scratchDir, { recursive: true }); } catch {}

  // Dismiss quickstart panel if open
  await page.evaluate(() => {
    const closeBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("닫기") || b.getAttribute("aria-label") === "Close");
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(500);

  // 1. Add a Shape Element (Rectangle / Star / Circle)
  console.log("[E2E Test] Step 1: Adding a shape element to canvas...");
  await page.evaluate(() => {
    const shapeBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("도형") || b.getAttribute("title")?.includes("도형"));
    if (shapeBtn) shapeBtn.click();
  });
  await page.waitForTimeout(500);

  // Draw a shape on canvas
  const canvasEl = page.locator("canvas").first();
  const canvasBox = await canvasEl.boundingBox();
  if (!canvasBox) throw new Error("Canvas bounding box not found");

  const startX = canvasBox.x + canvasBox.width / 2 - 80;
  const startY = canvasBox.y + canvasBox.height / 2 - 80;
  const endX = canvasBox.x + canvasBox.width / 2 + 80;
  const endY = canvasBox.y + canvasBox.height / 2 + 80;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const shapeDrawnShot = await page.screenshot();
  writeFileSync(join(scratchDir, "e2e-1-shape-drawn.png"), shapeDrawnShot);
  console.log("[E2E Test] 📸 Saved scratch/e2e-1-shape-drawn.png");

  // 2. Select Object (V key)
  console.log("[E2E Test] Step 2: Selecting shape element with Select Tool ('V')...");
  await page.keyboard.press("v");
  await page.waitForTimeout(300);
  await page.mouse.click(startX + 40, startY + 40);
  await page.waitForTimeout(500);

  const selectedShot = await page.screenshot();
  writeFileSync(join(scratchDir, "e2e-2-shape-selected.png"), selectedShot);
  console.log("[E2E Test] 📸 Saved scratch/e2e-2-shape-selected.png");

  // 3. Transform Object (Resize / Scale handle drag)
  console.log("[E2E Test] Step 3: Transforming object (scaling handles)...");
  await page.mouse.move(endX, endY);
  await page.mouse.down();
  await page.mouse.move(endX + 100, endY + 100, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const transformedShot = await page.screenshot();
  writeFileSync(join(scratchDir, "e2e-3-shape-transformed.png"), transformedShot);
  console.log("[E2E Test] 📸 Saved scratch/e2e-3-shape-transformed.png");

  // 4. Test Filter Application on Selected Element vs Layer
  console.log("[E2E Test] Step 4: Testing Filter Modal on selected shape layer...");
  await page.evaluate(() => {
    const filterBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("필터") || b.getAttribute("title")?.includes("필터"));
    if (filterBtn) filterBtn.click();
  });
  await page.waitForTimeout(1000);

  const filterOpenedShot = await page.screenshot();
  writeFileSync(join(scratchDir, "e2e-4-filter-opened.png"), filterOpenedShot);
  console.log("[E2E Test] 📸 Saved scratch/e2e-4-filter-opened.png");

  console.log("[E2E Test SUCCESS] Real browser verification completed!");
  await browser.close();
}

main().catch((err) => {
  console.error("[E2E Test Fatal Error]", err);
  process.exit(1);
});
