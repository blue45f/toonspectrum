import { expect, test, type Page } from "@playwright/test";

async function openStudio(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/canvas", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#studio-app-shell")).toBeVisible({ timeout: 60_000 });

  const quickStart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickStart.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false)) {
    const dismiss = quickStart.locator('[data-studio-quickstart-dismiss="true"]');
    if (await dismiss.isVisible()) await dismiss.click();
  }
}

async function expectFloatingSurfaceInsideViewport(
  page: Page,
  selector: string,
  minimumWidth: number,
  minimumHeight: number,
): Promise<void> {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 20_000 });
  await expect(surface).toHaveAttribute("data-studio-floating-surface", "true");
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(minimumWidth);
  expect(box!.height).toBeGreaterThanOrEqual(minimumHeight);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  expect(box!.y + box!.height).toBeLessThanOrEqual(1000);
  expect(await surface.locator("[data-studio-floating-resize-handle]").count()).toBeGreaterThan(0);
}

test("view options opens as a movable, comfortable desktop floating workspace", async ({ page }, testInfo) => {
  await openStudio(page);
  await page.getByRole("button", { name: "보기 설정", exact: true }).click();

  const selector = '[data-studio-shell-view-options-panel="true"]';
  await expectFloatingSurfaceInsideViewport(page, selector, 520, 640);
  const surface = page.locator(selector);
  const move = surface.getByRole("button", { name: "보기 · 플로팅 UI 이동", exact: true });
  await expect(move).toBeVisible();

  const before = await surface.boundingBox();
  await move.press("Alt+ArrowRight");
  const after = await surface.boundingBox();
  expect(after).not.toBeNull();
  expect(before).not.toBeNull();
  expect(after!.x).toBeGreaterThan(before!.x);

  await page.screenshot({ path: testInfo.outputPath("view-options-floating.png") });
});

test("major tool menus use roomy movable desktop windows", async ({ page }, testInfo) => {
  await openStudio(page);

  const cases = [
    { trigger: "템플릿·에셋", id: "asset-group", label: "에셋", minWidth: 500, minHeight: 600 },
    { trigger: "3D 스튜디오", id: "bg-group", label: "장면", minWidth: 460, minHeight: 580 },
    { trigger: "스타일", id: "style-group", label: "스타일", minWidth: 400, minHeight: 540 },
    { trigger: "AI", id: "ai-group", label: "AI 도우미", minWidth: 520, minHeight: 600 },
    { trigger: "말풍선", id: "bubble-menu", label: "말풍선", minWidth: 440, minHeight: 560 },
  ] as const;

  const verified: string[] = [];
  for (const item of cases) {
    const trigger = page.getByRole("button", { name: item.trigger, exact: true }).first();
    if (!await trigger.isVisible().catch(() => false)) continue;
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const selector = `[data-studio-tool-popover="${item.id}"]`;
    await expectFloatingSurfaceInsideViewport(page, selector, item.minWidth, item.minHeight);
    const surface = page.locator(selector);
    await expect(surface.getByRole("button", { name: `${item.label} 이동`, exact: true })).toBeVisible();
    verified.push(item.id);
    await page.screenshot({ path: testInfo.outputPath(`${item.id}.png`) });
    await surface.getByRole("button", { name: `${item.label} 닫기`, exact: true }).click();
  }

  expect(verified).toContain("asset-group");
  expect(verified).toContain("bubble-menu");
  expect(verified.length).toBeGreaterThanOrEqual(4);
});
