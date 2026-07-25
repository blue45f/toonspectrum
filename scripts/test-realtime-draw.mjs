import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5173/studio";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "../artifacts/browser");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function runTest() {
  console.log("Launching Browser 1 & Browser 2...");
  const launchOptions = {
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,800",
    ],
  };

  const browser1 = await puppeteer.launch(launchOptions);
  const browser2 = await puppeteer.launch(launchOptions);

  try {
    const page1 = await browser1.newPage();
    const page2 = await browser2.newPage();

    const p2CursorLogs = [];
    page2.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("cursor") || text.includes("StudioLive") || text.includes("socket") || text.includes("draw")) {
        p2CursorLogs.push(text);
        console.log("P2 LOG:", text);
      }
    });

    await page1.setViewport({ width: 1280, height: 800 });
    await page2.setViewport({ width: 1280, height: 800 });

    console.log("Navigating Page 1 & Page 2 to /studio...");
    await Promise.all([
      page1.goto(URL, { waitUntil: "domcontentloaded" }),
      page2.goto(URL, { waitUntil: "domcontentloaded" }),
    ]);

    await Promise.all([
      page1.waitForSelector(".konvajs-content", { timeout: 15000 }),
      page2.waitForSelector(".konvajs-content", { timeout: 15000 }),
    ]);

    // Inject cursor event listener into Page 2 window to inspect real-time WebSocket payloads
    await page2.evaluate(() => {
      window.__p2_cursor_payloads = [];
    });

    await new Promise((r) => setTimeout(r, 3000));

    console.log("Selecting Pen tool on Page 1...");
    await page1.keyboard.press("b");
    await new Promise((r) => setTimeout(r, 400));

    const stage1 = await page1.$(".konvajs-content");
    const box1 = await stage1.boundingBox();

    const startX = box1.x + 200;
    const startY = box1.y + 150;
    const endX = box1.x + 400;
    const endY = box1.y + 300;

    console.log(`Dragging mouse on Page 1 from (${startX}, ${startY}) to (${endX}, ${endY})...`);
    await page1.mouse.move(startX, startY);
    await page1.mouse.down();

    for (let i = 1; i <= 40; i++) {
      const curX = startX + ((endX - startX) * i) / 40;
      const curY = startY + ((endY - startY) * i) / 40;
      await page1.mouse.move(curX, curY);
      await new Promise((r) => setTimeout(r, 30));
    }

    await page2.screenshot({ path: path.join(OUTPUT_DIR, "realtime_draw_p2_mid_drawing.png") });
    await page1.screenshot({ path: path.join(OUTPUT_DIR, "realtime_draw_p1_mid_drawing.png") });

    const p2DOMState = await page2.evaluate(() => {
      const overlay = document.querySelector("[data-studio-live-canvas-overlay]");
      const svg = document.querySelector("svg");
      const polyline = document.querySelector("polyline");
      const bodyHTML = document.body.innerHTML;
      const hasDrawingWord = bodyHTML.includes("그리는 중");
      const cursorElements = document.querySelectorAll(".drop-shadow-\\[0_2px_2px_rgb\\(0_0_0\\/0\\.35\\)\\]");

      return {
        hasOverlayDiv: Boolean(overlay),
        hasSvg: Boolean(svg),
        hasPolyline: Boolean(polyline),
        polylineAttr: polyline ? polyline.getAttribute("points") : null,
        hasDrawingWord,
        cursorCount: cursorElements.length,
      };
    });

    console.log("Page 2 Realtime DOM Inspection:", p2DOMState);

    await page1.mouse.up();
    await new Promise((r) => setTimeout(r, 1500));

    await page2.screenshot({ path: path.join(OUTPUT_DIR, "realtime_draw_p2_final.png") });
    await page1.screenshot({ path: path.join(OUTPUT_DIR, "realtime_draw_p1_final.png") });

  } finally {
    await browser1.close();
    await browser2.close();
  }
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
