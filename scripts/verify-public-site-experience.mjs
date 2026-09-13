import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

import { chromium, expect } from "@playwright/test";

const origin = process.env.PUBLIC_WEBTOON_ORIGIN || "http://127.0.0.1:5281";
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Interactive fault-injection checks only run against a local candidate');
const output = 'artifacts/public-site-experience';
await mkdir(output, { recursive: true });
const results = [];
const browser = await chromium.launch();

async function check(name, run) {
  try {
    await run();
    results.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: String(error) });
    console.error(`FAIL ${name}: ${error}`);
  }
}

try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, locale: 'ko-KR', reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('toonspectrum-lang', JSON.stringify({ state: { lang: 'ko' }, version: 0 })));
    const page = await context.newPage();
    await check(`connected journey and history ${width}`, async () => {
      await page.goto(`${origin}/learn`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toHaveCount(1);
      const next = page.locator('.public-site-next__card').first();
      await expect(next).toHaveAttribute('href', '/market/browse');
      await next.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const position = await page.evaluate(() => window.scrollY);
      assert(position > 100, 'History test must start away from the top');
      await page.screenshot({ path: `${output}/next-steps-${width}.png`, animations: 'disabled' });
      await next.click();
      await expect(page).toHaveURL(/\/market\/browse$/u);
      await expect(page.locator('main h1')).toHaveCount(1);
      await page.goBack();
      await expect(page).toHaveURL(/\/learn$/u);
      await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - position), { timeout: 8000 }).toBeLessThan(25);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    await check(`active mobile journey stays visible ${width}`, async () => {
      await page.goto(`${origin}/community`, { waitUntil: 'domcontentloaded' });
      const active = page.locator('.public-site-journey [aria-current="step"]');
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute('href', '/showcase');
      const visible = await active.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const rail = element.closest('nav').getBoundingClientRect();
        return box.left >= rail.left - 1 && box.right <= rail.right + 1;
      });
      assert(visible, 'The selected creative step must be inside its horizontal rail');
      await page.screenshot({ path: `${output}/community-${width}.png`, animations: 'disabled' });
    });
    await check(`search filter focus and 404 recovery ${width}`, async () => {
      await page.goto(`${origin}/__public-experience-not-found__`, { waitUntil: 'domcontentloaded' });
      const form = page.getByRole('search', { name: '작품 검색으로 다시 시작' });
      await expect(form).toBeVisible();
      await form.locator('input').fill('마법');
      await form.getByRole('button', { name: '검색', exact: true }).click();
      await expect(page).toHaveURL(/\/search\?q=/u);
      await expect(page.locator('main h1')).toHaveCount(1);
      const filters = page.locator('main a[href="#toonspectrum-search-explorer-top"]');
      await filters.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#toonspectrum-search-explorer-top')).toBeFocused();
      const top = await page.locator('#toonspectrum-search-explorer-top').evaluate((element) => element.getBoundingClientRect().top);
      assert(top >= 0, 'Filter destination must not be above the viewport');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    await check(`decorations stay out of account and legal workflows ${width}`, async () => {
      for (const route of ['/settings', '/library', '/privacy', '/terms']) {
        await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#main-content')).toBeVisible();
        await expect(page.locator('[data-public-experience="atelier"]')).toHaveCount(0);
        await expect(page.locator('.public-site-next')).toHaveCount(0);
      }
    });
    await check(`home color treatment and footer availability ${width}`, async () => {
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.cf-hero h1')).toBeVisible();
      const background = await page.locator('.cf-hero .cf-primary').evaluate((element) => getComputedStyle(element).backgroundImage);
      assert(background.includes('linear-gradient'), 'The scoped visual treatment must be present');
      await expect(page.locator('footer')).toBeAttached({ timeout: 5000 });
      await page.screenshot({ path: `${output}/home-${width}.png`, animations: 'disabled' });
      // Theme fixture verifies contrast/layout without claiming the preference UI was tested.
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.goto(`${origin}/research`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toHaveCount(1);
      await page.screenshot({ path: `${output}/research-${width}.png`, animations: 'disabled' });
    });
    await context.close();
  }
  await check('optional background chunk failure does not erase the public route', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/assets/StudioBg3dRetainedOwnerHost-*.js', (route) => route.abort('failed'));
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/market/compare`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toHaveCount(1, { timeout: 30000 });
      await page.waitForTimeout(1500);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('header').first()).toBeVisible();
      await page.screenshot({ path: `${output}/isolated-chunk-recovery.png`, animations: 'disabled' });
    } finally { await context.close(); }
  });
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, mode: 'candidate Chromium UI interaction and fault-injection tests; not authenticated feature or embedded-WebView coverage', results }, null, 2));
}
assert(results.length > 0 && results.every((result) => result.status === 'passed'), 'Public-site candidate interaction regression failed; inspect artifacts');
