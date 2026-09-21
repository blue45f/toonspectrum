import assert from "node:assert/strict";
import { expect } from "@playwright/test";

/** Real task navigation: no synthetic state, fallback selectors, or skipped mobile checks. */
export async function assertStudioTaskFrame(page, title) {
  const frame = page.locator('[data-workspace-surface="task"]');
  await expect(frame).toBeVisible();
  await expect(frame.locator('.workspace-brand')).toHaveAttribute('aria-label', 'ToonStudio');
  const navigation = frame.getByRole('navigation', { name: '주 메뉴', exact: true });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveCount(4);
  assert.deepEqual(await navigation.getByRole('link').evaluateAll((links) =>
    links.map((link) => new URL(link.href).pathname)), ['/home', '/studio', '/team', '/hub']);
  await expect(frame.getByRole('navigation', { name: '현재 위치', exact: true })
    .locator('[aria-current="page"]')).toHaveText(title);
  const search = frame.getByRole('button', { name: '작품·도구·메뉴 검색', exact: true });
  await expect(search).toBeVisible();
  await search.focus();
  await expect(search).toBeFocused();
  await expect(page.locator('.public-site-journey')).toHaveCount(0);
}
