import assert from "node:assert/strict";
import { expect } from "@playwright/test";

// These four public destinations gained the task shell; other public pages retain their journey.
const TASK_ROUTES = Object.freeze({
  "/market": { title: "소재 찾기", parent: "/hub", active: "/hub" },
  "/showcase": { title: "창작 작품", parent: "/hub", active: "/hub" },
  "/discover": { title: "작품 찾기", parent: "/hub", active: "/hub" },
  "/help": { title: "도움말", parent: "/home", active: null },
});
const DESTINATIONS = ["/home", "/studio", "/team", "/hub"];

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
  const journey = page.locator(".public-site-journey");
  const task = page.locator('[data-workspace-surface="task"]');
  await expect(journey.or(task)).toHaveCount(1);
  if (await task.count() === 0) {
    await expect(journey).toBeVisible();
    return "public-journey";
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
  const search = task.locator(".workspace-search-trigger");
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
