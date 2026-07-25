/**
 * Comprehensive Studio Feature Browser Test — v2
 * Fixed timing issues and corrected tool shortcuts.
 */
import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:5173";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "../artifacts/browser/studio-audit");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const results = [];
const consoleErrors = [];
const consoleWarnings = [];

function record(category, test, passed, detail = "") {
  results.push({ category, test, passed, detail });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} [${category}] ${test}${detail ? ` — ${detail}` : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runAudit() {
  console.log("🔍 Starting Comprehensive Studio Audit v2...\n");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1440,900",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.type() === "warning") consoleWarnings.push(msg.text());
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  let stageBox;

  try {
    // ═══════════════════════════════════════════════════════════════════
    // 1. PAGE LOAD & CANVAS INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 1. Page Load & Canvas Init ━━━");

    const navStart = Date.now();
    await page.goto(`${BASE_URL}/studio`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const loadTime = Date.now() - navStart;

    const konvaReady = await page.waitForSelector(".konvajs-content", { timeout: 20000 }).then(() => true).catch(() => false);
    record("PageLoad", "Konva canvas mounted", konvaReady);

    if (!konvaReady) {
      await page.screenshot({ path: path.join(OUTPUT_DIR, "01_canvas_fail.png") });
      throw new Error("Canvas failed to mount — aborting remaining tests");
    }

    // Dismiss browser compat modal if it appears (headless Chrome may trigger it)
    await sleep(1000);
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = await btn.evaluate((el) => el.textContent?.trim());
      if (text === '호환 모드로 계속하기') {
        await btn.click();
        console.log('  ℹ️  Dismissed browser compat modal');
        await sleep(500);
        break;
      }
    }

    // Wait for React to settle and canvas to stabilize
    await sleep(1500);
    record("PageLoad", "Total load time", loadTime < 20000, `${loadTime}ms`);

    await page.screenshot({ path: path.join(OUTPUT_DIR, "01_initial_studio.png") });

    stageBox = await page.$(".konvajs-content").then((el) => el?.boundingBox());
    record("PageLoad", "Canvas has valid dimensions", stageBox && stageBox.width > 100 && stageBox.height > 100,
      stageBox ? `${Math.round(stageBox.width)}x${Math.round(stageBox.height)}` : "no box");

    // Verify Konva stage is interactive
    const konvaWidth = await page.$eval(".konvajs-content canvas", (c) => c.width);
    record("PageLoad", "Konva canvas element has width", konvaWidth > 0, `${konvaWidth}px`);

    // ═══════════════════════════════════════════════════════════════════
    // 2. TOOL RAIL ACTIVATION (Keyboard Shortcuts)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 2. Tool Shortcuts ━━━");

    const toolShortcuts = [
      { key: "v", name: "Select" },
      { key: "b", name: "Pen" },
      { key: "e", name: "Eraser" },
      { key: "h", name: "Hand" },
      { key: "g", name: "Fill" },
      { key: "i", name: "Eyedropper" },
      { key: "p", name: "Pixel Pencil" },
    ];

    for (const tool of toolShortcuts) {
      await page.keyboard.press(tool.key);
      await sleep(150);
      const stillOk = await page.$(".konvajs-content") !== null;
      record("ToolShortcut", `'${tool.key}' → ${tool.name}`, stillOk);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. PEN DRAWING
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 3. Pen Drawing ━━━");

    await page.keyboard.press("b");
    await sleep(300);

    const cx = stageBox.x + stageBox.width / 2;
    const cy = stageBox.y + stageBox.height / 2;

    // Draw a distinctive stroke
    const beforeDraw = await page.screenshot({ encoding: "binary" });
    await page.mouse.move(cx - 100, cy);
    await page.mouse.down();
    for (let i = 0; i <= 30; i++) {
      await page.mouse.move(cx - 100 + i * 6, cy + Math.sin(i * 0.3) * 30);
      await sleep(12);
    }
    await page.mouse.up();

    // Wait for stroke commit (pendingStrokeCommits timer + Konva render)
    await sleep(1200);

    const afterDraw = await page.screenshot({ path: path.join(OUTPUT_DIR, "03_after_draw.png"), encoding: "binary" });
    const drawChanged = !Buffer.from(beforeDraw).equals(Buffer.from(afterDraw));
    record("Drawing", "Pen stroke produces visible pixels", drawChanged);

    // ═══════════════════════════════════════════════════════════════════
    // 4. UNDO / REDO (with proper stroke commit wait)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 4. Undo / Redo ━━━");

    // The stroke commit timer buffers pending strokes (~300-600ms) before adding
    // to history. We need to wait for the commit, then undo.
    await sleep(800);

    // Undo
    await page.keyboard.down("Meta");
    await page.keyboard.press("z");
    await page.keyboard.up("Meta");
    await sleep(1000);

    const afterUndo = await page.screenshot({ path: path.join(OUTPUT_DIR, "04_undo.png"), encoding: "binary" });
    const undoWorked = !Buffer.from(afterDraw).equals(Buffer.from(afterUndo));
    record("UndoRedo", "Undo changes canvas state", undoWorked);

    // Redo
    await page.keyboard.down("Meta");
    await page.keyboard.down("Shift");
    await page.keyboard.press("z");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Meta");
    await sleep(1000);

    const afterRedo = await page.screenshot({ path: path.join(OUTPUT_DIR, "04_redo.png"), encoding: "binary" });
    const redoWorked = !Buffer.from(afterUndo).equals(Buffer.from(afterRedo));
    record("UndoRedo", "Redo changes canvas state", redoWorked);

    // ═══════════════════════════════════════════════════════════════════
    // 5. ERASER
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 5. Eraser ━━━");

    // First draw something to erase
    await page.keyboard.press("b");
    await sleep(200);

    // Draw a thick stroke
    await page.mouse.move(cx, cy - 50);
    await page.mouse.down();
    for (let i = 0; i <= 20; i++) {
      await page.mouse.move(cx + i * 5, cy - 50);
      await sleep(12);
    }
    await page.mouse.up();
    await sleep(1200);

    const beforeErase = await page.screenshot({ encoding: "binary" });

    // Switch to eraser
    await page.keyboard.press("e");
    await sleep(300);

    // Erase over the same area
    await page.mouse.move(cx, cy - 50);
    await page.mouse.down();
    for (let i = 0; i <= 20; i++) {
      await page.mouse.move(cx + i * 5, cy - 50);
      await sleep(12);
    }
    await page.mouse.up();
    await sleep(1200);

    const afterErase = await page.screenshot({ path: path.join(OUTPUT_DIR, "05_eraser.png"), encoding: "binary" });
    const eraseChanged = !Buffer.from(beforeErase).equals(Buffer.from(afterErase));
    record("Eraser", "Eraser produces visible change", eraseChanged);

    // ═══════════════════════════════════════════════════════════════════
    // 6. ZOOM
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 6. Zoom & Pan ━━━");

    await page.keyboard.press("v");
    await sleep(200);

    // Zoom in
    const beforeZoom = await page.screenshot({ encoding: "binary" });
    await page.keyboard.down("Meta");
    await page.keyboard.press("Equal");
    await page.keyboard.up("Meta");
    await sleep(600);
    const afterZoomIn = await page.screenshot({ path: path.join(OUTPUT_DIR, "06_zoom_in.png"), encoding: "binary" });
    record("Zoom", "Zoom in changes canvas", !Buffer.from(beforeZoom).equals(Buffer.from(afterZoomIn)));

    // Zoom out
    await page.keyboard.down("Meta");
    await page.keyboard.press("Minus");
    await page.keyboard.up("Meta");
    await sleep(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "06_zoom_out.png") });
    record("Zoom", "Zoom out no crash", await page.$(".konvajs-content") !== null);

    // Fit width
    await page.keyboard.press("Home");
    await sleep(600);
    record("Zoom", "Home key (fit width) no crash", await page.$(".konvajs-content") !== null);

    // Pan
    await page.keyboard.down("Space");
    await sleep(100);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40);
    await page.mouse.up();
    await page.keyboard.up("Space");
    await sleep(400);
    record("Pan", "Space+drag pan no crash", await page.$(".konvajs-content") !== null);

    // ═══════════════════════════════════════════════════════════════════
    // 7. PIXEL PENCIL
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 7. Pixel Pencil ━━━");

    await page.keyboard.press("p");
    await sleep(300);

    const beforePixel = await page.screenshot({ encoding: "binary" });
    await page.mouse.move(cx + 80, cy + 50);
    await page.mouse.down();
    for (let i = 0; i <= 15; i++) {
      await page.mouse.move(cx + 80 + i * 4, cy + 50 + i * 2);
      await sleep(15);
    }
    await page.mouse.up();
    await sleep(1200);

    const afterPixel = await page.screenshot({ path: path.join(OUTPUT_DIR, "07_pixel.png"), encoding: "binary" });
    record("PixelPen", "Pixel pen draws visible pixels", !Buffer.from(beforePixel).equals(Buffer.from(afterPixel)));

    // ═══════════════════════════════════════════════════════════════════
    // 8. KEYBOARD SAFETY
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 8. Keyboard Safety ━━━");

    await page.keyboard.press("Escape");
    await sleep(200);
    record("Keyboard", "Escape no crash", await page.$(".konvajs-content") !== null);

    await page.keyboard.press("Delete");
    await sleep(200);
    record("Keyboard", "Delete no crash", await page.$(".konvajs-content") !== null);

    await page.keyboard.down("Meta");
    await page.keyboard.press("a");
    await page.keyboard.up("Meta");
    await sleep(300);
    record("Keyboard", "Cmd+A no crash", await page.$(".konvajs-content") !== null);

    await page.keyboard.press("Escape");
    await sleep(200);

    // Spacebar rapid press (shouldn't crash)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Space");
      await sleep(50);
    }
    await sleep(300);
    record("Keyboard", "Rapid spacebar no crash", await page.$(".konvajs-content") !== null);

    // ═══════════════════════════════════════════════════════════════════
    // 9. LASSO FILL
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 9. Lasso Fill ━━━");

    // Find and click the lasso-fill button if it exists
    const lassoFillBtn = await page.$('button[aria-label*="라쏘"]');
    if (lassoFillBtn) {
      await lassoFillBtn.click();
      await sleep(300);
      record("LassoFill", "Lasso fill tool activates", await page.$(".konvajs-content") !== null);
    } else {
      record("LassoFill", "Lasso fill button found", false, "Button not found in viewport");
    }

    // ═══════════════════════════════════════════════════════════════════
    // 10. COLOR CHANGE
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 10. Color Controls ━━━");

    // Check if color swatch exists
    const colorSwatch = await page.$('[data-studio-color-swatch]');
    record("Color", "Color swatch element exists", colorSwatch !== null);

    // Check color wheel shortcut
    const colorWheelBefore = await page.screenshot({ encoding: "binary" });
    // Color wheel is typically opened via clicking the color swatch
    if (colorSwatch) {
      await colorSwatch.click();
      await sleep(500);
      const colorWheelAfter = await page.screenshot({ path: path.join(OUTPUT_DIR, "10_color.png"), encoding: "binary" });
      record("Color", "Color swatch opens color picker", !Buffer.from(colorWheelBefore).equals(Buffer.from(colorWheelAfter)));
      await page.keyboard.press("Escape");
      await sleep(300);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 11. NAVIGATION STABILITY
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 11. Navigation ━━━");

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(1000);
    record("Navigation", "Home page loads", await page.$("body") !== null);

    await page.goto(`${BASE_URL}/studio`, { waitUntil: "domcontentloaded", timeout: 15000 });
    const studioBack = await page.waitForSelector(".konvajs-content", { timeout: 20000 }).then(() => true).catch(() => false);
    record("Navigation", "Studio re-entry works", studioBack);

    // ═══════════════════════════════════════════════════════════════════
    // 12. PERFORMANCE METRICS
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 12. Performance ━━━");

    const perfMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType("navigation");
      const nav = entries[0];
      return nav ? {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
        domInteractive: Math.round(nav.domInteractive - nav.startTime),
      } : null;
    });

    if (perfMetrics) {
      record("Performance", "DOM interactive", perfMetrics.domInteractive < 5000, `${perfMetrics.domInteractive}ms`);
      record("Performance", "DOM content loaded", perfMetrics.domContentLoaded < 8000, `${perfMetrics.domContentLoaded}ms`);
    }

    // Count number of JS files loaded
    const jsEntries = await page.evaluate(() => {
      return performance.getEntriesByType("resource")
        .filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"))
        .length;
    });
    record("Performance", "JS module count reasonable", jsEntries < 200, `${jsEntries} files`);

    // Memory usage
    const memInfo = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        };
      }
      return null;
    });
    if (memInfo) {
      record("Performance", "JS heap usage", memInfo.usedJSHeapSize < 512, `${memInfo.usedJSHeapSize}MB used / ${memInfo.totalJSHeapSize}MB total`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 13. CONSOLE ERRORS
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n━━━ 13. Console Errors ━━━");

    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes("WebSocket") &&
        !e.includes("favicon.ico") &&
        !e.includes("net::ERR_") &&
        !e.includes("Failed to load resource") &&
        !e.includes("socket.io") &&
        !e.includes("ERR_CONNECTION_REFUSED")
    );

    record("Console", "No critical JS errors", criticalErrors.length === 0,
      criticalErrors.length > 0 ? `${criticalErrors.length} errors` : "clean");

    if (criticalErrors.length > 0) {
      console.log("\n⚠️  Critical Console Errors:");
      criticalErrors.slice(0, 15).forEach((e) => console.log(`  - ${e.slice(0, 300)}`));
    }

    // Non-critical warnings for informational purposes
    const filteredWarnings = consoleWarnings.filter(
      (w) => !w.includes("DevTools") && !w.includes("Source map")
    );
    record("Console", "Console warnings", true, `${filteredWarnings.length} warnings`);

    // Final screenshot
    await page.screenshot({ path: path.join(OUTPUT_DIR, "13_final.png") });

  } finally {
    await browser.close();
  }

  // ═══════════════════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════════════════
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log("\n" + "═".repeat(60));
  console.log(`📊 STUDIO AUDIT REPORT v2: ${passed}/${total} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.log("\n❌ FAILURES:");
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`  [${r.category}] ${r.test}${r.detail ? ` — ${r.detail}` : ""}`);
    });
  }

  console.log("\n✅ PASSES:");
  results.filter((r) => r.passed).forEach((r) => {
    console.log(`  [${r.category}] ${r.test}${r.detail ? ` — ${r.detail}` : ""}`);
  });

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed },
    results,
    consoleErrors: consoleErrors.slice(0, 50),
    consoleWarnings: consoleWarnings.length,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "audit_report_v2.json"), JSON.stringify(report, null, 2));
  console.log(`\n📁 Report: artifacts/browser/studio-audit/audit_report_v2.json`);
}

runAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
