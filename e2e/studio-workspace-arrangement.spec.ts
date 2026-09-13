import { expect, test } from "@playwright/test";

test("workspace regions remain reachable while arranging", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/studio/canvas", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#studio-app-shell")).toBeVisible({ timeout: 60_000 });
  const quickStart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickStart.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await quickStart.locator('[data-studio-quickstart-dismiss="true"]').click();
  }
  await expect(page.getByRole("button", { name: "배치 편집", exact: true })).toBeVisible();
  const historyBefore = await page.locator("#studio-app-shell").getAttribute("data-studio-history-entry-count");
  await page.getByRole("button", { name: "배치 편집", exact: true }).click();
  const region = page.locator('[data-studio-workspace-region="tool-rail"]');
  const handle = region.getByRole("button", { name: "그리기 도구 이동", exact: true });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(450, 260, { steps: 12 });
  await page.mouse.up();
  await expect(region).toHaveAttribute("data-studio-region-floating", "true");
  await region.getByRole("button", { name: "그리기 도구 접기", exact: true }).click();
  await expect(region).toHaveAttribute("data-studio-region-collapsed", "true");
  await region.getByRole("button", { name: "그리기 도구 펼치기", exact: true }).click();
  await region.getByRole("button", { name: "그리기 도구 배치 설정", exact: true }).click();
  await region.getByRole("spinbutton", { name: "그리기 도구 너비", exact: true }).fill("120");
  await region.getByRole("spinbutton", { name: "그리기 도구 높이", exact: true }).fill("420");
  await region.getByRole("button", { name: "크기 적용", exact: true }).click();
  await expect(region).toHaveCSS("width", "120px");
  await expect(region).toHaveCSS("height", "420px");
  await expect(region).toHaveCSS("transform", "none");
  await page.screenshot({ path: testInfo.outputPath("workspace-floating.png") });
  await expect(region.getByRole("button", { name: "그리기 도구 배치 설정", exact: true })).toBeVisible();
  await region.getByRole("button", { name: "그리기 도구 접기", exact: true }).click();
  await page.getByRole("button", { name: "기기에 저장", exact: true }).click();
  await expect(page.locator('[data-studio-workspace-arrangement="true"] [role="status"]')).toContainText("이 기기에 저장했어요", { timeout: 20_000 });
  await page.getByRole("button", { name: "원래 자리", exact: true }).click();
  await expect(region).toHaveAttribute("data-studio-region-floating", "false");
  await page.getByRole("button", { name: "기기 배치 불러오기", exact: true }).click();
  await expect(region).toHaveAttribute("data-studio-region-floating", "true");
  await expect(region).toHaveAttribute("data-studio-region-collapsed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(region).toHaveAttribute("data-studio-region-floating", "false");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(region).toHaveAttribute("data-studio-region-floating", "true");
  await expect(page.locator("#studio-app-shell")).toHaveAttribute("data-studio-history-entry-count", historyBefore!);
  await page.screenshot({ path: testInfo.outputPath("workspace-restored.png") });
  await page.getByRole("button", { name: "배치 편집", exact: true }).click();
  const verifiedRegions: string[] = [];
  for (const item of await page.locator("[data-studio-workspace-region]").all()) {
    const move = item.getByRole("button", { name: / 이동$/, exact: true }).first();
    if (!await move.isVisible()) continue;
    await move.press("Alt+ArrowRight");
    await expect(item).toHaveAttribute("data-studio-region-floating", "true");
    verifiedRegions.push((await item.getAttribute("data-studio-workspace-region"))!);
  }
  expect(verifiedRegions).toContain("top-chrome");
  expect(verifiedRegions).toContain("tool-rail");
  expect(verifiedRegions.length).toBeGreaterThanOrEqual(4);
  console.log("Verified regions:", verifiedRegions.join(", "));
  await page.screenshot({ path: testInfo.outputPath("workspace-all-regions.png") });
  expect(pageErrors).toEqual([]);
});
