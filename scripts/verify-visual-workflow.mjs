import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { installBetaEventDismissal } from './lib/public-page-event-gate.mjs';

const base = process.env.WORKFLOW_VERIFY_ORIGIN || 'http://127.0.0.1:5310';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), '시각 조작 검증은 로컬 후보에서만 실행합니다.');
const output = process.env.WORKFLOW_VERIFY_OUTPUT || '.qa/visual-workflow';
const stages = ['plan', 'storyboard', 'create', 'collaborate', 'review', 'publish'];
const routes = ['/story-lab', '/studio/new', '/studio', '/production', '/production/projects/sample-project/review', '/studio/publish'];
await mkdir(output, { recursive: true });
const results = [];
const browser = await chromium.launch();
try {
  for (const width of [1440, 820, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: 'ko' }, version: 0 }));
      localStorage.setItem('toonstudio-theme', JSON.stringify({ state: { preference: 'starlight', studioPreference: 'starlight' }, version: 0 }));
    });
    const page = await context.newPage();
    await installBetaEventDismissal(page);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const section = page.locator('#creator-flow');
    await expect(section).toBeVisible({ timeout: 60000 });
    const cards = section.locator('[data-workflow-step]');
    await expect(cards).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      const card = cards.nth(index), image = card.locator('img');
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0 && element.currentSrc.includes("/brand/workflow-20260928/") && element.getBoundingClientRect().height >= 90)).toBe(true);
      await expect(card).toHaveAttribute('data-workflow-step', stages[index]);
      assert((await image.getAttribute('alt'))?.length > 5, '설명 이미지에 의미 있는 대체텍스트가 있어야 합니다.');
      assert.deepEqual(await card.locator('.cf-step-actions > a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), [routes[index], routes[index + 1] || '/studio']);
      for (const link of await card.locator('.cf-step-actions > a').all()) {
        await link.scrollIntoViewIfNeeded(); await link.click({ trial: true });
        const size = await link.boundingBox(); assert(size && size.height >= 44, '작업 이동 터치 영역은 44px 이상이어야 합니다.');
        await link.focus(); await expect(link).toBeFocused();
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const sectionBounds = await section.boundingBox();
    await page.screenshot({ path: `${output}/workflow-${width}.png`, fullPage: true, animations: 'disabled' });
    const first = cards.first().locator('.cf-step-actions > a').first();
    await first.click(); await expect(page).toHaveURL(/\/story-lab$/u);
    results.push({ width, sectionBounds, stages: 6, imageReady: true, keyboardAndTouch: true, firstActionNavigates: true, errors });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/report.json`, JSON.stringify({ base, authenticatedWorkflowsVerified: false, results }, null, 2));
console.log(JSON.stringify(results, null, 2));
