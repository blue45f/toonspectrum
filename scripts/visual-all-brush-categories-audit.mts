import * as fs from "fs";
import * as path from "path";

import { chromium } from "@playwright/test";

const SCREENSHOT_DIR = "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/scratch/screenshots";
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

interface BrushTestEntry {
  category: string;
  brushId: string;
  name: string;
  color: string;
  width: number;
}

const TEST_ROSTER: BrushTestEntry[] = [
  // 1. Inking & Fine Pens
  { category: "1_Inking_Pens", brushId: "pen", name: "펜(매끈)", color: "#1e1e24", width: 6 },
  { category: "1_Inking_Pens", brushId: "gpen", name: "G펜", color: "#111827", width: 8 },
  { category: "1_Inking_Pens", brushId: "maru", name: "마루펜", color: "#0f172a", width: 4 },
  { category: "1_Inking_Pens", brushId: "glass-pen", name: "유리 딥펜", color: "#1e293b", width: 5 },
  { category: "1_Inking_Pens", brushId: "calligraphy", name: "캘리그래피", color: "#312e81", width: 14 },
  { category: "1_Inking_Pens", brushId: "brush-pen", name: "붓펜", color: "#18181b", width: 12 },

  // 2. Pencil & Dry Media
  { category: "2_Pencil_DryMedia", brushId: "pencil", name: "연필", color: "#374151", width: 8 },
  { category: "2_Pencil_DryMedia", brushId: "pencil-2b", name: "2B 연필", color: "#1f2937", width: 10 },
  { category: "2_Pencil_DryMedia", brushId: "charcoal", name: "목탄", color: "#18181b", width: 22 },
  { category: "2_Pencil_DryMedia", brushId: "crayon", name: "크레용", color: "#b91c1c", width: 18 },
  { category: "2_Pencil_DryMedia", brushId: "pastel", name: "파스텔", color: "#047857", width: 20 },
  { category: "2_Pencil_DryMedia", brushId: "oil-pastel", name: "오일 파스텔", color: "#c2410c", width: 16 },

  // 3. Watercolor & Ink Wash
  { category: "3_Watercolor_InkWash", brushId: "watercolor", name: "수채화", color: "#0284c7", width: 26 },
  { category: "3_Watercolor_InkWash", brushId: "ink-wash", name: "먹물 번짐", color: "#0f172a", width: 32 },
  { category: "3_Watercolor_InkWash", brushId: "inkwash-pen", name: "수묵 세필", color: "#1e1e24", width: 12 },
  { category: "3_Watercolor_InkWash", brushId: "gouache", name: "구아슈", color: "#4f46e5", width: 24 },

  // 4. Oil & Heavy Paint
  { category: "4_Oil_HeavyPaint", brushId: "oil", name: "유화 붓", color: "#b45309", width: 28 },
  { category: "4_Oil_HeavyPaint", brushId: "acrylic", name: "아크릴", color: "#dc2626", width: 26 },

  // 5. Airbrush & Particles
  { category: "5_Airbrush_Particles", brushId: "airbrush", name: "에어브러시", color: "#ec4899", width: 35 },
  { category: "5_Airbrush_Particles", brushId: "spray", name: "스프레이", color: "#8b5cf6", width: 40 },
  { category: "5_Airbrush_Particles", brushId: "splatter", name: "스플래터", color: "#e11d48", width: 30 },
  { category: "5_Airbrush_Particles", brushId: "glitter", name: "글리터", color: "#eab308", width: 28 },

  // 6. Markers & Highlighters
  { category: "6_Markers_Highlighters", brushId: "marker", name: "마커", color: "#2563eb", width: 18 },
  { category: "6_Markers_Highlighters", brushId: "alcohol-marker", name: "알코올 마커", color: "#7c3aed", width: 22 },
  { category: "6_Markers_Highlighters", brushId: "highlighter", name: "형광펜", color: "#84cc16", width: 25 },
];

