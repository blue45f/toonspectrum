/**
 * Ad-hoc probe: clamp only the Pixi scene-overlay canvas backing store and see
 * whether the zoom-settle stall survives. Everything else (Konva stage growth,
 * React commit, scroll anchoring) runs untouched.
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

/**
 * Clamp the backing store of any canvas that carries a WebGL/WebGPU context to
 * the visible viewport. Konva's 2D layers are untouched.
 */
const CLAMP_GL = String.raw`
(() => {
  const glCanvases = new WeakSet();
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (typeof type === "string" && /webgl|webgpu/i.test(type)) glCanvases.add(this);
    return originalGetContext.call(this, type, ...rest);
  };
  const proto = HTMLCanvasElement.prototype;
  for (const key of ["width", "height"]) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() { return descriptor.get.call(this); },
      set(value) {
        const cap = key === "width" ? 1600 : 1200;
        descriptor.set.call(this, glCanvases.has(this) ? Math.min(value, cap) : value);
      },
    });
  }
})();
`;

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
    return {
      zoom: label,
      konva: root ? [...root.querySelectorAll("canvas")].map((c) => `${c.width}x${c.height}`) : [],
      overlay: [...document.querySelectorAll("canvas[data-studio-scene-overlay]")].map((c) => `${c.width}x${c.height}`),
    };
  });
  console.log(`${label}: maxGapMs=${gap.toFixed(0)} settleWall=${Date.now() - started}ms state=${JSON.stringify(state)}`);
  await context.close();
}

await run("baseline", null);
await run("GL canvases clamped to viewport", CLAMP_GL);
await run("baseline (repeat)", null);
await run("GL canvases clamped (repeat)", CLAMP_GL);

await browser.close();
server.kill("SIGKILL");
