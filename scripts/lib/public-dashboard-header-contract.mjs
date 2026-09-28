import { expect } from "@playwright/test";

/** 홈의 단일 헤더를 검증하며 다른 페이지의 작업/여정 내비게이션 계약은 유지한다. */
export async function assertPublicDashboardHeader(page) {
  const header = page.locator('[data-site-chrome="header"][data-site-home="true"]');
  await expect(page.locator('.public-site-journey, [data-workspace-surface="task"]')).toHaveCount(0);
  await expect(header).toHaveCount(1);
  await expect(header).toBeVisible();
  await expect(header.locator('.site-header__create')).toHaveAttribute("href", "/studio/new");
  const appearance = header.locator(".site-header__appearance");
  await expect(appearance).toHaveCount(1);
  if (page.viewportSize().width >= 768) {
    await expect(appearance).toBeVisible();
    await expect(appearance).toBeEnabled();
    await expect(header.locator('a[data-navigation-entry="home"]')).toHaveAttribute("aria-current", "page");
  } else {
    await expect(appearance).toBeHidden();
  }
}
