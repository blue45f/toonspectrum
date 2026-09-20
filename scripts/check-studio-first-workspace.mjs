import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.WORKSPACE_QA_URL ?? "http://127.0.0.1:4179";
const output = new URL("../.qa/studio-first-20260920/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = []; const checks = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
async function ready(target) { await target.locator('[data-route-ready="studio-workspace"]').waitFor({ timeout: 90000 }); }
async function capture(target, name) {
  await target.screenshot({ path: new URL(`${name}.png`, output).pathname, fullPage: true });
  const dimensions = await target.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.page <= dimensions.viewport + 1, `${name}: horizontal overflow`);
  checks.push(`${name}: no horizontal overflow`);
}
try {
  await page.goto(`${base}/home`, { waitUntil: "domcontentloaded", timeout: 90000 }); await ready(page);
  await page.locator('.workspace-world img').evaluate((image) => image.decode());
  assert.equal(await page.locator('.workspace-nav a').count(), 4);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await capture(page, "desktop-home");
  const trigger = page.getByRole('button', { name: '작업 바로가기 열기' }); await trigger.click();
  await page.locator('dialog[open]').waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('dialog[open]').contains(document.activeElement)), true);
  await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
  checks.push('native panel: focus inside, Escape closes and restores trigger focus');
  await page.getByRole('button', { name: '목록 보기', exact: true }).click();
  await page.locator('.workspace-list-view').waitFor(); await page.reload(); await ready(page);
  assert.equal(await page.locator('.workspace-list-view').count(), 1);
  checks.push('view preference survives reload');
  const seeded = await page.evaluate(async () => {
    const library = await import('/src/domains/creator/studio-project-library-store.ts');
    const documents = await import('/src/domains/creator/studio-project-document-store.ts');
    const resume = await import('/src/domains/creator/studio-project-resume-target.ts');
    const project = library.createStudioProject(localStorage, { id: 'workspace-qa', title: 'QA · 새벽의 작업실', kind: 'webtoon' }, { target: window });
    const document = documents.ensureInitialStudioProjectDocument(localStorage, { projectId: project.id, projectTitle: project.title, projectKind: project.kind, target: window });
    const opened = library.markStudioProjectOpened(localStorage, project.id, document.id, { target: window });
    return { id: project.id, href: resume.resolveStudioProjectResumeTarget(localStorage, opened, 'ko').href };
  });
  await page.locator('.workspace-project-select select').selectOption(seeded.id);
  await page.waitForFunction((href) => document.querySelector('.workspace-statusbar .workspace-primary')?.getAttribute('href') === href, seeded.href);
  await capture(page, 'desktop-list-with-work'); checks.push('real library/document resume adapter is connected');
  await page.evaluate(async () => {
    const library = await import('/src/domains/creator/studio-project-library-store.ts');
    library.createStudioProject(localStorage, {
      id: `workspace-newer-${Date.now()}`, title: 'A newer work must not replace my selection', kind: 'webtoon',
      createdAt: new Date(Date.now() + 60000).toISOString(),
    }, { target: window });
  });
  assert.equal(await page.locator('.workspace-project-select select').inputValue(), seeded.id);
  await page.locator('.workspace-nav').getByRole('link', { name: '팀', exact: true }).click(); await ready(page);
  await page.locator('[data-workspace-surface="team"]').waitFor();
  assert.equal(await page.locator('.workspace-link-list a').first().getAttribute('href'), `/studio/p/${seeded.id}/settings?view=team`);
  await page.getByRole('button', { name: '모집·의뢰', exact: true }).click();
  assert.equal(await page.getByRole('link', { name: /어시스트 모집·의뢰 작성/ }).getAttribute('href'), '/collaborate/new');
  await capture(page, 'desktop-team'); checks.push('team permissions and hiring use separate existing destinations');
  await page.locator('.workspace-nav').getByRole('link', { name: '둘러보기', exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: '소재', exact: true }).click();
  assert.equal(await page.getByRole('link', { name: /소재 마켓/ }).getAttribute('href'), '/market');
  await capture(page, 'desktop-explore');
  assert.equal(new URL(page.url()).searchParams.get('project'), seeded.id);
  await page.locator('.workspace-nav').getByRole('link', { name: '스튜디오', exact: true }).click(); await ready(page);
  assert.equal(await page.locator('.workspace-project-select select').inputValue(), seeded.id);
  assert.equal(await page.locator('.workspace-statusbar .workspace-primary').getAttribute('href'), seeded.href);
  await page.goBack(); await ready(page);
  assert.equal(new URL(page.url()).pathname, '/hub');
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'materials');
  assert.equal(new URL(page.url()).searchParams.get('project'), seeded.id);
  checks.push('older work survives home/team/explore and Back preserves category without changing artwork');
  await page.goto(`${base}/home?scope=personal`); await ready(page);
  for (const name of ['팀', '둘러보기', '스튜디오']) {
    await page.locator('.workspace-nav').getByRole('link', { name, exact: true }).click(); await ready(page);
    assert.equal(new URL(page.url()).searchParams.get('scope'), 'personal');
    assert.equal(await page.locator('.workspace-project-select select').inputValue(), '');
  }
  checks.push('personal workspace survives navigation despite multiple existing works');
  await page.goto(`${base}/home?project=not-available`); await ready(page);
  await page.getByText('이 기기에서 선택한 작품을 찾을 수 없습니다.', { exact: false }).waitFor();
  assert.equal(await page.locator('.workspace-statusbar .workspace-primary').count(), 0);
  checks.push('missing explicit project does not resume another work');
  for (const mode of ['목록 보기', '공간 보기']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    assert.equal(await page.locator('[data-workspace-state="missing"]').count(), 1);
    assert.equal(await page.locator('.workspace-world').count(), 0);
    assert.equal(await page.locator('a[href^="/studio/p/"]').count(), 0);
    assert.equal(await page.locator('a[href="/studio/new"]').count(), 0);
    await page.getByRole('button', { name: '작업 바로가기 열기' }).click();
    await page.locator('dialog[open]').waitFor();
    assert.equal(await page.locator('dialog[open] a[href^="/studio/p/"]').count(), 0);
    await page.keyboard.press('Escape');
  }
  await capture(page, 'desktop-missing-recovery');
  await page.getByRole('button', { name: '개인 작업실로 돌아가기', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('scope'), 'personal');
  assert.equal(new URL(page.url()).searchParams.has('project'), false);
  checks.push('missing work blocks spatial, list and inspector actions and offers explicit personal recovery');
  await page.goto(`${base}/home?project=${seeded.id}`); await ready(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.locator('.workspace-world img').evaluate((image) => image.decode());
  await capture(page, 'tablet-820-space');
  await page.setViewportSize({ width: 1440, height: 900 });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', isMobile: true, hasTouch: true });
  const phone = await mobile.newPage(); phone.on('pageerror', (error) => errors.push(error.message));
  await phone.goto(`${base}/home`); await ready(phone); await phone.locator('.workspace-list-view').waitFor();
  await capture(phone, 'mobile-390-list');
  await phone.setViewportSize({ width: 320, height: 740 }); await capture(phone, 'mobile-320-list');
  await phone.getByRole('button', { name: '공간 보기', exact: true }).click();
  await phone.locator('.workspace-world img').evaluate((image) => image.decode());
  await capture(phone, 'mobile-320-space');
  await phone.locator('.workspace-nav').getByRole('link', { name: '팀', exact: true }).click(); await ready(phone);
  await phone.locator('[data-workspace-surface="team"]').waitFor();
  await capture(phone, 'mobile-320-team');
  await mobile.close();
  await page.goto(`${base}/studio/p/${seeded.id}/space`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('[data-studio-live-shell=true]').waitFor({ timeout: 90000 });
  assert.equal(await page.locator('.workspace-nav a').count(), 4);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('.vs2-bottom').count(), 0);
  await page.getByRole('button', { name: '사람·대화', exact: true }).click(); await page.locator('dialog[open]').waitFor();
  await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await capture(page, 'desktop-live-studio'); checks.push('live shell: four destinations, no promo grid, one closed inspector');
  assert.deepEqual(errors, [], 'browser JavaScript errors');
  console.log(JSON.stringify({ status: 'passed', checks, errors }, null, 2));
} finally {
  await writeFile(new URL('browser-result.json', output), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
