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
    "/studio/bg3d", "/studio/canvas",
  ]);
  const modules = dashboard.locator(".rd-mini-workspace-grid .rd-mini-heading > a");
  assert.deepEqual(await modules.evaluateAll((links) => links.map((link) => link.getAttribute("href"))), [
    "/studio", "/studio/assets/characters/new", "/studio/bg3d", "/studio/assets", "/story-lab",
    "/studio/ai-lab", "/studio/publish", "/community",
  ]);
  await expect(dashboard.locator('.rd-examples-heading a')).toHaveAttribute("href", "/studio");
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
  for (const key of [...Array(12).fill("Tab"), ...Array(12).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    assert(await input.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), "검색 초점은 모달 안에 머물러야 한다");
  }
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
  await expect(search).toBeFocused();
  await assertPublicHomeSamples(dashboard);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Public home must not overflow horizontally");
}

/** 시안의 미니 작업공간은 실제 프로젝트를 건드리지 않고 로컬 예시만 바꾼다. */
async function assertPublicHomeSamples(dashboard) {
  const frames = dashboard.getByRole("group", { name: "예시 컷 선택" });
  await frames.getByRole("button", { name: "예시 컷 3 선택" }).click();
  await expect(dashboard.locator("[data-editor-selected-frame]")).toHaveAttribute("src", /character-blue-640\.webp$/u);
  await expect(frames.getByRole("button", { name: "예시 컷 3 선택" })).toHaveAttribute("aria-pressed", "true");
  const dialogue = dashboard.getByLabel("예시 대사 편집");
  await dialogue.fill("새로운 장면을 함께 그려요.");
  await expect(dashboard.locator(".rd-editor-bubble")).toHaveText("새로운 장면을 함께 그려요.");
  const characters = dashboard.getByRole("group", { name: "예시 캐릭터 선택" });
  await characters.getByRole("button", { name: "푸른빛", exact: true }).click();
  await expect(dashboard.locator(".rd-mini-character-portrait img")).toHaveAttribute("src", /character-blue-320\.webp$/u);
  await characters.getByRole("button", { name: "벚꽃", exact: true }).click();
  const scenes = dashboard.getByRole("group", { name: "배경 예시 선택" });
  await scenes.getByRole("button", { name: "교실 배경 보기" }).click();
  await expect(dashboard.getByRole("img", { name: "교실 배경 예시" })).toHaveAttribute("src", /background-classroom-640\.webp$/u);
  await scenes.getByRole("button", { name: "도시 배경 보기" }).click();
  const format = dashboard.getByRole("checkbox", { name: "규격 확인" });
  await expect(format).not.toBeChecked();
  await format.check();
  await expect(format).toBeChecked();
  await format.uncheck();
  await expect(format).not.toBeChecked();
  const gallery = dashboard.getByRole("group", { name: "예시 갤러리 분류" });
  await gallery.getByRole("button", { name: "캐릭터", exact: true }).click();
  await expect(dashboard.locator(".rd-mini-community-gallery img")).toHaveCount(2);
  await gallery.getByRole("button", { name: "전체", exact: true }).click();
  await expect(dashboard.locator(".rd-mini-community-gallery img")).toHaveCount(4);
  await frames.getByRole("button", { name: "예시 컷 1 선택" }).click();
  await dialogue.fill("…아직 끝나지 않았어.");
}
