import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../", import.meta.url));
const filename = `.spatial-reader-qa-${process.pid}.html`;
const entry = path.join(root, "apps/web", filename);
const artifacts = await mkdtemp(path.join(os.tmpdir(), "spatial-reader-browser-"));
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spatial reader QA</title><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import Reader from '/src/domains/creator/spatial/SpatialWebtoonReader.tsx';
Object.defineProperty(navigator, 'xr', { configurable: true, value: undefined });
const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 4800;
const ctx = canvas.getContext('2d'); ctx.fillStyle = '#faf7ef'; ctx.fillRect(0,0,800,4800);
for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#175266':'#934c38';ctx.fillRect(40,i*600+40,720,480);ctx.fillStyle='#fff';ctx.font='bold 52px sans-serif';ctx.fillText('READING PANEL '+(i+1),80,i*600+280);}
const page = canvas.toDataURL('image/png'); const app = createRoot(document.getElementById('root'));
app.render(React.createElement(Reader,{pages:[page,page],title:'공간 웹툰 검증',workId:'local:browser-test',onClose:()=>app.unmount()}));
</script></body></html>`;
let server; let browser;
try {
  await writeFile(entry, html);
  server = await createServer({ configFile: path.join(root, "apps/web/vite.config.ts"), server: { host: "127.0.0.1", port: 5297, strictPort: true, open: false } });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const errors = [];
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    await page.goto(`http://127.0.0.1:5297/${filename}`, { waitUntil: "networkidle" });
    await page.getByRole("dialog").waitFor();
    await page.waitForFunction(() => document.querySelector('.spatial-reader-crop img')?.naturalWidth === 800);
    assert.equal(await page.getByRole("button", { name: "AR로 읽기" }).isDisabled(), true);
    const next = page.getByRole("button", { name: "다음 구간" });
    await next.click(); await page.getByRole("img", { name: "공간 웹툰 검증 1페이지 · 2구간" }).waitFor();
    const translation = await page.locator('.spatial-reader-crop img').evaluate((img) => getComputedStyle(img).transform);
    assert.notEqual(translation, "none");
    await page.getByLabel("읽기 방향").selectOption("rtl");
    await next.focus(); await page.keyboard.press("ArrowLeft");
    await page.getByRole("img", { name: "공간 웹툰 검증 1페이지 · 3구간" }).waitFor();
    await page.getByLabel("공간 리더 페이지 바로가기").fill("1");
    await page.getByRole("img", { name: "공간 웹툰 검증 2페이지 · 1구간" }).waitFor();
    await page.waitForFunction(() => document.querySelector(".spatial-reader-navigation [role=status]")?.textContent?.includes("1 / 5 구간"));
    assert.equal(await next.isDisabled(), false);
    await next.click(); await page.getByRole("img", { name: "공간 웹툰 검증 2페이지 · 2구간" }).waitFor();
    await page.getByLabel("읽기 배경").selectOption("paper");
    await page.locator("dialog").evaluate((dialog) => { dialog.scrollTop = 0; });
    const widths = await page.locator("dialog").evaluate((dialog) => ({ width: dialog.clientWidth, scroll: dialog.scrollWidth }));
    assert.ok(widths.scroll <= widths.width + 1, `${name}: horizontal overflow`);
    await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
    await page.getByRole("button", { name: "공간 리더 닫기" }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await context.close();
  }
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(JSON.stringify({ ok: true, tested: ["desktop", "mobile", "2D fallback", "segment cropping", "RTL keyboard", "page jump", "theme", "dialog close", "horizontal overflow"], artifacts }, null, 2));
} finally {
  await browser?.close(); await server?.close(); await rm(entry, { force: true });
}
