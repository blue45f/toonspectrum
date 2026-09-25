import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { chromium, firefox, webkit, expect } from "@playwright/test";

const origin = process.argv[2] ?? "http://127.0.0.1:5238";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) {
  throw new Error("Use an isolated loopback fixture, never a production account.");
}
const engines = (process.argv[3] ?? "chromium").split(",");
const url = new URL("/tools/browser-harnesses/drawing-practice.html", origin).href;
const output = path.resolve("artifacts/drawing-practice");
await fs.mkdir(output, { recursive: true });
const report = { engines: [], checks: [], errors: [], consoleErrors: [] };
const timeout = { timeout: 30_000 };

async function ready(page) {
  await page.goto(url);
  await expect(page.getByTestId("practice-fixture")).toBeVisible(timeout);
  await expect(page.getByTestId("practice-fixture")).toHaveAttribute(
    "data-guide-visible",
    "true",
    timeout,
  );
}
async function desktop(page, engine) {
  await ready(page);
  const fixture = page.getByTestId("practice-fixture");
  const toolbar = page.getByRole("toolbar", { name: "따라 그리기 조작" });
  await expect(toolbar).toBeVisible();
  await page.getByRole("button", { name: "배치 잠금" }).click();
  await expect(fixture).toHaveAttribute("data-locked", "false");

  const opacity = page.getByRole("slider", { name: "따라 그리기 원본 투명도" });
  await opacity.focus();
  await opacity.press("ArrowRight");
  await expect(page.getByTestId("opacity")).toHaveText("35%");
  await page.getByRole("button", { name: "원본 숨기기" }).click();
  await expect(fixture).toHaveAttribute("data-guide-visible", "false");
  await page.getByRole("button", { name: "원본 보이기" }).click();
  await expect(fixture).toHaveAttribute("data-guide-visible", "true");

  await page.getByRole("button", { name: "비교" }).click();
  await expect(fixture).toHaveAttribute("data-guide-visible", "false");
  await page.getByRole("button", { name: "비교" }).click();
  await expect(fixture).toHaveAttribute("data-guide-visible", "true");
  await page.getByRole("button", { name: "옆에 보기" }).click();
  await expect(fixture).toHaveAttribute("data-mode", "reference-window");
  await expect(page.getByRole("complementary", { name: "옆 참고 이미지" })).toBeVisible();
  await expect(fixture).toHaveAttribute("data-guide-visible", "false");
  await page.getByRole("button", { name: "겹쳐 보기" }).click();
  await expect(fixture).toHaveAttribute("data-mode", "overlay");

  await page.getByRole("button", { name: "원본 누락 전환" }).click();
  await expect(page.getByRole("alert")).toContainText("원본을 찾지 못했어요");
  await expect(fixture).toHaveAttribute("data-guide-visible", "false");
  await page.getByRole("button", { name: "레퍼런스 열기" }).click();
  await expect(fixture).toHaveAttribute("data-guide-visible", "true");
  await page.getByRole("button", { name: "맞춤 배치" }).click();
  await expect(page.getByTestId("action")).toHaveText("reset");
  await page.getByRole("button", { name: "다시 연습" }).click();
  await expect(fixture).toHaveAttribute("data-attempt", "2");
  await expect(fixture).toHaveAttribute("data-target-group", "practice-group-2");
  await page.getByRole("button", { name: "연습 마치기" }).click();
  await expect(fixture).toHaveAttribute("data-status", "completed");
  await expect(fixture).toHaveAttribute("data-guide-visible", "false");
  await expect(page.getByRole("button", { name: "완료됨" })).toBeDisabled();
  await page.screenshot({ path: path.join(output, `${engine}-desktop.png`) });
  report.checks.push(`${engine}: overlay/reference, visibility, compare, relink, reset, retry group, complete`);
}
async function mobile(page, engine) {
  await ready(page);
  const toolbar = page.getByRole("toolbar", { name: "따라 그리기 조작" });
  const dock = page.getByTestId("mobile-dock");
  await expect(toolbar).toBeVisible();
  await expect(dock).toBeVisible();
  const toolbarBox = await toolbar.boundingBox();
  const dockBox = await dock.boundingBox();
  assert(toolbarBox && dockBox, "mobile toolbar or dock has no bounds");
  assert(
    toolbarBox.y + toolbarBox.height <= dockBox.y + 1,
    `practice toolbar overlaps mobile dock: ${JSON.stringify({ toolbarBox, dockBox })}`,
  );

  const lock = page.getByRole("button", { name: "배치 잠금" });
  const lockBox = await lock.boundingBox();
  assert(lockBox && lockBox.height >= 43.5, `mobile target below 44px: ${JSON.stringify(lockBox)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(overflow <= 1, `mobile horizontal overflow ${overflow}`);
  await page.screenshot({ path: path.join(output, `${engine}-mobile.png`) });
  report.checks.push(`${engine}: mobile dock clearance, 44px target, no horizontal overflow`);
}
for (const engine of engines) {
  const launcher = { chromium, firefox, webkit }[engine];
  if (!launcher) throw new Error(`Unknown browser engine: ${engine}`);
  const browser = await launcher.launch({ headless: true });
  report.engines.push({ engine, version: browser.version() });
  try {
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const desktopPage = await desktopContext.newPage();
    desktopPage.on("pageerror", (error) => report.errors.push(`${engine}: ${error.message}`));
    desktopPage.on("console", (message) => {
      if (message.type() === "error") report.consoleErrors.push(`${engine}: ${message.text()}`);
    });
    await desktop(desktopPage, engine);
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 700 },
      hasTouch: true,
      ...(engine !== "firefox" ? { isMobile: true } : {}),
    });
    const mobilePage = await mobileContext.newPage();
    mobilePage.on("pageerror", (error) => report.errors.push(`${engine} mobile: ${error.message}`));
    await mobile(mobilePage, engine);
    await mobileContext.close();
  } finally {
    await browser.close();
  }
}
assert.deepEqual(report.errors, []);
assert.deepEqual(report.consoleErrors, []);
await fs.writeFile(
  path.join(output, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report, null, 2));
