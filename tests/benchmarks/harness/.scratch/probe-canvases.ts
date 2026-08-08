/** Ad-hoc probe: enumerate every canvas/surface that grows with zoom. */
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
    canvases() {
      return [...document.querySelectorAll("canvas")].map((c) => {
        const p = c.parentElement;
        const attrs = [...c.attributes].map((a) => a.name + "=" + a.value).join(" ").slice(0, 160);
        return {
          w: c.width, h: c.height,
          cssW: Math.round(c.getBoundingClientRect().width),
          cssH: Math.round(c.getBoundingClientRect().height),
          parent: p ? p.tagName + "." + (p.className || "").toString().slice(0, 60) : null,
          attrs,
        };
      });
    },
    bigBoxes() {
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > 2000 || r.height > 2000) {
          const s = getComputedStyle(el);
          out.push({
            tag: el.tagName,
            id: el.id || null,
            data: [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name).join(","),
            cls: (el.className || "").toString().slice(0, 70),
            w: Math.round(r.width), h: Math.round(r.height),
            filter: s.filter, boxShadow: s.boxShadow.slice(0, 40), transform: s.transform.slice(0, 40),
            willChange: s.willChange, isolation: s.isolation, mixBlend: s.mixBlendMode, opacity: s.opacity,
          });
        }
      }
      return out;
    },
  };
})();
`;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
await context.addInitScript({
  content: `try{localStorage.setItem("toonspectrum-studio-quick-start-dismissed","1");localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed","1");for(const k of Object.keys(localStorage))if(k.startsWith("toonspectrum-studio-autosave"))localStorage.removeItem(k);}catch{}`,
});
await context.addInitScript({ content: FRAME_PROBE });
const page: Page = await context.newPage();
await page.goto(`${origin}studio`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".konvajs-content", { timeout: 30_000 });
await page.waitForTimeout(2500);

console.log("BEFORE canvases:", JSON.stringify(await page.evaluate(() => globalThis.__probe.canvases()), null, 1));

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
console.log("maxGapMs", (await page.evaluate(() => globalThis.__probe.maxGap())).toFixed(0));
console.log("AFTER canvases:", JSON.stringify(await page.evaluate(() => globalThis.__probe.canvases()), null, 1));
console.log("AFTER bigBoxes:", JSON.stringify(await page.evaluate(() => globalThis.__probe.bigBoxes()), null, 1));

await browser.close();
server.kill("SIGKILL");
