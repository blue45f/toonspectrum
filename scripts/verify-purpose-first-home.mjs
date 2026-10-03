import assert from "node:assert/strict";

import { chromium } from "@playwright/test";
import { assertStudioWorkspaceHome } from "./lib/studio-workspace-browser-contract.mjs";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const viewports = [
  ["desktop", 1440, 1000, "ko-KR"],
  ["tablet", 820, 1180, "ko-KR"],
  ["mobile", 390, 844, "ko-KR"],
  ["english-mobile", 390, 844, "en-US"],
];
const requiredDestinations = [
  "/story-lab",
  "/studio/new",
  "/studio/bg3d",
  "/studio",
  "/studio/assets",
  "/production",
  "/studio/publish",
  "/collaborate",
  "/learn",
];

const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height, locale] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      locale,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.addInitScript((language) => {
      localStorage.setItem(
        "toonstudio-lang",
        JSON.stringify({ state: { lang: language.startsWith("ko") ? "ko" : "en" }, version: 0 }),
      );
      // 2026-09-30부터 /home은 로그인 또는 게스트 세션이 없으면 환영 게이트를 먼저 보인다.
      // 작업 홈 계약을 검증하려면 게스트 신원(client-local)을 먼저 심어 둔다.
      localStorage.setItem(
        "toonstudio-guest-session-v1",
        JSON.stringify({ id: "guest_e2e-purpose-first-home", createdAt: Date.now() }),
      );
      // Validate the settled list workspace first, then exercise the explicit
      // Spatial Campus entry boundary later in the same browser contract.
      localStorage.setItem(
        "toonstudio-creator-experience-mode-v1",
        JSON.stringify({ mode: "classic" }),
      );
    }, locale);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(`${origin}/home`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await assertStudioWorkspaceHome(page);
    await page.goto(`${origin}/about/studio`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator('[data-creator-home="production-first"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    // 소개(/about/studio)는 '화면 구성 · 바로 시작 · 재료·협업·도움' 세 탭이다. 목적별 시작점은 '바로 시작' 탭에,
    // 협업·배우기 같은 이어 보기 링크는 다른 탭이나 공용 머리글에 있으므로 세 탭을 모두 열어 링크를 모은다.
    const tabs = page.locator('[role="tablist"]').first().getByRole("tab");
    assert.equal(await tabs.count(), 3, `Introduction must keep three tabs: ${name}`);
    const exposedHrefs = new Set();
    const collectHrefs = async () => {
      const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      for (const href of hrefs) exposedHrefs.add(href);
    };
    await collectHrefs();
    await tabs.nth(2).click();
    await collectHrefs();
    await tabs.nth(1).click();
    await page.locator("#creator-toolkit-title").waitFor({ timeout: 60_000 });
    await collectHrefs();

    const purposeTitle = page.locator("#creator-toolkit-title");
    assert.equal(await purposeTitle.count(), 1, `Purpose title must be unique: ${name}`);
    assert(await purposeTitle.isVisible(), `Purpose title must be visible: ${name}`);
    assert.equal(await page.locator("video").count(), 0, `Video must stay lazy before gesture: ${name}`);

    for (const href of requiredDestinations) {
      assert(
        exposedHrefs.has(href),
        `Purpose homepage must expose ${href}: ${name}`,
      );
    }

    const bounds = await purposeTitle.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Clipped purpose title: ${name}`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `Horizontal overflow: ${name}`,
    );
    assert.deepEqual(errors, [], `Uncaught page errors: ${name}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ status: "passed", viewports: viewports.map(([name]) => name) }, null, 2));
