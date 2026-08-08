/** Ad-hoc probe: attribute the zoom settle stall to backing-store growth. */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { chromium, type Page } from "playwright";

const REPO_ROOT = new URL("../../../..", import.meta.url).pathname;

const port = await new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const a = s.address();
    if (!a || typeof a !== "object") return reject(new Error("no port"));
    s.close(() => resolve(a.port));
  });
});
const origin = `http://127.0.0.1:${port}/`;
const server = spawn(
  process.execPath,
  [`${REPO_ROOT}node_modules/vite/bin/vite.js`, "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
  { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "ignore"] },
);
for (let i = 0; i < 200; i += 1) {
  try {
    const r = await fetch(origin, { redirect: "manual" });
    if (r.status < 500) break;
  } catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 120));
}

const FRAME_PROBE = String.raw`
(() => {
  const g = globalThis;
  g.__probe = {
    frames: [],
    running: false,
    start() { this.frames = []; this.running = true; let last = performance.now();
      const tick = (t) => { if (!this.running) return; this.frames.push(t - last); last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick); },
    stop() { this.running = false; return this.frames.slice(); },
    stageInfo() {
      const root = document.querySelector(".konvajs-content");
      if (!root) return null;
      const canvases = [...root.querySelectorAll("canvas")];
      return {
        cssW: root.style.width, cssH: root.style.height,
        count: canvases.length,
        sizes: canvases.map((c) => c.width + "x" + c.height),
        totalMpx: Math.round(canvases.reduce((s, c) => s + c.width * c.height, 0) / 1e6),
      };
    },
  };
})();
`;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

async function boot(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await context.addInitScript({
    content: `try{localStorage.setItem("toonspectrum-studio-quick-start-dismissed","1");localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed","1");for(const k of Object.keys(localStorage))if(k.startsWith("toonspectrum-studio-autosave"))localStorage.removeItem(k);}catch{}`,
  });
  await context.addInitScript({ content: FRAME_PROBE });
  const page = await context.newPage();
  await page.goto(`${origin}studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".konvajs-content", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  return { page, close: () => context.close() };
}

function summarize(frames: number[]): string {
  const s = [...frames].sort((a, b) => a - b);
  const max = s.at(-1) ?? 0;
  const over = frames.filter((f) => f > 50).length;
  return `n=${frames.length} p50=${(s[Math.floor(s.length / 2)] ?? 0).toFixed(1)} max=${max.toFixed(1)} framesOver50ms=${over}`;
}

/* --- E0: real wheel zoom to 500%, measure settle --- */
{
  const { page, close } = await boot();
  console.log("E0 before", JSON.stringify(await page.evaluate(() => globalThis.__probe.stageInfo())));
  const box = await page.locator(".konvajs-content").boundingBox();
  await page.mouse.move(720, 550);
  await page.evaluate(() => globalThis.__probe.start());
  for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(6000);
  const frames = await page.evaluate(() => globalThis.__probe.stop());
  console.log("E0 wheel-zoom settle:", summarize(frames), "box", JSON.stringify(box));
  console.log("E0 after", JSON.stringify(await page.evaluate(() => globalThis.__probe.stageInfo())));
  await close();
}

/* --- E1: no React at all; resize the existing Konva canvases directly to the 500% size --- */
{
  const { page, close } = await boot();
  await page.evaluate(() => globalThis.__probe.start());
  await page.waitForTimeout(600);
  const t = await page.evaluate(() => {
    const root = document.querySelector(".konvajs-content");
    const canvases = [...root.querySelectorAll("canvas")];
    const started = performance.now();
    for (const c of canvases) { c.width = 4620; c.height = 6930; c.style.width = "4620px"; c.style.height = "6930px"; }
    root.style.width = "4620px"; root.style.height = "6930px";
    return performance.now() - started;
  });
  await page.waitForTimeout(6000);
  const frames = await page.evaluate(() => globalThis.__probe.stop());
  console.log(`E1 direct canvas resize (2 canvases -> 4620x6930): jsMs=${t.toFixed(1)}`, summarize(frames));
  await close();
}

/* --- E2: same total pixels but drawn content? just one canvas --- */
{
  const { page, close } = await boot();
  await page.evaluate(() => globalThis.__probe.start());
  await page.waitForTimeout(600);
  const t = await page.evaluate(() => {
    const root = document.querySelector(".konvajs-content");
    const c = root.querySelector("canvas");
    const started = performance.now();
    c.width = 4620; c.height = 6930; c.style.width = "4620px"; c.style.height = "6930px";
    return performance.now() - started;
  });
  await page.waitForTimeout(6000);
  const frames = await page.evaluate(() => globalThis.__probe.stop());
  console.log(`E2 single canvas resize: jsMs=${t.toFixed(1)}`, summarize(frames));
  await close();
}

/* --- E3: does Konva's own draw dominate? resize + full redraw through Konva --- */
{
  const { page, close } = await boot();
  await page.evaluate(() => globalThis.__probe.start());
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const root = document.querySelector(".konvajs-content");
    const canvases = [...root.querySelectorAll("canvas")];
    const started = performance.now();
    for (const c of canvases) {
      c.width = 4620; c.height = 6930; c.style.width = "4620px"; c.style.height = "6930px";
      const ctx = c.getContext("2d");
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(0, 0, 4620, 6930);
    }
    root.style.width = "4620px"; root.style.height = "6930px";
    return performance.now() - started;
  });
  await page.waitForTimeout(6000);
  const frames = await page.evaluate(() => globalThis.__probe.stop());
  console.log(`E3 resize + full fill: jsMs=${info.toFixed(1)}`, summarize(frames));
  await close();
}

await browser.close();
server.kill("SIGKILL");
