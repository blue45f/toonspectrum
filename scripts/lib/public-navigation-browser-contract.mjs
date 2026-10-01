import { assertPublicDashboardHeader } from "./public-dashboard-header-contract.mjs";
import assert from "node:assert/strict";
import { expect } from "@playwright/test";

// These four public destinations gained the task shell; other public pages rely on the single primary navigation.
const TASK_ROUTES = Object.freeze({
  "/market": { title: "소재 찾기", parent: "/hub", active: "/hub" },
  "/showcase": { title: "창작 작품", parent: "/hub", active: "/hub" },
  "/discover": { title: "작품 찾기", parent: "/hub", active: "/hub" },
  "/help": { title: "도움말", parent: "/home", active: null },
});
const DESTINATIONS = ["/home", "/studio", "/team", "/hub"];

/** 좁은 화면은 중복 여정 대신 실제 다섯 목적지와 전체 메뉴를 제공한다. */
export async function assertPublicMobileNavigation(page, route) {
  const quick = page.getByRole("navigation", { name: "빠른 이동", exact: true });
  await expect(quick).toBeVisible();
  const links = quick.locator("a");
  await expect(links).toHaveCount(5);
  assert.deepEqual(await links.evaluateAll((items) => items.map((item) => new URL(item.href).pathname)),
    ["/", "/studio", "/discover", "/community", "/sitemap"]);
  for (const link of await links.all()) {
    await expect(link).toBeVisible();
    await expect.poll(async () => (await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  if (route === "/community") await expect(quick.locator('a[href="/community"]')).toHaveAttribute("aria-current", "page");
  const trigger = page.getByRole("button", { name: "전체 메뉴", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "전체 메뉴", exact: true });
  await expect(dialog).toBeVisible();
  assert(await dialog.evaluate((element) => element.contains(document.activeElement)), "The full menu must receive focus");
  for (const href of ["/discover", "/learn", "/market", "/studio/new", "/showcase"]) {
    await expect(dialog.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  assert.equal(new URL(page.url()).pathname, route, "Menu inspection must preserve the current page");
}

/** Validate the actual DOM snapshot, not a generic replacement container's presence. */
export function assertPublicTaskNavigationSnapshot(snapshot, route, origin) {
  const expected = TASK_ROUTES[route];
  assert(expected, `Task-shell ownership is not declared for ${route}`);
  const path = (href) => {
    const url = new URL(href, origin);
    assert.equal(url.origin, new URL(origin).origin, "Workspace navigation must remain same-origin");
    return url.pathname;
  };
  assert.deepEqual(snapshot.links.map((link) => path(link.href)), DESTINATIONS, "Keep all four exact workspace destinations");
  assert.deepEqual(snapshot.links.map((link) => link.label), ["스튜디오", "작품", "팀", "둘러보기"]);
  assert.deepEqual(snapshot.links.filter((link) => link.current === "page").map((link) => path(link.href)),
    expected.active ? [expected.active] : [], "Only the matching destination is current");
  assert.equal(snapshot.title, expected.title, "Breadcrumb identifies the actual current page");
  assert.equal(path(snapshot.parentHref), expected.parent, "Breadcrumb parent stays accurate");
  assert.equal(path(snapshot.returnHref), "/home", "The current page keeps its studio-return action");
}

/** Support each explicit navigation owner without accepting missing or duplicated navigation. */
export async function assertPublicSiteNavigation(page, route) {
  const task = page.locator('[data-workspace-surface="task"]');
  if (route === "/") {
    await assertPublicDashboardHeader(page);
    if (page.viewportSize().width < 768) await assertPublicMobileNavigation(page, route);
    return "public-dashboard-header";
  }
  // 헤더 아래 두 번째 단계 탐색 줄은 주 메뉴와 선택 표시가 겹쳐 제거했다.
  await expect(page.locator(".public-site-journey")).toHaveCount(0);
  if (await task.count() === 0) {
    if (page.viewportSize().width < 768) {
      await assertPublicMobileNavigation(page, route);
      return "public-mobile-navigation";
    }
    const primary = page.getByRole("navigation", { name: "주요 메뉴", exact: true });
    await expect(primary).toBeVisible();
    const current = await primary.locator(".site-header__primary-link[aria-current]").count();
    assert.ok(current <= 1, `${route}: 주 메뉴 현재 위치가 ${current}곳에 표시됩니다`);
    return "public-primary-navigation";
  }
  await expect(task).toBeVisible();
  const links = task.locator(".workspace-nav a");
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) await expect(link).toBeVisible();
  const breadcrumb = task.getByRole("navigation", { name: "현재 위치", exact: true });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);
  const returnLink = task.locator(".workspace-task-purpose").getByRole("link", { name: "가상 스튜디오", exact: true });
  await expect(returnLink).toBeVisible();
  const search = task.getByRole("button", { name: "작품·도구·메뉴 검색", exact: true });
  await expect(search).toHaveCount(1);
  await expect(search).toBeVisible();
  await expect(search).toBeEnabled();
  // Actionability and real focus checks still fail on a blocking overlay or a hidden control.
  await search.click({ trial: true });
  await search.focus();
  await expect(search).toBeFocused();
  const snapshot = await task.evaluate((root) => ({
    links: Array.from(root.querySelectorAll(".workspace-nav a"), (link) => ({
      href: link.getAttribute("href"), label: link.textContent.trim(), current: link.getAttribute("aria-current"),
    })),
    title: root.querySelector('.workspace-task-breadcrumb [aria-current="page"]')?.textContent.trim(),
    parentHref: root.querySelector(".workspace-task-breadcrumb a")?.getAttribute("href"),
    returnHref: root.querySelector(".workspace-task-purpose a")?.getAttribute("href"),
  }));
  assertPublicTaskNavigationSnapshot(snapshot, route, page.url());
  assert.equal(new URL(page.url()).pathname, route, "Navigation checks must preserve the current page");
  return "workspace-task";
}
