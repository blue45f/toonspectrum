import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read-only audit: never submits forms, purchases, publishes, or changes account data.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = new URL(process.env.NONSTUDIO_BASE_URL || 'https://www.toonstudio.cloud');
if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Expected an HTTP origin');
const output = resolve('artifacts/nonstudio-audit');
await mkdir(output, { recursive: true });
const titleSource = await readFile('apps/web/src/app/routes/route-titles.ts', 'utf8');
const excluded = (path) => /^\/(?:studio|shaper)(?:\/|$)/.test(path);
const routes = [...new Set([...titleSource.matchAll(/^\s*"(\/[^"]*)":/gm)].map((match) => match[1]))]
  .filter((path) => !excluded(path) && !path.startsWith('/admin'));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: 'ko-KR', reducedMotion: 'reduce', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    await context.addInitScript(() => { try { sessionStorage.setItem('toonspectrum-compat-dismissed', 'true'); } catch { /* Restricted storage is audited separately. */ } });
    const queue = [...routes];
    await Promise.all(Array.from({ length: 2 }, async () => {
      const page = await context.newPage();
      while (queue.length) {
        const route = queue.shift();
        if (!route) break;
        const errors = [];
        const apiErrors = [];
        const onError = (error) => errors.push(String(error.message).slice(0, 500));
        const onResponse = (response) => {
          const url = new URL(response.url());
          if (url.origin === base.origin && response.status() >= 400) apiErrors.push({ path: url.pathname, status: response.status() });
        };
        page.on('pageerror', onError);
        page.on('response', onResponse);
        const record = { route, viewport: viewport.width, errors, apiErrors };
        try {
          const response = await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForSelector('#main-content', { timeout: 18000 });
          await page.waitForTimeout(2200);
          record.status = response?.status();
          record.finalPath = new URL(page.url()).pathname;
          Object.assign(record, await page.evaluate(() => ({
            title: document.title,
            heading: document.querySelector('h1')?.textContent?.trim() || null,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
            mainText: document.querySelector('#main-content')?.textContent?.trim().slice(0, 1500),
            links: Array.from(document.querySelectorAll('a[href]')).map((a) => ({ text: a.textContent?.trim().slice(0, 90), href: a.getAttribute('href') })).filter((a) => a.href?.startsWith('/')).slice(0, 100),
            unnamedButtons: Array.from(document.querySelectorAll('button')).filter((b) => b.getClientRects().length && !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.getAttribute('title')).length,
          })));
          const name = (route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')) + '-' + viewport.width;
          await page.screenshot({ path: resolve(output, name + '.png'), fullPage: false });
          record.screenshot = name + '.png';
          record.authGate = /로그인이 필요|로그인해 주세요|로그인 후|sign in required/i.test(record.mainText || '');
          console.log(JSON.stringify({ route, width: viewport.width, status: record.status, overflow: record.horizontalOverflow, errors: errors.length, apiErrors: apiErrors.length, authGate: record.authGate }));
        } catch (error) {
          record.failure = String(error.message).slice(0, 1000);
          console.log(JSON.stringify({ route, width: viewport.width, failure: record.failure }));
        } finally {
          page.off('pageerror', onError);
          page.off('response', onResponse);
          results.push(record);
          await writeFile(resolve(output, 'results.json'), JSON.stringify({ base: base.origin, generatedAt: new Date().toISOString(), excluded: ['studio', 'shaper (immersive editor)'], authenticatedActionsTested: false, results }, null, 2));
        }
      }
      await page.close();
    }));
    await context.close();
  }
} finally { await browser.close(); }
const summary = { pages: results.length, failedNavigation: results.filter((r) => r.failure).length, overflow: results.filter((r) => r.horizontalOverflow).length, runtimeErrors: results.filter((r) => r.errors.length).length, authGated: results.filter((r) => r.authGate).length };
await writeFile(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('NONSTUDIO_AUDIT_SUMMARY ' + JSON.stringify(summary));
// This is an evidence job, not a claim that production or authenticated actions pass.
if (results.length === 0 || results.every((result) => result.failure)) process.exitCode = 1;
