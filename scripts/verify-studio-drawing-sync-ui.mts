import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";

import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

// 실제 컴포넌트의 키보드·작은 화면·중복 백업 방지를 확인하는 로컬 UI 검증이다.
const scratch = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonstudio-drawing-sync-ui");
mkdirSync(scratch, { recursive: true });
const port = await findFreePort({ unavailableMessage: "드로잉 UI 검증 포트를 찾지 못했습니다." });
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts",
  "--host", "127.0.0.1", "--port", String(port), "--strictPort",
], { stdio: "ignore" });
let browser: Browser | null = null;
const results: unknown[] = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { ready = (await fetch(`${origin}/tools/browser-harnesses/drawing-sync-safety.html`)).ok; }
    catch { /* 로컬 개발 서버가 준비될 때까지 제한된 횟수로 확인한다. */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error("UI 검증 서버가 조기 종료됐습니다.");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.ok(ready, "UI 검증 서버 준비 시간 초과");
  browser = await chromium.launch({ headless: true });
  for (const scenario of [
    { name: "desktop", width: 1440, height: 1000, local: false, mobile: false },
    { name: "phone", width: 390, height: 844, local: true, mobile: true },
    { name: "landscape", width: 844, height: 390, local: true, mobile: true },
    { name: "compact", width: 320, height: 568, local: false, mobile: false },
  ]) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height }, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/tools/browser-harnesses/drawing-sync-safety.html?mode=${scenario.local ? "local" : "server"}&mobile=${scenario.mobile ? "1" : "0"}`);
    const trigger = page.getByRole("button", { name: /동기화 상태:/ });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "기기·서버 동기화" });
    assert.equal(await dialog.evaluate((element) => element === document.activeElement), true);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.x + bounds.width <= scenario.width + 1);
    assert.ok(bounds.y + bounds.height <= scenario.height + 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
    await trigger.click();
    const backup = page.getByRole("button", { name: "프로젝트 백업", exact: true });
    await backup.click();
    const busy = page.getByRole("button", { name: "백업 파일 만드는 중", exact: true });
    assert.equal(await busy.isDisabled(), true);
    assert.equal(await busy.getAttribute("aria-busy"), "true");
    assert.equal(await page.locator("[data-backup-count]").textContent(), "1");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "백업 완료", exact: true }).click();
    await trigger.click();
    await backup.waitFor({ state: "visible" });
    assert.equal(await backup.isEnabled(), true);
    if (scenario.local) assert.equal(await page.getByText("이 기기 탭 연결", { exact: true }).count(), 1);
    await page.screenshot({ path: join(scratch, `${scenario.name}.png`) });
    assert.deepEqual(errors, []);
    results.push({ ...scenario, bounds, pageErrors: errors, status: "PASS" });
    await page.close();
  }
  const report = { status: "PASS", boundary: "production-components-with-local-state-fixture", results };
  writeFileSync(join(scratch, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  writeFileSync(join(scratch, "report.json"), JSON.stringify({ status: "FAIL", results,
    error: error instanceof Error ? error.message : String(error) }, null, 2));
  const current = browser?.contexts().at(-1)?.pages().at(-1);
  await current?.screenshot({ path: join(scratch, "failure.png") }).catch(() => undefined);
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
