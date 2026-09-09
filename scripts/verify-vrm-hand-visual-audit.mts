import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Page } from "playwright";
import { createServer as createViteServer } from "vite";

import { WEB_ROOT, WEB_VITE_CONFIG } from "./lib/repo-paths.mjs";
import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

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

const server = await createViteServer({
  root: WEB_ROOT,
  configFile: WEB_VITE_CONFIG,
  appType: "spa",
  server: { port: await findFreePort(), strictPort: true },
  logLevel: "error",
});
await server.listen();
const origin = `http://127.0.0.1:${server.config.server.port}`;

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

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

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
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
  writeFileSync(resolve(OUTPUT, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}

if (errors.length > 0) {
  throw new Error(`VRM hand visual audit emitted browser errors:\n${errors.join("\n")}`);
}

console.log(`VRM hand visual audit: ${OUTPUT}`);
