/** Ad-hoc probe: why did the narrowed pan run record zero commits? */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { chromium } from "playwright";

const REPO_ROOT = "/Users/hjunkim/WebstormProjects/toonspectrum/.claude/worktrees/toonstudio-v11-codex-master-23fdef";

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
  [`${REPO_ROOT}/node_modules/vite/bin/vite.js`, "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
  { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "ignore"] },
);
for (let i = 0; i < 150; i += 1) {
  try {
    const r = await fetch(origin, { redirect: "manual" });
    if (r.status < 500) break;
  } catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 120));
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
await context.addInitScript({
  content: `
  try {
    localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
    localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("toonspectrum-studio-autosave")) localStorage.removeItem(key);
    }
  } catch {}
  `,
});
const page = await context.newPage();
await page.goto(`${origin}studio`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-studio-canvas-scroll-host], .konvajs-content', { timeout: 30_000 }).catch(() => undefined);
await page.waitForTimeout(2500);

const shot = async (label: string) => {
  const info = await page.evaluate(() => {
    const stage = document.querySelector(".konvajs-content") as HTMLElement | null;
    const layers = stage ? stage.querySelectorAll("canvas").length : 0;
    // find the scroll host: nearest scrollable ancestor of stage
    let node: HTMLElement | null = stage;
    let host: HTMLElement | null = null;
    while (node) {
      if (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) { host = node; break; }
      node = node.parentElement;
    }
    const hand = document.querySelector('[data-studio-rail-tool-id="hand"]') as HTMLElement | null;
    return {
      stageCss: stage ? { w: stage.style.width, h: stage.style.height } : null,
      canvasCount: layers,
      canvasSizes: stage ? [...stage.querySelectorAll("canvas")].map((c) => `${(c as HTMLCanvasElement).width}x${(c as HTMLCanvasElement).height}`) : [],
      host: host ? { sw: host.scrollWidth, cw: host.clientWidth, sh: host.scrollHeight, ch: host.clientHeight, sl: host.scrollLeft, st: host.scrollTop } : null,
      handPressed: hand?.getAttribute("aria-pressed") ?? null,
      zoomLabel: [...document.querySelectorAll("button,span,div")].map((n) => n.textContent?.trim() ?? "").find((t) => /^\d{2,4}%$/.test(t)) ?? null,
    };
  });
  console.log(label, JSON.stringify(info));
};

await shot("initial");
const hand = page.locator('[data-studio-rail-tool-id="hand"]').first();
await hand.click();
await page.waitForTimeout(300);
await shot("after-hand-click");

await browser.close();
server.kill("SIGKILL");
