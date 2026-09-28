import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { installBetaEventDismissal } from './public-page-event-gate.mjs';

/** 원본과 대체 아트가 모두 실패해도 실제 브라우저의 작업 이동은 유지한다. */
export async function verifyWorkflowImageFailure(browser, base, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  try {
    await context.addInitScript(() => localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: 'ko' }, version: 0 })));
    await context.route('**/brand/workflow-20260928/plan-*.webp', (route) => route.abort('failed'));
    await context.route('**/brand/illustrated-20260928/storyboard-320.webp', (route) => route.abort('failed'));
    const page = await context.newPage();
    await installBetaEventDismissal(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const card = page.locator('[data-workflow-step="plan"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('[data-artwork-unavailable="true"]')).toBeVisible();
    await expect(card.locator('img')).toBeHidden();
    await expect(card.getByText('이미지 없음')).toBeVisible();
    const bounds = await card.locator('.workflow-illustration').boundingBox();
    assert(bounds && bounds.height >= 90, '이미지 실패가 카드의 예약 크기를 없애면 안 됩니다.');
    await page.screenshot({ path: `${output}/workflow-image-unavailable-mobile.png`, animations: 'disabled' });
    const action = card.locator('.cf-step-image-link');
    await action.focus();
    await expect(action).toBeFocused();
    await action.press('Enter');
    await expect(page).toHaveURL(/\/story-lab$/u);
    await expect(page.locator('#main-content')).toBeVisible();
    assert.deepEqual(errors, []);
    return { width: 390, primaryAndFallbackBlocked: true, brokenImageHidden: true, keyboardNavigation: true, errors };
  } finally { await context.close(); }
}
