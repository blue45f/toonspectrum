/** Browser regression against a running app. No accounts, paid APIs or database writes. */
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';

const base = process.env.PLAYGROUND_BASE_URL || 'http://127.0.0.1:5270';
const output = process.env.PLAYGROUND_QA_DIR || path.join(tmpdir(), 'toonstudio-playground-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL === '' ? {} : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const passed = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
page.setDefaultTimeout(25000);
const done = (name) => { passed.push(name); console.log('PASS', name); };
const open = async (game) => {
  await page.goto(`${base}/play${game ? `?game=${game}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator(game ? '.play-lab-content' : '.play-card-grid').waitFor({ timeout: 60000 });
};
const download = async (button, name) => {
  const wait = page.waitForEvent('download'); await button.click();
  const file = await wait; const target = path.join(output, name); await file.saveAs(target);
  assert((await stat(target)).size > 80, `${name} should contain exported content`);
  return target;
};
try {
  await open();
  await expect(page.locator('.play-content-card')).toHaveCount(11);
  await page.getByRole('button', { name: '드로잉 스프린트 즐겨찾기', exact: true }).click();
  await page.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect(page.locator('.play-content-card')).toHaveCount(1);
  await page.locator('.play-filter-tabs').getByRole('button', { name: /^전체/ }).click();
  await expect(page.locator('.play-content-card')).toHaveCount(11);
  await page.getByRole('searchbox', { name: '놀이터 콘텐츠 검색' }).fill('콘티');
  await expect(page.locator('.play-content-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '놀이터 콘텐츠 검색' }).fill('');
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  done('11 experiences, favorites, category and Korean search');

  await open('sketch-sprint&seed=e2e-browser');
  let canvas = page.getByRole('application', { name: '드로잉 캔버스', exact: true });
  await canvas.focus(); await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByRole('button', { name: '다시 실행', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeEnabled();
  await context.setOffline(true);
  canvas = page.getByRole('application', { name: '드로잉 캔버스', exact: true });
  await canvas.focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
  const svg = await download(page.getByRole('button', { name: 'SVG 저장', exact: true }), 'sketch.svg');
  assert((await readFile(svg, 'utf8')).includes('<path'));
  const png = await download(page.getByRole('button', { name: 'PNG 저장', exact: true }), 'sketch.png');
  assert.equal((await readFile(png)).subarray(1, 4).toString(), 'PNG');
  await page.getByRole('button', { name: '연습 완료', exact: true }).click();
  await expect(page.getByRole('button', { name: '연습 완료됨', exact: true })).toBeDisabled();
  await context.setOffline(false);
  done('keyboard strokes, undo/redo, draft reload, offline interaction and real SVG/PNG downloads');

  await open('line-dojo');
  const line = page.getByRole('application', { name: '선 긋기 연습 캔버스' });
  await line.scrollIntoViewIfNeeded();
  const rect = await line.boundingBox(); assert(rect);
  await page.mouse.move(rect.x + rect.width * .12, rect.y + rect.height * .75);
  await page.mouse.down(); await page.mouse.move(rect.x + rect.width * .88, rect.y + rect.height * .25, { steps: 30 }); await page.mouse.up();
  await page.getByRole('button', { name: '선의 흐름 확인', exact: true }).click();
  await expect(page.getByRole('region', { name: '선 연습 결과' })).toBeVisible();
  assert(Number(await page.locator('.play-score').innerText().then((text) => text.split('/')[0])) >= 85);
  done('pointer drawing and guide scoring');

  await open('story-dice');
  const firstCard = await page.locator('.play-story-card p').first().innerText();
  await page.getByRole('button', { name: '장르 카드 잠그기', exact: true }).click();
  await page.getByRole('button', { name: '새 조합 만들기', exact: true }).click();
  assert.equal(await page.locator('.play-story-card p').first().innerText(), firstCard);
  await page.locator('.play-field textarea').fill('나의 비공개 로그라인');
  const note = await download(page.getByRole('button', { name: '노트 파일 저장', exact: true }), 'story.md');
  assert((await readFile(note, 'utf8')).includes('나의 비공개 로그라인'));
  await page.getByRole('button', { name: '로그라인 완성', exact: true }).click();
  await expect(page.locator('.play-feedback')).toContainText('창작 기록');
  done('story card locks, editable notes and Markdown export');

  await open('color-sense');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '색 비교하기', exact: true }).click();
    if (i < 4) await page.getByRole('button', { name: '다음 색 도전 →', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: '새로운 5라운드', exact: true })).toBeVisible();
  await expect(page.locator('.play-feedback')).toContainText('5라운드를 마쳤습니다');
  done('complete five-round color exercise');

  await open('palette-lab');
  const color = await page.locator('input[type=color]').first().inputValue();
  await page.getByRole('button', { name: '1번 색 잠그기', exact: true }).click();
  await page.getByRole('button', { name: '새 배색 만들기', exact: true }).click();
  assert.equal(await page.locator('input[type=color]').first().inputValue(), color);
  const css = await download(page.getByRole('button', { name: 'CSS 파일 저장', exact: true }), 'palette.css');
  assert((await readFile(css, 'utf8')).includes('--toon-color-5:'));
  done('palette locks and five editable CSS variables');

  await open('four-panel');
  await page.getByRole('textbox', { name: '작품 제목', exact: true }).fill('브라우저 검증 콘티');
  for (let i = 0; i < 4; i++) {
    await page.locator('.play-panel-select').nth(i).click();
    await page.getByRole('textbox', { name: '대사 / 내레이션', exact: true }).fill(`${i + 1}컷 테스트 대사`);
  }
  await page.getByRole('button', { name: '4컷 완성', exact: true }).click();
  const json = await download(page.getByRole('button', { name: '수정 가능한 JSON 저장', exact: true }), 'storyboard.json');
  const board = JSON.parse(await readFile(json, 'utf8')); assert.equal(board.panels.length, 4);
  await page.getByRole('button', { name: '1컷 뒤로 이동', exact: true }).click();
  await page.getByLabel('콘티 JSON 파일 열기').setInputFiles(json);
  await expect(page.locator('.play-feedback')).toContainText('복원');
  await page.getByLabel('콘티 JSON 파일 열기').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version": 999}') });
  await expect(page.locator('.play-feedback')).toContainText('현재 작업은 변경하지 않았습니다');
  await expect(page.getByRole('textbox', { name: '작품 제목', exact: true })).toHaveValue('브라우저 검증 콘티');
  await download(page.getByRole('button', { name: 'PNG 저장', exact: true }), 'storyboard.png');
  done('four-panel captions, reorder, completion, JSON roundtrip, invalid import preservation and PNG export');

  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  const mobile = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert(mobile.scroll <= mobile.width + 1, JSON.stringify(mobile));
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await open('sketch-sprint');
  const mobileGame = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert(mobileGame.scroll <= mobileGame.width + 1, JSON.stringify(mobileGame));
  done('390px hub and drawing workspace without horizontal overflow');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, errors, base }, null, 2));
  console.log(`PASS ${passed.length} browser scenarios; artifacts: ${output}`);
} catch (error) {
  console.error('PAGE_URL', page.url());
  console.error('PAGE_ERRORS', errors);
  console.error('PAGE_TEXT', (await page.locator('body').innerText()).slice(0, 3000));
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
