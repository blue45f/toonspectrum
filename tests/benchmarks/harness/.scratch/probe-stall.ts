/** Ad-hoc probe: bisect the zoom-settle compositor stall. */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { chromium, type BrowserContext, type Page } from "playwright";

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
  const frames = [];
  let last = performance.now();
  const tick = (t) => { frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  g.__probe = {
    reset() { frames.length = 0; },
    maxGap() { let m = 0; for (const f of frames) if (f > m) m = f; return m; },
    count() { return frames.length; },
    lastFrameAgeMs() { return performance.now() - last; },
    stageInfo() {
      const root = document.querySelector(".konvajs-content");
      if (!root) return null;
      const canvases = [...root.querySelectorAll("canvas")];
      return { cssW: root.style.width, cssH: root.style.height, count: canvases.length,
        totalMpx: Math.round(canvases.reduce((s, c) => s + c.width * c.height, 0) / 1e6) };
    },
  };
})();
`;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

async function boot(): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await context.addInitScript({
    content: `try{localStorage.setItem("toonspectrum-studio-quick-start-dismissed","1");localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed","1");for(const k of Object.keys(localStorage))if(k.startsWith("toonspectrum-studio-autosave"))localStorage.removeItem(k);}catch{}`,
  });
  await context.addInitScript({ content: FRAME_PROBE });
  const page = await context.newPage();
  await page.goto(`${origin}studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".konvajs-content", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  return { page, context };
}

/** Wait until rAF has been healthy for `quietMs`, then report the worst gap seen. */
async function settleAndReport(page: Page, label: string, budgetMs = 40_000): Promise<void> {
  const started = Date.now();
  let quietSince = 0;
  while (Date.now() - started < budgetMs) {
    const age = await page.evaluate(() => globalThis.__probe.lastFrameAgeMs());
    if (age < 60) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince > 900) break;
    } else {
      quietSince = 0;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  const maxGap = await page.evaluate(() => globalThis.__probe.maxGap());
  const count = await page.evaluate(() => globalThis.__probe.count());
  const info = await page.evaluate(() => globalThis.__probe.stageInfo());
  console.log(`${label}: maxGapMs=${maxGap.toFixed(0)} frames=${count} wall=${Date.now() - started}ms stage=${JSON.stringify(info)}`);
}

async function wheelZoom(page: Page, notches: number): Promise<void> {
  await page.mouse.move(686, 550);
  await page.waitForTimeout(150);
  await page.evaluate(() => globalThis.__probe.reset());
  for (let i = 0; i < notches; i += 1) await page.mouse.wheel(0, -120);
}

interface Variant { readonly label: string; readonly mutate?: string }

const VARIANTS: readonly Variant[] = [
  { label: "A baseline" },
  {
    label: "B no box-shadow on stage wrapper",
    mutate: `document.querySelectorAll('[data-studio-post-processing-scope]').forEach(n => { n.parentElement.style.boxShadow = 'none'; });`,
  },
  {
    label: "C no isolation on stage wrapper",
    mutate: `document.querySelectorAll('[data-studio-post-processing-scope]').forEach(n => { n.parentElement.style.isolation = 'auto'; });`,
  },
  {
    label: "D stage canvases display:none (isolate non-Konva cost)",
    mutate: `document.querySelectorAll('.konvajs-content canvas').forEach(c => { c.style.display = 'none'; });`,
  },
  {
    label: "E only first Konva canvas kept",
    mutate: `[...document.querySelectorAll('.konvajs-content canvas')].slice(1).forEach(c => { c.style.display = 'none'; });`,
  },
  {
    label: "F stage wrapper contain:paint",
    mutate: `document.querySelectorAll('[data-studio-post-processing-scope]').forEach(n => { n.parentElement.style.contain = 'paint'; });`,
  },
];

for (const variant of VARIANTS) {
  const { page, context } = await boot();
  if (variant.mutate) await page.evaluate(variant.mutate);
  await page.waitForTimeout(400);
  await wheelZoom(page, 20);
  await settleAndReport(page, variant.label);
  await context.close();
}

await browser.close();
server.kill("SIGKILL");
