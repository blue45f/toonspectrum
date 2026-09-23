import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

import {
  createStudioPointerStrokePoints,
  dispatchStudioPointerStroke,
} from './lib/studio-pointer-input-driver.mjs';

const origin = process.argv[2] ?? 'http://127.0.0.1:5299';
const target = new URL(origin);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw new Error('Loopback Skia QA only');
}
const output = path.resolve('artifacts/skia-multitab-mobile');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const report = {
  checks: [],
  errors: [],
  desktopDriver: null,
  mobileDriver: null,
  pointerInputs: [],
  physicalDeviceCertified: false,
};
const deadline = setTimeout(() => {
  report.errors.push('Skia multitab/mobile verification exceeded 180 seconds');
  void browser.close();
}, 180_000);

function observe(page, label) {
  page.on('pageerror', error => report.errors.push(`${label}: ${error.message}`));
}
async function dismissEntryUi(page) {
  for (const name of ['나중에', '닫기', '빈 캔버스', '확인']) {
    const button = page.getByRole('button', { name, exact: true }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 1500 }).catch(() => undefined);
    }
  }
  await page.keyboard.press('Escape');
}

async function selectPen(page) {
  const mobileViewport = await page.evaluate(() => innerWidth <= 1023);
  const mobile = page.locator(
    '[data-studio-mobile-editing-dock="true"] [data-studio-primary-action="draw"]',
  );
  if (mobileViewport) {
    await mobile.waitFor({ state: 'visible', timeout: 30_000 });
    if (await mobile.getAttribute('aria-pressed') !== 'true') await mobile.click();
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-studio-mobile-editing-dock="true"] [data-studio-primary-action="draw"]',
      )?.getAttribute('aria-pressed') === 'true',
    );
    return;
  }
  const rail = page.locator('[data-studio-rail-tool-id="pen"]');
  if (await rail.isVisible().catch(() => false)) await rail.click();
  else {
    await page.getByRole('button', { name: '전체 도구', exact: true }).click();
    await page.locator('[data-studio-catalog-tool-id="pen"]').click();
  }
  await page.locator('[data-studio-brush-active-pill]').waitFor({ timeout: 30_000 });
}

async function openEditor(page) {
  await page.goto(new URL('/studio/canvas', origin).href, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await page.locator('[data-studio-editor="true"]').waitFor({ timeout: 60_000 });
  await dismissEntryUi(page);
  await selectPen(page);
  const canvas = page.locator('.konvajs-content');
  await canvas.waitFor({ timeout: 30_000 });
  const bounds = await canvas.boundingBox();
  assert(bounds && bounds.width > 180 && bounds.height > 240, 'Editor canvas unavailable');
  return bounds;
}

async function drawPointerStrokes(context, page, bounds, count, mode, label) {
  const cdp = mode === 'mouse' ? null : await context.newCDPSession(page);
  try {
    for (let index = 0; index < count; index++) {
      const points = createStudioPointerStrokePoints(bounds, index + 1, { steps: 18 });
      const telemetry = await dispatchStudioPointerStroke({
        page,
        cdp,
        mode,
        points,
        stepDelayMs: mode === 'mouse' ? 0 : 2,
      });
      report.pointerInputs.push({ label, stroke: index + 1, ...telemetry });
      await page.waitForTimeout(40);
    }
  } finally {
    await cdp?.detach();
  }
}

async function waitForGpu(page, minimumItems = 1) {
  await page.waitForFunction((minimum) => {
    const surface = document.querySelector('[data-studio-skia-document-surface]');
    const count = Number(surface?.dataset.studioSkiaCachedItems ?? '0');
    return surface && surface.dataset.studioSkiaPhase === 'presented'
      && getComputedStyle(surface).visibility === 'visible' && count >= minimum;
  }, minimumItems, { timeout: 45_000 });
  return page.locator('[data-studio-skia-document-surface]').evaluate(surface => {
    const gl = surface.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      driver: gl && debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl?.getParameter(gl.RENDERER) ?? null,
      items: Number(surface.dataset.studioSkiaCachedItems ?? '0'),
      pixels: surface.toDataURL(),
    };
  });
}

