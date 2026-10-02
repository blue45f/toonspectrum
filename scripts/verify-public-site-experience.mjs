import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

import { chromium, expect } from "@playwright/test";
import { assertStudioWorkspaceHome } from "./lib/studio-workspace-browser-contract.mjs";
import { assertPublicCreatorHome } from "./lib/public-home-browser-contract.mjs";
import { assertPublicMobileNavigation } from "./lib/public-navigation-browser-contract.mjs";
import { installBetaEventDismissal } from "./lib/public-page-event-gate.mjs";

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
    await context.addInitScript(() => localStorage.setItem('toonstudio-lang', JSON.stringify({ state: { lang: 'ko' }, version: 0 })));
    const page = await context.newPage();
    await installBetaEventDismissal(page);
    await check(`connected journey and history ${width}`, async () => {
      await page.goto(`${origin}/learn`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toHaveCount(1);
      const next = page.locator('.public-site-next__card').first();
      await expect(next).toHaveAttribute('href', '/market/browse');
      await next.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const position = await page.evaluate(() => window.scrollY);
      assert(position > 100, 'History test must start away from the top');
      await page.screenshot({ path: `${output}/next-steps-${width}.png`, animations: 'disabled', timeout: 20000 });
      await next.click();
      await expect(page).toHaveURL(/\/market\/browse$/u);
      await expect(page.locator('main h1')).toHaveCount(1);
      await page.goBack();
      await expect(page).toHaveURL(/\/learn$/u);
      await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - position), { timeout: 8000 }).toBeLessThan(25);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    await check(`single current navigation stays visible ${width}`, async () => {
      await page.goto(`${origin}/community`, { waitUntil: 'domcontentloaded' });
      if (width < 768) {
        await assertPublicMobileNavigation(page, '/community');
        await page.screenshot({ path: `${output}/community-${width}.png`, animations: 'disabled', timeout: 20000 });
        return;
      }
      // 현재 위치는 헤더 주 메뉴 한 곳에만 표시한다(두 번째 단계 탐색 줄 제거).
      await expect(page.locator('.public-site-journey')).toHaveCount(0);
      const active = page.getByRole('navigation', { name: '주요 메뉴', exact: true }).locator('.site-header__primary-link[aria-current]');
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute('href', '/community');
      await page.screenshot({ path: `${output}/community-${width}.png`, animations: 'disabled', timeout: 20000 });
    });
    await check(`search filter focus and 404 recovery ${width}`, async () => {
      await page.goto(`${origin}/__public-experience-not-found__`, { waitUntil: 'domcontentloaded' });
      const form = page.getByRole('search', { name: '작품 검색으로 다시 시작' });
      await expect(form).toBeVisible();
      await form.locator('input').fill('마법');
      await form.getByRole('button', { name: '검색', exact: true }).click();
      await expect(page).toHaveURL(/\/search\?q=/u);
      await expect(page.locator('main h1')).toHaveCount(1);
      const filters = page.locator('main a[href="#toonstudio-search-explorer-top"]');
      await filters.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#toonstudio-search-explorer-top')).toBeFocused();
      const top = await page.locator('#toonstudio-search-explorer-top').evaluate((element) => element.getBoundingClientRect().top);
      assert(top >= 0, 'Filter destination must not be above the viewport');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    await check(`decorations stay out of account and legal workflows ${width}`, async () => {
      for (const route of ['/settings', '/library', '/privacy', '/terms']) {
        await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#main-content')).toBeVisible();
        // 정책 문서는 공개 GNB·푸터를 공유하지만 홍보/다음 작업 패널은 주입하지 않는다.
        await expect(page.locator('[data-public-experience="atelier"]')).toHaveCount(['/privacy', '/terms'].includes(route) ? 1 : 0);
        await expect(page.locator('.public-site-next, .public-site-demo, .site-atelier-chapter')).toHaveCount(0);
        await expect(page.locator('main h1')).toHaveCount(1);
      }
    });
    await check(`home color treatment and footer availability ${width}`, async () => {
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
      await assertPublicCreatorHome(page);
      const background = await page.locator('.rd-search').evaluate((element) => getComputedStyle(element).backgroundColor);
      assert(background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent', 'The primary action must retain its theme surface');
      await expect(page.locator('footer')).toBeAttached({ timeout: 5000 });
      await page.screenshot({ path: `${output}/home-${width}.png`, animations: 'disabled', timeout: 20000 });
      // Theme fixture verifies contrast/layout without claiming the preference UI was tested.
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.goto(`${origin}/research`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toHaveCount(1);
      await page.screenshot({ path: `${output}/research-${width}.png`, animations: 'disabled', timeout: 20000 });
    });
    await check(`personal workspace remains distinct from the public home ${width}`, async () => {
      // 개인 작업공간은 게스트 신원이 있어야 열리고(없으면 계정 안내가 먼저 뜬다), 처음 여는 작업 투어·만화 인트로는
      // 닫기 후 초점을 가져가므로 목록형(classic) 작업공간으로 연다(verify-purpose-first-home과 같은 조건).
      // 다른 공개 검사에 영향이 없도록 이 검사 안에서만 심고 끝나면 지운다.
      const seeds = {
        'toonstudio-guest-session-v1': { id: 'guest_e2e-public-site', createdAt: Date.now() },
        'toonstudio-creator-experience-mode-v1': { mode: 'classic' },
      };
      await page.goto(`${origin}/about`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((entries) => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value)); }, seeds);
      try {
        await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' });
        await assertStudioWorkspaceHome(page);
      } finally {
        await page.evaluate((keys) => { for (const key of keys) localStorage.removeItem(key); }, Object.keys(seeds));
      }
    });
    await check(`optional studio preview reveals real artwork ${width}`, async () => {
      await page.goto(`${origin}/about`, { waitUntil: 'domcontentloaded' });
      const demo = page.locator('details.public-site-demo');
      await expect(demo).not.toHaveAttribute('open');
      const summary = demo.locator('summary');
      await summary.scrollIntoViewIfNeeded();
      await summary.focus();
      await summary.press('Enter');
      await expect(demo).toHaveAttribute('open');
      await expect.poll(() => demo.locator('img').count()).toBeGreaterThan(0);
      for (const image of await demo.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0),
          { timeout: 15000, message: 'Expanded preview artwork must load' }).toBe(true);
      }
      await summary.focus();
      await summary.press('Enter');
      await expect(demo).not.toHaveAttribute('open');
      await expect(summary).toBeFocused();
    });
    await context.close();
  }
  await check('optional background chunk failure does not erase the public route', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/assets/StudioBg3dRetainedOwnerHost-*.js', (route) => route.abort('failed'));
    const page = await context.newPage();
    await installBetaEventDismissal(page);
    try {
      await page.goto(`${origin}/market/compare`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main h1')).toHaveCount(1, { timeout: 30000 });
      await page.waitForTimeout(1500);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('header').first()).toBeVisible();
      await page.screenshot({ path: `${output}/isolated-chunk-recovery.png`, animations: 'disabled', timeout: 20000 });
    } finally { await context.close(); }
  });
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, mode: 'candidate Chromium UI interaction and fault-injection tests; not authenticated feature or embedded-WebView coverage', results }, null, 2));
}
assert(results.length > 0 && results.every((result) => result.status === 'passed'), 'Public-site candidate interaction regression failed; inspect artifacts');
