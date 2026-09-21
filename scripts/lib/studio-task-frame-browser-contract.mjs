import { expect } from "@playwright/test";
import { assertPublicSiteNavigation } from "./public-navigation-browser-contract.mjs";

/** Extend the shared public navigation proof with the unified accessible brand contract. */
export async function assertStudioTaskFrame(page, title) {
  await assertPublicSiteNavigation(page, new URL(page.url()).pathname);
  const frame = page.locator('[data-workspace-surface="task"]');
  await expect(frame.locator('.workspace-brand')).toHaveAttribute('aria-label', 'ToonStudio');
  await expect(frame.getByRole('navigation', { name: '현재 위치', exact: true })
    .locator('[aria-current="page"]')).toHaveText(title);
  await expect(page.locator('.public-site-journey')).toHaveCount(0);
}
