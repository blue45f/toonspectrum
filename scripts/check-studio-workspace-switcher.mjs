import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Uses source fixtures on an isolated local Vite server, never a normal user profile.
const base = process.env.WORKSPACE_QA_URL ?? "http://127.0.0.1:4193";
const output = new URL("../.qa/workspace-switcher-20260920/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
const page = await context.newPage(); const checks = []; const errors = []; let passed = false;
page.on("pageerror", (error) => errors.push(error.message));
const ready = () => page.locator('[data-route-ready="studio-workspace"]').waitFor({ timeout: 90000 });
const trigger = () => page.getByRole("button", { name: "작품 찾아 전환", exact: true });
const search = () => page.getByRole("searchbox", { name: "작품 제목 검색" });
const focused = (target) => target.evaluate((element) => element === document.activeElement);
const librarySnapshot = () => page.evaluate(async () => {
  const library = await import('/src/domains/creator/studio-project-library-store.ts');
  return localStorage.getItem(library.STUDIO_PROJECT_LIBRARY_STORAGE_KEY);
});
try {
  await page.goto(`${base}/home?scope=personal`, { timeout: 90000 }); await ready();
  await page.evaluate(async () => {
    const library = await import('/src/domains/creator/studio-project-library-store.ts');
    for (let i = 0; i < 65; i++) library.createStudioProject(localStorage, {
      id: `picker-${String(i).padStart(2, '0')}`, title: i < 2 ? '새벽 작업실' : i === 64 ? '긴제목'.repeat(30) : `샘플 작품 ${i}`,
      kind: 'webtoon', createdAt: '2026-09-20T00:00:00.000Z',
    }, { target: window });
  });
  await page.goto(`${base}/home?project=picker-00`); await ready();
  const snapshot = await librarySnapshot();
  await trigger().click(); await search().waitFor();
  assert.equal(await focused(search()), true); assert.equal(await page.locator('dialog[open]').count(), 1);
  assert.equal(await page.locator('button[data-workspace-project]').count(), 30);
  await page.getByRole('button', { name: '작품 더 보기' }).click();
  assert.equal(await page.locator('button[data-workspace-project]').count(), 60);
  checks.push('one modal, initial search focus and bounded result expansion');
  await search().fill('새벽'.normalize('NFD'));
  assert.equal(await page.locator('button[data-workspace-project]').count(), 2);
  await search().focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
  assert.equal(await focused(page.locator('button[data-workspace-project="picker-01"]')), true);
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('project') === 'picker-01' && !url.searchParams.has('panel'));
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await focused(trigger()), true); assert.equal(await librarySnapshot(), snapshot);
  await page.goBack(); await ready();
  assert.equal(new URL(page.url()).searchParams.get('project'), 'picker-00');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  checks.push('Korean composition, duplicate-title exact selection, focus return and clean Back history; library unchanged');
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await trigger().click(); await search().fill('긴제목');
    await page.locator('button[data-workspace-project="picker-64"]').waitFor();
    const overflow = await page.evaluate(() => [document.documentElement, document.querySelector('dialog[open]'), document.querySelector('.workspace-inspector-content')].some((el) => el.scrollWidth > el.clientWidth + 1));
    assert.equal(overflow, false, `overflow at ${width}px`);
    await page.screenshot({ path: new URL(`switcher-${width}.png`, output).pathname, fullPage: true });
    await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'detached' });
    assert.equal(await focused(trigger()), true);
    checks.push(`${width}px: long-title layout, Escape and focus restoration`);
  }
  await page.goto(`${base}/team?project=picker-00&tab=recruit`); await ready();
  await trigger().click(); await search().fill('작업실');
  await page.locator('button[data-workspace-project="picker-01"]').click();
  assert.equal(new URL(page.url()).pathname, '/team');
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'recruit');
  checks.push('switching keeps the team activity and changes only the selected work');
  await trigger().click();
  await page.evaluate(async () => {
    const library = await import('/src/domains/creator/studio-project-library-store.ts');
    library.trashStudioProject(localStorage, 'picker-01', { target: window });
  });
  await page.locator('button[data-workspace-project="picker-01"]').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).searchParams.get('project'), 'picker-01');
  await page.locator('dialog[open]').getByRole('button', { name: /개인 작업실/ }).click();
  assert.equal(new URL(page.url()).searchParams.get('scope'), 'personal');
  assert.equal(new URL(page.url()).searchParams.has('project'), false);
  checks.push('a removed work never selects another one; explicit personal recovery remains available');
  assert.deepEqual(errors, []); passed = true;
  console.log(JSON.stringify({ passed, checks, errors }, null, 2));
} finally {
  await writeFile(new URL('browser-result.json', output), JSON.stringify({ passed, checks, errors }, null, 2));
  await browser.close();
}
