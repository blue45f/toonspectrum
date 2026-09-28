import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { assertPublicSiteNavigation } from "./public-navigation-browser-contract.mjs";

/** 공개 대시보드와 개인 작업공간은 서로 다른 실제 동선을 검증한다. */
export async function assertPublicCreatorHome(page) {
  const home = page.locator('[data-home-view="dashboard"]');
  const dashboard = home.locator('[data-reference-dashboard="true"]');
  await expect(dashboard).toBeVisible({ timeout: 30000 });
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(dashboard.locator("#creator-hero-title")).toBeVisible();
  await expect(page.locator('[data-workspace-surface="home"], video')).toHaveCount(0);
  await assertPublicSiteNavigation(page, "/");
  const starts = dashboard.locator(".rd-quick-grid > a");
  assert.deepEqual(await starts.evaluateAll((links) => links.map((link) => link.getAttribute("href"))), [
    "/studio/new?kind=webtoon&template=webtoon-vertical", "/story-lab", "/studio/assets/characters/new",
    "/studio/bg3d", "/studio/new?kind=illustration&template=illustration-blank",
  ]);
  const modules = dashboard.locator(".rd-module-grid > a");
  assert.deepEqual(await modules.evaluateAll((links) => links.map((link) => link.getAttribute("href"))), [
    "/studio", "/studio/assets/characters/new", "/studio/bg3d", "/studio/assets", "/story-lab",
    "/studio/ai-lab", "/studio/publish", "/community",
  ]);
  await expect(dashboard.locator('.rd-resume a')).toHaveAttribute("href", "/studio");
  await expect(dashboard.locator('.rd-editor-heading a')).toHaveAttribute("href", "/studio/new");
  await expect(dashboard.locator("#rd-editor-caption")).toContainText("편집기 콘셉트");
  for (const control of await starts.or(modules).all()) {
    await expect(control).toBeVisible();
    await expect.poll(async () => (await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const search = dashboard.locator(".rd-search");
  await search.click();
  const input = page.getByPlaceholder("작품 제목, 작가, 기능 명령, 스튜디오 도구 검색...");
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill("브러시");
  await expect(input).toHaveValue("브러시");
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
  await expect(search).toBeFocused();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Public home must not overflow horizontally");
}
