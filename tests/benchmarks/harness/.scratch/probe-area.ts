/**
 * Ad-hoc probe: is the zoom-settle stall proportional to the total canvas
 * backing-store area? Clamp every canvas backing store (CSS size untouched) and
 * compare the stall against the untouched baseline.
 */
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
    lastFrameAgeMs() { return performance.now() - last; },
  };
})();
`;

function clampSource(cap: number): string {
  return String.raw`
(() => {
  const CAP = ${cap};
  const proto = HTMLCanvasElement.prototype;
  const wd = Object.getOwnPropertyDescriptor(proto, "width");
  const hd = Object.getOwnPropertyDescriptor(proto, "height");
  globalThis.__clampApplied = !!(wd && wd.set && hd && hd.set);
  if (!globalThis.__clampApplied) return;
  Object.defineProperty(proto, "width", {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { wd.set.call(this, Math.min(v, CAP)); },
  });
  Object.defineProperty(proto, "height", {
    configurable: true, enumerable: hd.enumerable,
    get() { return hd.get.call(this); },
    set(v) { hd.set.call(this, Math.min(v, CAP)); },
  });
})();
`;
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

async function run(label: string, extraInit: string | null): Promise<void> {
  const context: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await context.addInitScript({
    content: `try{localStorage.setItem("toonspectrum-studio-quick-start-dismissed","1");localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed","1");for(const k of Object.keys(localStorage))if(k.startsWith("toonspectrum-studio-autosave"))localStorage.removeItem(k);}catch{}`,
  });
  if (extraInit) await context.addInitScript({ content: extraInit });
  await context.addInitScript({ content: FRAME_PROBE });
  const page: Page = await context.newPage();
  await page.goto(`${origin}studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".konvajs-content", { timeout: 30_000 });
  await page.waitForTimeout(2500);

  await page.mouse.move(686, 550);
  await page.evaluate(() => globalThis.__probe.reset());
  for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, -120);

  const started = Date.now();
  let quiet = 0;
  while (Date.now() - started < 40_000) {
    const age = await page.evaluate(() => globalThis.__probe.lastFrameAgeMs());
    if (age < 60) { if (!quiet) quiet = Date.now(); if (Date.now() - quiet > 900) break; } else quiet = 0;
    await new Promise((r) => setTimeout(r, 120));
  }
  const gap = await page.evaluate(() => globalThis.__probe.maxGap());
  const state = await page.evaluate(() => {
    const root = document.querySelector(".konvajs-content");
    const label = [...document.querySelectorAll("button,span,div")].map((n) => n.textContent?.trim() ?? "").find((t) => /^\d{2,4}%$/.test(t)) ?? null;
    const all = [...document.querySelectorAll("canvas")];
    return {
      zoom: label,
      clampApplied: (globalThis as { __clampApplied?: boolean }).__clampApplied ?? null,
      konvaCss: root ? `${root.style.width}x${root.style.height}` : null,
      konvaBacking: root ? [...root.querySelectorAll("canvas")].map((c) => `${c.width}x${c.height}`) : [],
      totalMpx: Math.round(all.reduce((s, c) => s + c.width * c.height, 0) / 1e6),
    };
  });
  console.log(`${label}: maxGapMs=${gap.toFixed(0)} settleWall=${Date.now() - started}ms state=${JSON.stringify(state)}`);
  await context.close();
}

await run("baseline", null);
await run("backing store capped at 1600px/axis", clampSource(1600));
await run("backing store capped at 2400px/axis", clampSource(2400));
await run("baseline (repeat)", null);

await browser.close();
server.kill("SIGKILL");
