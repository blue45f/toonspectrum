import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const base = new URL(process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:4187");
assert(["127.0.0.1", "localhost"].includes(base.hostname), "Use an isolated local browser");
const output = process.env.QA_OUT ?? "/tmp/toon-final-unified-workflow";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const cases = [], failures = [];
const routes = ["/studio/new", "/studio/import", "/studio/assets", "/studio/review", "/studio/versions", "/production", "/help", "/discover", "/ranking", "/market"];
try {
  for (const [width, height] of [[1440, 900], [820, 1180], [390, 844], [320, 740]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", locale: "ko-KR" });
    await context.route("**/api/auth/session", (route) => route.fulfill({ json: { user: null } }));
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    for (const route of routes) {
      const name = `${route.replaceAll("/", "-").slice(1)}-${width}`, errors = [];
      const capture = error => errors.push(error.message);
      page.on("pageerror", capture);
      try {
        await page.goto(base.origin + route, { waitUntil: "domcontentloaded" });
        await page.locator('[data-workspace-surface="task"]').waitFor();
        await page.waitForTimeout(1600);
        const main = page.getByRole("navigation", { name: "주 메뉴", exact: true });
        assert.equal(await main.count(), 1, "Exactly one GNB");
        assert.equal(await main.getByRole("link").count(), 4, "Four global destinations");
        const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        assert(geometry.document <= geometry.viewport + 1, `Horizontal overflow: ${JSON.stringify(geometry)}`);
        assert.equal(await page.locator("main").count(), 1, "One main landmark");
        assert.deepEqual(errors, [], "Runtime errors");
        const audio = page.locator('[data-site-ost="mounted"]');
        if (await audio.count()) assert(await audio.evaluate(el => !!el.closest('#workspace-audio-dock')), "Task OST is in the header, not covering content");
        await page.locator('.workspace-task-route-content h1').first().waitFor({ state: 'visible' });
        if (route === "/studio/new") {
          const create = page.getByRole('button', { name: '웹툰 시작', exact: true });
          await create.waitFor();
          if (width === 1440) assert((await create.boundingBox()).y < height - 80, 'Desktop create action is above the fold');
          assert.equal(await page.getByText('이 기기에 저장됨', { exact: true }).count(), 0, 'No pre-creation saved claim');
          await page.getByRole('button', { name: 'OST 설정', exact: true }).click();
          await page.getByLabel('OST 음량', { exact: true }).waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('button', { name: 'OST 설정', exact: true }).getAttribute('aria-expanded'), 'false');
          if (width === 1440) {
            const audit = await new AxeBuilder({page}).include('[data-workspace-surface="task"]').withTags(['wcag2a','wcag2aa']).analyze();
            cases.push({name: 'new-work-accessibility', violations: audit.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))});
            assert.deepEqual(audit.violations, [], 'New work accessibility');
          }
        }
        await page.screenshot({ path: path.join(output, name+'.png') });
        cases.push({ name, geometry, errors });
      } catch (error) {
        failures.push({ name, message: String(error) });
        await page.screenshot({ path: path.join(output, name+'-failed.png') }).catch(()=>{});
      } finally { page.off('pageerror', capture); }
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
  const writes = [];
  await context.route('**/api/**', route => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/auth/session')) return route.fulfill({json:{user:null}});
    if (!['GET','HEAD','OPTIONS'].includes(request.method())) { writes.push(new URL(request.url()).pathname); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await page.goto(base.origin+'/studio/new');
    await page.getByLabel('프로젝트 이름', {exact:true}).fill('QA-로컬-작품-재개');
    await page.getByRole('button',{name:'웹툰 시작',exact:true}).click();
    await page.waitForURL(url => url.pathname !== '/studio/new', {timeout:60000});
    const created = page.url();
    assert(new URL(created).pathname.startsWith('/studio/'), 'Creation stays in the actual studio');
    await page.goto(base.origin+'/studio');
    await page.getByText('QA-로컬-작품-재개', {exact:true}).first().waitFor({timeout:60000});
    await page.screenshot({path:path.join(output,'created-work-library.png')});
    assert.deepEqual(writes, [], 'Anonymous creation uses local storage, not server writes');
    cases.push({name:'create-and-find-local-work',createdPath:new URL(created).pathname,writes});
  } catch (error) { failures.push({name:'create-and-find-local-work',message:String(error)}); }
  finally { await context.close(); }
} finally {
  await browser.close();
  const report = { generatedAt: new Date().toISOString(), base: base.origin, cases, failures };
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if (failures.length) process.exitCode = 1;
}
