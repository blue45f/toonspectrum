import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox, webkit, expect, type Browser } from "@playwright/test";

import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const scratch = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "drawing-capability-recovery");
mkdirSync(scratch, { recursive: true });
const port = await findFreePort({ unavailableMessage: "상태 복구 검증 포트를 찾지 못했습니다." });
const origin = `http://127.0.0.1:${port}`;
const path = "/tools/browser-harnesses/service-capability-recovery.html";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts",
  "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const capabilities = {
  publicCatalog: "available", authSession: "available", communityRead: "available", communityWrite: "available",
  marketplaceRead: "available", studioLocalEditing: "available", studioProjectRead: "available", studioCloudSave: "available",
  realtimeCollaboration: "available", publishing: "available", serverAi: "available",
};
const report = (degraded = false, age = 0) => ({ status: degraded ? "degraded" : "available",
  checkedAt: new Date(Date.now() - age).toISOString(), incidentId: null, retryAfterSeconds: degraded ? 1 : null,
  capabilities: { ...capabilities, studioCloudSave: degraded ? "unavailable" : "available" },
});
const selected = (process.env.STUDIO_VERIFY_BROWSERS ?? "chromium").split(",");
const engines = { chromium, firefox, webkit };
let browser: Browser | null = null;
const results: unknown[] = [];
try {
  let ready = false;
  for (let n = 0; n < 100; n += 1) {
    try { ready = (await fetch(origin + path)).ok; } catch { /* 서버 준비 대기 */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error("검증 서버가 조기 종료됐습니다.");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.ok(ready, "검증 서버 준비 시간 초과");
  for (const engine of selected) {
    assert.ok(engine === "chromium" || engine === "firefox" || engine === "webkit");
    browser = await engines[engine].launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let checking = 0;
    let degraded = false;
    let typedFailure = false;
    await context.route("**/api/health/capabilities", async (route) => {
      checking += 1;
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(report(degraded)) });
    });
    await context.route("**/api/qa/capability-failure", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify(typedFailure
        ? { code: "CAPABILITY_UNAVAILABLE", capability: "creator.work.write", retryAfterSeconds: 1 }
        : { message: "격리 검증 요청 실패" }) });
    });
    await context.addInitScript(({ value }) => {
      localStorage.setItem("toonspectrum:service-capabilities:v1", JSON.stringify(value));
    }, { value: report(true, 86_400_000) });
    await page.goto(origin + path);
    await expect(page.locator("html")).toHaveAttribute("data-service-capability-state", "available");
    assert.equal(await page.locator('[data-service-degraded-banner="degraded"]').count(), 0);

    await page.getByRole("button", { name: "온라인 요청 실행" }).click();
    await expect(page.getByRole("status")).toContainText("온라인 연결 상태를 다시 확인");
    await expect(page.getByRole("status")).not.toContainText("커뮤니티·클라우드 저장·협업·게시");
    await expect(page.locator("html")).toHaveAttribute("data-service-capability-state", "available", { timeout: 5_000 });

    typedFailure = true; degraded = true;
    await page.getByRole("button", { name: "온라인 요청 실행" }).click();
    await expect(page.getByRole("status")).toContainText("클라우드 저장");
    await expect(page.getByRole("status")).not.toContainText("커뮤니티 조회");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    assert.deepEqual(axe.violations.map((value) => ({ id: value.id, targets: value.nodes.map((node) => node.target) })), []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(scratch, `${engine}-confirmed.png`), fullPage: true });

    await context.setOffline(true);
    degraded = false;
    await context.setOffline(false);
    await expect(page.locator("html")).toHaveAttribute("data-service-capability-state", "available", { timeout: 5_000 });
    const otherTab = await context.newPage();
    await otherTab.goto(origin + path);
    await expect(otherTab.locator("html")).toHaveAttribute("data-service-capability-state", "available");
    await otherTab.evaluate((value) => localStorage.setItem("toonspectrum:service-capabilities:v1", JSON.stringify(value)), report(true, 30_000));
    await page.waitForTimeout(250);
    assert.equal(await page.locator("html").getAttribute("data-service-capability-state"), "available");
    await page.screenshot({ path: join(scratch, `${engine}-recovered.png`), fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ engine, version: browser.version(), status: "PASS", checking, pageErrors: errors,
      cases: ["만료 캐시 무시", "범위 없는 HTTP 503 안내", "확인된 저장 장애 안내", "온라인 복귀", "다른 탭의 과거 상태 무시", "WCAG A/AA", "390px 화면"] });
    await context.close(); await browser.close(); browser = null;
  }
  writeFileSync(join(scratch, "report.json"), JSON.stringify({ status: "PASS", boundary: "local-http-failure-injection-not-production-db", results }, null, 2));
  console.log(JSON.stringify({ status: "PASS", results }, null, 2));
} catch (error) {
  writeFileSync(join(scratch, "report.json"), JSON.stringify({ status: "FAIL", results, error: String(error) }, null, 2));
  const page = browser?.contexts().at(-1)?.pages().at(-1);
  await page?.screenshot({ path: join(scratch, "failure.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally { await browser?.close(); server.kill("SIGTERM"); }
