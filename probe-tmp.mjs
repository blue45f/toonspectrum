import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright";

const REPO_ROOT = "/Users/hjunkim/WebstormProjects/toonspectrum/.claude/worktrees/toonstudio-v11-codex-master-23fdef";
const PRIME = `
(() => { try {
  localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
  localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
} catch (e) {} })();
`;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => resolve(a.port)); });
  });
}
async function waitFor(origin) {
  for (let i = 0; i < 200; i += 1) {
    try { const r = await fetch(origin, { redirect: "manual" }); if (r.status < 500) return; } catch {}
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("no server");
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, [join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "ignore"] });
await waitFor(origin);

const width = Number(process.argv[2] ?? 900);
const height = Number(process.argv[3] ?? 900);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 768, isMobile: width < 768 });
await context.addInitScript({ content: PRIME });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(`${origin}studio`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.evaluate("globalThis.__name ??= (target) => target");
await page.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 30000 });
await page.keyboard.press("Escape");
await page.keyboard.press("b");
const exitFs = page.getByRole("button", { name: /전체 화면 드로잉 종료/u }).first();
if (await exitFs.isVisible().catch(() => false)) { await exitFs.click(); console.log("exited canvas-only"); }
await page.waitForTimeout(500);
for (let i = 0; i < 3; i += 1) {
  const sheet = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[role="dialog"], [data-presentation="bottom-sheet"]')];
    const open = nodes.filter((n) => n.getBoundingClientRect().width > 100);
    return open.map((n) => (n.getAttribute("aria-label") || "").slice(0, 30));
  });
  if (sheet.length === 0) break;
  console.log("open sheet:", sheet);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
}
console.log("pen pressed after escape:", await page.evaluate(() => [...document.querySelectorAll('[aria-pressed="true"]')].map((n) => (n.getAttribute("aria-label") || n.textContent || "").trim().slice(0, 20))));
await page.waitForTimeout(300);

const box = await page.locator(".konvajs-content").first().boundingBox();
const seed = { x: (Math.max(box.x, 0) + Math.min(box.x + box.width, width)) / 2, y: (Math.max(box.y, 0) + Math.min(box.y + box.height, height)) / 2 };
const anchor = await page.evaluate(({ seed, width, height }) => {
  const stage = document.querySelector(".konvajs-content");
  const hits = (x, y) => { const e = document.elementFromPoint(x, y); return e && (stage === e || stage.contains(e)); };
  if (hits(seed.x, seed.y)) return seed;
  for (let r = 40; r <= 420; r += 40) for (let s = 0; s < 16; s += 1) {
    const a = (s / 16) * Math.PI * 2;
    const x = seed.x + Math.cos(a) * r, y = seed.y + Math.sin(a) * r;
    if (x < 8 || y < 8 || x > width - 8 || y > height - 8) continue;
    if (hits(x, y)) return { x, y };
  }
  return null;
}, { seed, width, height });
console.log("stage", box, "seed", seed, "anchor", anchor);

const ox = anchor.x - 36, oy = anchor.y + 12;
console.log("elementFromPoint at stroke origin:", await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return el ? `${el.tagName}.${String(el.className).slice(0, 60)} aria=${el.getAttribute("aria-label")}` : "none";
}, [ox, oy]));
await page.mouse.move(ox, oy);
await page.waitForTimeout(200);
console.log("hud rect:", await page.evaluate(() => {
  const h = document.querySelector('[data-studio-brush-hud="true"]');
  return h ? { vis: h.style.visibility, t: h.style.transform } : "none";
}));
await page.mouse.down();
for (let i = 1; i <= 8; i += 1) { await page.mouse.move(ox + (72 * i) / 8, oy + (48 * i) / 8); await page.waitForTimeout(10); }
await page.mouse.up();
await page.waitForTimeout(500);

console.log("undo buttons:", await page.evaluate(() => [...document.querySelectorAll("button")].filter((n) => /되돌리|실행 취소|Undo/i.test(n.getAttribute("aria-label") || n.textContent || "")).map((n) => `${(n.getAttribute("aria-label") || n.textContent || "").trim().slice(0,24)}:${n.disabled}`)));
await page.keyboard.press("v");
await page.waitForTimeout(250);
await page.mouse.click(ox + 36, oy + 24);
await page.waitForTimeout(600);
console.log("after click, bar:", await page.evaluate(() => {
  const bar = document.querySelector('[data-studio-selection-context-bar="true"]');
  return bar ? bar.style.visibility : "not mounted";
}));
// marquee fallback
await page.mouse.move(ox - 50, oy - 40);
await page.mouse.down();
await page.mouse.move(ox + 130, oy + 100, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(600);
console.log("selection bar?", await page.evaluate(() => {
  const bar = document.querySelector('[data-studio-selection-context-bar="true"]');
  return bar ? { vis: bar.style.visibility, t: bar.style.transform, side: bar.dataset.studioSelectionBarSide } : "not mounted";
}));

await page.mouse.move(4, 4);
await page.waitForTimeout(150);
const work = page.getByRole("button", { name: /^작업/u }).first();
if (await work.isVisible().catch(() => false)) { await work.click(); console.log("clicked 작업"); await page.waitForTimeout(600);
  console.log("after 작업, controls:", await page.evaluate(() => [...document.querySelectorAll('[role="tab"],button')].filter((n)=>n.getBoundingClientRect().width>0).map((n) => (n.getAttribute("aria-label") || n.textContent || "").trim().slice(0,20)).slice(0, 40)));
}
const win = page.getByRole("button", { name: /^Window$/u }).first();
if (await win.isVisible().catch(() => false)) { await win.click(); await page.waitForTimeout(500);
  console.log("Window menu items:", await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"],button')].filter((n)=>n.getBoundingClientRect().width>0).map((n)=>(n.getAttribute("aria-label")||n.textContent||"").trim().slice(0,24)).filter((t)=>/레이어|Layer|패널/i.test(t)).slice(0,20)));
}
const layerTab = page.getByRole("tab", { name: /^레이어/u }).first();
if (await layerTab.isVisible().catch(() => false)) { await layerTab.click(); console.log("clicked 레이어 tab"); }
else {
  const layerBtn = page.getByRole("button", { name: /^레이어/u }).first();
  if (await layerBtn.isVisible().catch(() => false)) { await layerBtn.click(); console.log("clicked 레이어 button"); }
  else console.log("no 레이어 control visible");
}
await page.waitForTimeout(800);
console.log("layer rows?", await page.evaluate(() => document.querySelectorAll('[data-studio-layer-row="true"]').length));
console.log("layer-ish controls:", await page.evaluate(() => [...document.querySelectorAll('[role="tab"],button')].map((n) => (n.getAttribute("aria-label") || n.textContent || "").trim()).filter((t) => /레이어/.test(t)).slice(0, 14)));
await page.screenshot({ path: `/tmp/claude-502/probe-${width}.png` });
await browser.close();
server.kill("SIGKILL");
