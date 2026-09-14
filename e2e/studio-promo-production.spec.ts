import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("gutter splitting, camera endpoints and output preflight work in the real editor", async ({ page }, testInfo) => {
  await page.route("**/api/studio-ai/status", (route) => route.fulfill({ json: { configured: false, requiresAuth: true } }));
  await page.goto("/tools/browser-harnesses/promo-e2e.html");
  await expect(page.locator("#promo-work-title")).toBeEnabled();
  const strip = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 1280;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 400, 1280);
    for (const [index, top] of [0, 440, 880].entries()) {
      ctx.fillStyle = ["#264773", "#514162", "#297665"][index]!; ctx.fillRect(0, top, 400, 400);
      ctx.fillStyle = "#edb694"; ctx.fillRect(30, top + 40, 120, 240);
      ctx.fillStyle = "#e0effa"; ctx.fillRect(230, top + 120, 80, 190);
    }
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  await page.locator("#promo-split").selectOption("auto");
  await page.locator("#promo-panels").setInputFiles({ name: "white-gutter-strip.png", mimeType: "image/png", buffer: Buffer.from(strip, "base64") });
  await expect(page.locator(".promo-shot")).toHaveCount(3);
  const shot = page.locator(".promo-shot").first();
  await shot.locator("summary").click();
  await shot.locator('select[id^="camera-mode-"]').selectOption("custom");
  await shot.locator('input[id^="camera-from-x-"]').fill("0.1");
  await shot.locator('input[id^="camera-to-x-"]').fill("0.9");
  await shot.locator('input[id^="camera-to-zoom-"]').fill("2");
  await shot.getByRole("button", { name: "시작 구도 확인", exact: true }).click();
  await expect(page.locator("#promo-seek")).toHaveValue("0");  const first = await page.locator(".promo-canvas-wrap canvas").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await shot.getByRole("button", { name: "끝 구도 확인", exact: true }).click();
  await expect(page.locator("#promo-seek")).toHaveValue("129");
  const last = await page.locator(".promo-canvas-wrap canvas").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(last).not.toBe(first);
  await page.getByRole("button", { name: "이전 프레임", exact: true }).click();
  await expect(page.locator("#promo-seek")).toHaveValue("128");
  await page.getByRole("button", { name: "다음 프레임", exact: true }).click();
  await expect(page.locator("#promo-seek")).toHaveValue("129");
  await expect(page.locator(".promo-preflight")).toContainText("말풍선");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "프로젝트 JSON 저장", exact: true }).click()]);
  const path = testInfo.outputPath("camera-project.json");
  await download.saveAs(path);
  const project = JSON.parse(await readFile(path, "utf8")) as { panels: { camera?: { to: { zoom: number } } }[] };
  expect(project.panels[0]?.camera?.to.zoom).toBe(2);
  await shot.getByRole("button", { name: "시작·끝 구도 맞바꾸기", exact: true }).click();
  await expect(shot.locator('input[id^="camera-from-zoom-"]')).toHaveValue("2");
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(shot.locator('input[id^="camera-from-zoom-"]')).toHaveValue("1");
  await page.locator("#promo-import").setInputFiles(path);
  await expect(shot.locator('input[id^="camera-to-zoom-"]')).toHaveValue("2");
  await page.getByRole("button", { name: "마지막 카드 확인", exact: true }).click();
  await expect(page.locator("#promo-seek")).toHaveValue("420");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("production-mobile.png"), fullPage: true });
});
