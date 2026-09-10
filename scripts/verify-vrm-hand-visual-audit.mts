import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import { WEB_ROOT, WEB_VITE_CONFIG } from "./lib/repo-paths.mjs";
import {
  findFreePort,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

const OUTPUT = resolve("artifacts/vrm-hand-visual-audit");
const CHARACTER_IDS = ["sample-vrm", "avatar-a", "avatar-b", "avatar-c", "mio", "noa"] as const;
const errors: string[] = [];
const receipt: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  hand: [],
  props: [],
  errors,
};

rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(OUTPUT, { recursive: true });
writeFileSync(
  resolve(OUTPUT, "started.json"),
  `${JSON.stringify({ startedAt: new Date().toISOString() }, null, 2)}\n`,
);

const port = await findFreePort();
const origin = `http://127.0.0.1:${port}`;
let serverLog = "";
const server = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  [
    "exec",
    "vite",
    "--config",
    WEB_VITE_CONFIG,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: WEB_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout?.on("data", (chunk) => {
  serverLog += String(chunk);
});
server.stderr?.on("data", (chunk) => {
  serverLog += String(chunk);
});

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
  }));
}

async function clickCharacter(page: Page, id: string) {
  const button = page.locator(`#bar button[data-id="${id}"]`);
  await button.waitFor({ state: "visible", timeout: 30_000 });
  const name = await button.getAttribute("data-name");
  if (!name) throw new Error(`missing character name for ${id}`);
  await button.click();
  return name;
}

let browser: Browser | null = null;
try {
  await Promise.race([
    waitForServer(origin, {
      timeoutMs: 30_000,
      notReadyMessage: "VRM hand visual audit Vite server did not become ready",
    }),
    new Promise<void>((_, reject) => {
      server.once("exit", (code, signal) => {
        reject(new Error(
          `VRM hand visual audit Vite server exited before readiness (code=${String(code)}, signal=${String(signal)})\n${serverLog}`,
        ));
      });
    }),
  ]);

  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("crash", () => errors.push("page crashed while rendering VRM hand evidence"));

  await page.goto(`${origin}/tools/browser-harnesses/hand-compare.html`, { waitUntil: "load" });
  const handReceipts: unknown[] = [];
  for (const id of CHARACTER_IDS) {
    const name = await clickCharacter(page, id);
    await page.waitForFunction(
      (expectedName) => (window as Window & { __handCompareReady?: boolean; __handCompareName?: string }).__handCompareReady === true
        && (window as Window & { __handCompareName?: string }).__handCompareName === expectedName,
      name,
      { timeout: 60_000 },
    );
    await settle(page);
    const note = await page.locator("#hands-note").textContent();
    await page.locator("#grid").screenshot({ path: resolve(OUTPUT, `idle-${id}-grid.png`), animations: "disabled" });
    await page.locator("#left").screenshot({ path: resolve(OUTPUT, `idle-${id}-left-hand.png`), animations: "disabled" });
    await page.locator("#right").screenshot({ path: resolve(OUTPUT, `idle-${id}-right-hand.png`), animations: "disabled" });
    handReceipts.push({ id, name, note });
  }
  receipt.hand = handReceipts;

  await page.goto(`${origin}/tools/browser-harnesses/props-compare.html`, { waitUntil: "load" });
  const propReceipts: unknown[] = [];
  for (const id of CHARACTER_IDS) {
    const name = await clickCharacter(page, id);
    await page.waitForFunction(
      (expectedName) => {
        const value = window as Window & { __propsCompareReady?: boolean; __propsCompareName?: string };
        return value.__propsCompareReady === true && value.__propsCompareName === expectedName;
      },
      name,
      { timeout: 60_000 },
    );
    await settle(page);
    const metrics = await page.evaluate(() => (
      window as Window & { __propsCompareMetrics?: unknown }
    ).__propsCompareMetrics ?? null);
    const note = await page.locator("#close-note").textContent();
    await page.locator("#grid").screenshot({ path: resolve(OUTPUT, `props-${id}-grid.png`), animations: "disabled" });
    await page.locator("#right-item").screenshot({ path: resolve(OUTPUT, `props-${id}-right-mug.png`), animations: "disabled" });
    await page.locator("#left-item").screenshot({ path: resolve(OUTPUT, `props-${id}-left-book.png`), animations: "disabled" });
    await page.locator("#close").screenshot({ path: resolve(OUTPUT, `props-${id}-contact-close.png`), animations: "disabled" });
    propReceipts.push({ id, name, note, metrics });
  }
  receipt.props = propReceipts;
} finally {
  await browser?.close().catch(() => undefined);
  await stopChildProcess(server).catch(() => undefined);
  writeFileSync(resolve(OUTPUT, "vite.log"), serverLog);
  writeFileSync(resolve(OUTPUT, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}

if (errors.length > 0) {
  throw new Error(`VRM hand visual audit emitted browser errors:\n${errors.join("\n")}`);
}

console.log(`VRM hand visual audit: ${OUTPUT}`);
