import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

import { resolveExperimentOutput } from "./output";

if (process.env.TOONSPECTRUM_RECOVERED_ALLOW_GPU !== "1") {
  throw new Error("Use run.mts --run bg3d-origin --allow-gpu.");
}
const root = fileURLToPath(new URL("../../../", import.meta.url));
const entry = fileURLToPath(new URL("./bg3d-origin-probe.tsx", import.meta.url));
const output = resolveExperimentOutput("bg3d-origin");
const vite = await createServer({
  root: `${root}/apps/web`,
  configFile: `${root}/vite.config.ts`,
  server: { host: "127.0.0.1", port: 0, strictPort: false },
  appType: "custom",
  logLevel: "warn",
});
vite.middlewares.use(async (request, response, next) => {
  if (request.url !== "/recovered-bg3d-origin") { next(); return; }
  response.setHeader("Content-Type", "text/html");
  response.end(await vite.transformIndexHtml("/recovered-bg3d-origin",
    `<!doctype html><div id="root"></div><script type="module" src="/@fs/${entry}"></script>`));
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Probe server has no TCP address.");
  browser = await chromium.launch({ channel: "chromium", headless: true,
    args: ["--enable-unsafe-webgpu", "--use-gpu-in-tests"] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/recovered-bg3d-origin`);
  await page.waitForFunction(() => (
    (window as typeof window & { samples?: unknown[] }).samples?.length ?? 0
  ) >= 2, undefined, { timeout: 90_000 });
  const snapshot = () => page.evaluate(() => (
    window as typeof window & { samples: unknown[] }
  ).samples.at(-1));
  await page.locator("canvas").screenshot({ path: `${output}/before.png` });
  const before = await snapshot();
  await page.locator("#host").evaluate((host) => {
    (host as HTMLElement).style.animation = "none";
    (window as typeof window & { wake?: () => void }).wake?.();
  });
  await page.waitForTimeout(600);
  await page.locator("canvas").screenshot({ path: `${output}/after.png` });
  const after = await snapshot();
  writeFileSync(`${output}/report.json`, JSON.stringify({
    kind: "measurement-only", before, after, errors, browserVersion: browser.version(),
    sourceSha: "c4ad158a043905a57a3bbfaf0a0373c2fef6c43c",
  }, null, 2));
  if (errors.length > 0) throw new Error(`Probe recorded ${errors.length} browser errors; see report.json.`);
} finally {
  await browser?.close();
  await vite.close();
}