async function loseGpuContext(page) {
  await page.locator('[data-studio-skia-document-surface]').evaluate(surface => {
    const extension = surface.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('GPU context-loss injection unavailable');
    return new Promise(resolve => {
      surface.addEventListener('webglcontextlost', () => resolve(), { once: true });
      extension.loseContext();
    });
  });
}

async function desktopMultitabCheck() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, locale: 'ko-KR',
  });
  const first = await context.newPage();
  observe(first, 'tab-a');
  let second;
  try {
    console.log('multitab: opening tab A');
    await first.bringToFront();
    const firstBounds = await openEditor(first);
    await drawPointerStrokes(context, first, firstBounds, 2, 'pen', 'tab-a');
    const firstReady = await waitForGpu(first, 2);
    console.log('multitab: tab A GPU ready; opening tab B');
    second = await context.newPage();
    observe(second, 'tab-b');
    await second.bringToFront();
    const secondBounds = await openEditor(second);
    await drawPointerStrokes(context, second, secondBounds, 3, 'pen', 'tab-b');
    console.log('multitab: tab B strokes submitted');
    const secondState = await waitForGpu(second, 3);
    report.desktopDriver = firstReady.driver;
    console.log('multitab: both GPU surfaces ready');
    const secondPixels = secondState.pixels;
    await first.bringToFront();
    await loseGpuContext(first);
    console.log('multitab: tab A context loss observed');
    await first.locator('[data-studio-vello-unavailable="true"]').waitFor({
      timeout: 15_000,
    });
    await second.bringToFront();
    const surviving = await waitForGpu(second, 3);
    assert.equal(
      surviving.pixels,
      secondPixels,
      'Tab B pixels changed after Tab A GPU loss',
    );
    assert.equal(
      await second.locator('[data-studio-vello-unavailable="true"]').count(),
      0,
    );
    await first.bringToFront();
    await first.getByRole('button', {
      name: '같은 GPU 엔진 다시 준비', exact: true,
    }).click();
    await waitForGpu(first, 2);
    report.checks.push(
      'Two pressure-aware pen tabs retain independent GPU recovery state without cross-tab pixel loss',
    );
  } catch (error) {
    for (const [index, page] of [first, second].filter(Boolean).entries()) {
      if (!page.isClosed()) {
        await page.screenshot({
          path: path.join(output, `desktop-failure-${index + 1}.png`),
        }).catch(() => undefined);
      }
    }
    throw error;
  } finally {
    await context.close();
  }
}

async function mobileViewportCheck() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) '
      + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 '
      + 'Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  observe(page, 'mobile');
  try {
    console.log('mobile: opening 390x844 editor');
    await page.bringToFront();
    const bounds = await openEditor(page);
    await drawPointerStrokes(context, page, bounds, 2, 'touch', 'mobile');
    const state = await waitForGpu(page, 2);
    report.mobileDriver = state.driver;
    const surfaceBounds = await page
      .locator('[data-studio-skia-document-surface]')
      .boundingBox();
    assert(surfaceBounds, 'Mobile GPU surface has no layout box');
    assert(surfaceBounds.width > 150 && surfaceBounds.height > 200);
    assert(surfaceBounds.x < 390 && surfaceBounds.y < 844);
    assert.equal(
      await page.locator('[data-studio-skia-document-surface]').count(),
      1,
    );
    await page.screenshot({ path: path.join(output, 'mobile-390x844.png') });
    report.checks.push(
      '390x844 CDP touch contact draws and publishes one bounded Skia document surface',
    );
  } catch (error) {
    if (!page.isClosed()) {
      await page.screenshot({
        path: path.join(output, 'mobile-failure.png'),
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    await context.close();
  }
}
try {
  await desktopMultitabCheck();
  await mobileViewportCheck();
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  clearTimeout(deadline);
  await browser.close();
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