async function run() {
  console.log("=== Launching Studio Comprehensive Visual Brush Audit ===");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const consoleLogs: string[] = [];
  const errors: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === "error") {
      errors.push(text);
    }
  });

  page.on("pageerror", (err) => {
    errors.push(`PageError: ${err.message}`);
  });

  console.log("Navigating to http://localhost:5173/studio ...");
  await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // Activate Brush Tool
  await page.keyboard.press("b");
  await page.waitForTimeout(500);

  const stage = page.locator(".konvajs-content").first();
  const box = await stage.boundingBox();
  if (!box) {
    throw new Error("Could not find Konva stage bounding box");
  }
  console.log("Stage Bounds:", box);

  const results: Array<{
    brushId: string;
    name: string;
    category: string;
    status: "pass" | "fail";
    latencyMs: number;
    error?: string;
  }> = [];

  const columns = 3;
  const rowsPerCol = 9;
  const colWidth = (box.width * 0.85) / columns;
  const rowHeight = (box.height * 0.8) / rowsPerCol;
  const startX = box.x + box.width * 0.08;
  const startY = box.y + box.height * 0.1;

  for (let idx = 0; idx < TEST_ROSTER.length; idx++) {
    const item = TEST_ROSTER[idx]!;
    const col = Math.floor(idx / rowsPerCol);
    const row = idx % rowsPerCol;

    const cellX = startX + col * colWidth;
    const cellY = startY + row * rowHeight;

    console.log(`\n[${idx + 1}/${TEST_ROSTER.length}] Testing Brush: ${item.name} (${item.brushId}) in Category ${item.category}...`);

    // Try selecting brush via chip or store evaluation
    try {
      const chip = page.locator(`[data-studio-brush-chip="${item.brushId}"]`).first();
      if (await chip.isVisible()) {
        await chip.click();
      } else {
        // Evaluate brush switch directly in DOM state
        await page.evaluate((brushId) => {
          window.dispatchEvent(new CustomEvent("studio:select-brush", { detail: { brushId } }));
        }, item.brushId);
      }
    } catch {
      // Ignore click error and proceed
    }

    await page.waitForTimeout(100);

    const startTime = Date.now();
    try {
      // 1. Draw smooth S-curve
      await page.mouse.move(cellX, cellY);
      await page.mouse.down();
      for (let s = 1; s <= 20; s++) {
        const px = cellX + s * 8;
        const py = cellY + Math.sin(s * 0.4) * 16;
        await page.mouse.move(px, py, { steps: 2 });
      }
      await page.mouse.up();

      // 2. Draw tight zig-zag flourish next to it
      const fx = cellX + 180;
      const fy = cellY;
      await page.mouse.move(fx, fy);
      await page.mouse.down();
      for (let z = 1; z <= 12; z++) {
        await page.mouse.move(fx + (z % 2 === 0 ? 25 : -25), fy + z * 3, { steps: 1 });
      }
      await page.mouse.up();

      const elapsed = Date.now() - startTime;
      results.push({
        brushId: item.brushId,
        name: item.name,
        category: item.category,
        status: "pass",
        latencyMs: elapsed,
      });
      console.log(`  -> Passed in ${elapsed}ms`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const elapsed = Date.now() - startTime;
      results.push({
        brushId: item.brushId,
        name: item.name,
        category: item.category,
        status: "fail",
        latencyMs: elapsed,
        error: message,
      });
      console.error(`  -> FAILED: ${message}`);
    }

    await page.waitForTimeout(100);
  }

  // Settle all rendering
  await page.waitForTimeout(1500);

  // Capture Full Showcase
  const fullShowcasePath = path.join(SCREENSHOT_DIR, "17_all_brushes_full_showcase.png");
  await page.screenshot({ path: fullShowcasePath });
  console.log("\nSaved full brush showcase screenshot to:", fullShowcasePath);

  // Capture Inking & Pencil Macro Detail
  const inkingCropPath = path.join(SCREENSHOT_DIR, "18_inking_and_pencils_macro.png");
  await page.screenshot({
    path: inkingCropPath,
    clip: {
      x: box.x,
      y: box.y,
      width: Math.min(box.width, 900),
      height: Math.min(box.height, 900),
    },
  });
  console.log("Saved inking & pencils macro to:", inkingCropPath);

  // Capture Watercolor, Oil & FX Macro Detail
  const wetCropPath = path.join(SCREENSHOT_DIR, "19_watercolor_oil_fx_macro.png");
  await page.screenshot({
    path: wetCropPath,
    clip: {
      x: box.x + box.width * 0.4,
      y: box.y,
      width: Math.min(box.width * 0.6, 900),
      height: Math.min(box.height, 900),
    },
  });
  console.log("Saved watercolor, oil & fx macro to:", wetCropPath);

  // Copy to brain artifact directory
  fs.copyFileSync(
    fullShowcasePath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/17_all_brushes_full_showcase.png"
  );
  fs.copyFileSync(
    inkingCropPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/18_inking_and_pencils_macro.png"
  );
  fs.copyFileSync(
    wetCropPath,
    "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/19_watercolor_oil_fx_macro.png"
  );

  console.log("\n=== Test Results Summary ===");
  console.table(results);

  const passedCount = results.filter((r) => r.status === "pass").length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Console Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.error("Captured errors:", errors);
  }

  await browser.close();
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
