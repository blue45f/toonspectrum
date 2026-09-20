import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const base = new URL(process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5317");
assert(["localhost", "127.0.0.1"].includes(base.hostname), "Use an isolated local QA server");
const output = process.env.QA_OUT ?? "/tmp/toonstudio-main-release-20260921/browser-main";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], failures = [];
async function geometry(page, name) {
  const value = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, height: innerHeight }));
  assert(value.document <= value.width + 1, `${name}: horizontal overflow ${JSON.stringify(value)}`);
  assert.equal(await page.getByRole("navigation", { name: "주 메뉴", exact: true }).getByRole("link").count(), 4);
  assert.equal(await page.locator("main").count(), 1);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  return value;
}
async function waitWorld(page) {
  await page.locator('[data-studio-engine-status="ready"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[data-studio-phaser-runtime]')?.hasAttribute('data-local-x'));
}
try {
  for (const [width, height] of [[1440,900], [1366,768], [1024,768], [390,844], [320,740]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    await context.route("**/api/auth/session", (route) => route.fulfill({ json: { user: null } }));
    const page = await context.newPage(), errors = [], admissions = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/") && /acoustic|live-ticket|live-connection|work-sessions/.test(new URL(request.url()).pathname)) admissions.push(new URL(request.url()).pathname); });
    try {
      await page.goto(base.origin); await waitWorld(page);
      assert.equal(await page.locator('[data-studio-personal-space="true"]').count(), 1);
      assert.equal(await page.locator('.workspace-world').count(), 0, "Home must not fall back to the old static artwork card");
      assert.equal(await page.locator('a[href*="virtual-demo"]').count(), 0, "Personal space must not link to a manufactured project");
      const size = await geometry(page, `home-${width}`);
      const runtime = page.locator('[data-studio-phaser-runtime]');
      if (width === 1440) {
        const readPoint = () => runtime.evaluate((element) => [Number(element.getAttribute('data-local-x')), Number(element.getAttribute('data-local-y'))]);
        const initial = await readPoint();
        await runtime.locator('canvas').focus(); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(350); await page.keyboard.up('ArrowRight');
        const moved = await readPoint(); assert.notDeepEqual(moved, initial, "Keyboard must move the actual avatar");
        await page.getByRole('button', {name: /방·팀원 찾기/}).click();
        const dialog = page.getByRole('dialog', {name: '방·팀원 찾기', exact: true});
        await dialog.waitFor(); const atSearch = await readPoint();
        await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(250); await page.keyboard.up('ArrowLeft');
        assert.deepEqual(await readPoint(), atSearch, "Search must own keys without moving the world");
        await page.keyboard.press('Escape');
        const audit = await new AxeBuilder({page}).include('[data-studio-live-shell]').withTags(['wcag2a','wcag2aa']).analyze();
        results.push({name:'live-home-accessibility',violations:audit.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});
        assert.deepEqual(audit.violations, [], 'Live home accessibility');
      }
      await page.getByRole('button', {name:'공동 작업 세션', exact:true}).click();
      await page.getByRole('dialog', {name:'공동 작업 세션', exact:true}).waitFor();
      await page.getByRole('button', {name:'패널 닫기', exact:true}).click();
      assert.deepEqual(admissions, [], 'A personal home must not create or read privileged sessions');
      await page.getByRole('button', {name:'목록 보기', exact:true}).click();
      await page.locator('.workspace-list-view').waitFor();
      assert.equal(await page.locator('[data-studio-phaser-runtime]').count(), 0);
      await geometry(page, `list-${width}`);
      for (const [name, url] of [['works','/studio'], ['team','/team'], ['explore','/hub']]) {
        await page.goto(base.origin + url); await page.locator('.workspace-shell').waitFor();
        await geometry(page, `${name}-${width}`);
      }
      assert.deepEqual(errors, [], `${width}: runtime errors`);
      results.push({name:`runtime-and-navigation-${width}`,size,errors,admissions});
    } catch (error) {
      failures.push({width,message:String(error)});
      await page.screenshot({path:path.join(output,`failed-${width}.png`),fullPage:true}).catch(()=>{});
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  const report={generatedAt:new Date().toISOString(),base:base.origin,results,failures};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(failures.length)process.exitCode=1;
}
