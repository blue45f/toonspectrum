import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:5498");
if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)) {
  throw new Error("Trace-practice QA is loopback-only");
}
const output = path.resolve(process.argv[3] ?? "/tmp/toonstudio-trace-practice");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { checks: [], errors: [] };

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ko-KR",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin.origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(new URL("/learn/trace", origin).href, { waitUntil: "domcontentloaded", timeout: 60000 });
  const start = page.getByRole("link", { name: /따라 그리기 시작/ });
  await start.waitFor({ timeout: 60000 });
  assert.equal(await start.getAttribute("href"), "/studio/canvas?practice=trace");
  report.checks.push("Academy exposes trace practice without adding a second router");

  await start.click();
  await page.waitForURL((url) => url.pathname === "/studio/canvas" && url.searchParams.get("practice") === "trace", { timeout: 60000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ timeout: 60000 });
  for (const name of ["나중에", "닫기", "빈 캔버스", "확인"]) {
    const button = page.getByRole("button", { name, exact: true }).first();
    if (await button.isVisible().catch(() => false)) await button.click({ timeout: 1500 }).catch(() => undefined);
  }
  await page.keyboard.press("Escape");
  const reference = page.getByRole("region", { name: "레퍼런스 캔버스" });
  await reference.waitFor({ timeout: 45000 });
  assert.equal(new URL(page.url()).searchParams.get("practice"), "trace");
  assert.equal(await page.locator('[data-studio-reference-canvas="true"]').count(), 1);
  report.checks.push("Trace launch opens the existing reference canvas in the real editor while retaining the explicit mode query");
  await page.screenshot({ path: path.join(output, "trace-practice.png"), fullPage: false });
  assert.deepEqual(report.errors, []);
  await context.close();
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
