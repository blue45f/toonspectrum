import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.WORKSPACE_QA_URL ?? "http://127.0.0.1:4196";
const out = new URL("../.qa/workspace-live-resume-20260920/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [], errors = [];
let passed = false;
const contexts = [];
async function isolated() {
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  contexts.push(context);
  return context;
}
const ready = (page) => page.locator('[data-route-ready="studio-workspace"]').waitFor({ timeout: 90000 });
const state = (page, value) => page.locator(`[data-workspace-resume-state="${value}"]`).waitFor();
try {
  const context = await isolated(); const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/home?project=resume-qa`); await ready(page);
  const seed = await page.evaluate(async () => {
    const lib = await import('/src/domains/creator/studio-project-library-store.ts');
    const docs = await import('/src/domains/creator/studio-project-document-store.ts');
    const resume = await import('/src/domains/creator/studio-project-resume-target.ts');
    lib.createStudioProject(localStorage, { id: 'resume-qa', title: '이어하기 검증 작업실', kind: 'webtoon' }, { target: window });
    docs.createStudioProjectDocument(localStorage, 'resume-qa', { id: 'last', title: '최근 원고', kind: 'webtoon' });
    docs.createStudioProjectDocument(localStorage, 'resume-qa', { id: 'other', title: '열면 안 되는 다른 원고', kind: 'webtoon' });
    const project = lib.markStudioProjectOpened(localStorage, 'resume-qa', 'last', { target: window });
    return { href: resume.resolveStudioProjectResumeTarget(localStorage, project, 'ko').href,
      libraryKey: lib.STUDIO_PROJECT_LIBRARY_STORAGE_KEY, docsKey: docs.studioProjectDocumentStorageKey(project.id) };
  });
  await state(page, 'ready');
  await page.waitForFunction((href) => document.querySelector('.workspace-statusbar .workspace-primary')?.getAttribute('href') === href, seed.href);
  const originalLibrary = await page.evaluate((key) => localStorage.getItem(key), seed.libraryKey);
  await page.evaluate(async () => {
    const resume = await import('/src/domains/creator/studio-exact-resume-context.ts');
    resume.writeStudioExactResumeContext(localStorage, { projectId: 'resume-qa', documentId: 'last', workspace: 'draw', zoom: 2.25, pageId: 'page-7' }, window);
  });
  await page.locator('.workspace-statusbar small').filter({ hasText: '225%' }).waitFor();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), seed.libraryKey), originalLibrary);
  checks.push('Same-tab resume updates without artwork writes or a selected-work change');
  const fixture = (await context.storageState()).origins.find((origin) => origin.origin === new URL(base).origin)?.localStorage;
  assert.ok(fixture?.length);
  await writeFile(new URL('fixture.json', out), JSON.stringify(fixture));
  const second = await context.newPage(); await second.goto(`${base}/home?scope=personal`); await ready(second);
  second.on('pageerror', (error) => errors.push(error.message));
  await second.evaluate(async () => {
    const docs = await import('/src/domains/creator/studio-project-document-store.ts');
    docs.trashStudioProjectDocument(localStorage, 'resume-qa', 'last');
  });
  await state(page, 'unavailable');
  assert.equal(await page.locator('.workspace-statusbar .workspace-primary').getAttribute('href'), '/studio/p/resume-qa/production?view=documents');
  assert.equal(await page.locator('a[href*="/d/other"]').count(), 0);
  assert.equal(new URL(page.url()).searchParams.get('project'), 'resume-qa');
  checks.push('Real cross-tab deletion immediately blocks last manuscript without selecting its neighbour');
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: new URL(`recovery-${width}.png`, out).pathname, fullPage: true });
    checks.push(`${width}px missing-manuscript recovery has no horizontal overflow`);
  }
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element?.matches('.workspace-main a,.workspace-main button,.workspace-statusbar a,.workspace-statusbar button')) return null;
      const rect = element.getBoundingClientRect(), nav = document.querySelector('.workspace-nav').getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, navTop: nav.top };
    });
    if (focus) assert.ok(focus.top >= -1 && focus.bottom <= focus.navTop + 1, `Keyboard focus obscured: ${JSON.stringify(focus)}`);
  }
  checks.push('320px keyboard navigation keeps focused work controls above the fixed bottom menu');
  await second.evaluate(async () => {
    const docs = await import('/src/domains/creator/studio-project-document-store.ts');
    docs.restoreStudioProjectDocument(localStorage, 'resume-qa', 'last');
  });
  await state(page, 'ready');
  await page.evaluate((key) => {
    const native = Storage.prototype.getItem;
    window.__workspaceNativeRead = native;
    Storage.prototype.getItem = function (name) { if (name === key) throw new Error('TEST:storage-denied'); return native.call(this, name); };
    window.dispatchEvent(new Event('focus'));
  }, seed.docsKey);
  await state(page, 'storage-error');
  assert.equal(await page.locator('.workspace-statusbar .workspace-primary').getAttribute('href'), '/studio?view=storage');
  await page.evaluate(() => { Storage.prototype.getItem = window.__workspaceNativeRead; delete window.__workspaceNativeRead; });
  await page.getByRole('button', { name: '이어하기 다시 확인', exact: true }).click(); await state(page, 'ready');
  checks.push('Storage-access denial exposes recovery; explicit retry restores the same manuscript');
  await second.evaluate((key) => localStorage.removeItem(key), seed.docsKey); await state(page, 'unavailable');
  checks.push('Native cross-tab document-list removal invalidates the old target');
  for (const failure of ['chunk', 'image']) {
    const faulty = await isolated(); const target = await faulty.newPage();
    target.on('pageerror', (error) => errors.push(`${failure}: ${error.message}`));
    if (failure === 'chunk') await faulty.route('**/StudioWorkspaceWorld.tsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("TEST:isolated-space-module-failure");' }));
    else await faulty.route('**/assets/virtual-studio/production-v2/master-central-lossless.webp*', (route) => route.abort());
    await target.goto(`${base}/home?scope=personal`); await ready(target);
    if (failure === 'chunk') await target.locator('[data-workspace-space-error="true"]').waitFor();
    else await target.getByText('공간 이미지를 불러오지 못했습니다.', { exact: false }).waitFor();
    assert.equal(await target.locator('.workspace-nav a').count(), 4);
    await target.getByRole('button', { name: '목록 보기로 전환', exact: true }).click();
    await target.locator('.workspace-list-view').waitFor();
    assert.equal(new URL(target.url()).searchParams.get('scope'), 'personal');
    checks.push(`${failure} fault injection: only optional space fails; menus and explicit list recovery work`);
  }
  assert.deepEqual(errors, []); passed = true;
  console.log(JSON.stringify({ passed, checks, errors }, null, 2));
} finally {
  await writeFile(new URL('browser-result.json', out), JSON.stringify({ passed, checks, errors }, null, 2));
  for (const context of contexts) await context.close();
  await browser.close();
}
