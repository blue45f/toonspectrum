import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";

const origin = process.env.CREATOR_HOME_ORIGIN || "http://127.0.0.1:4173";
const output = "artifacts/creator-continuity";
const storageKey = "toonstudio:creator-continuity:v1";
mkdirSync(output, { recursive: true });

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(origin);
    if (response.ok) break;
  } catch {
    // Preview server is starting.
  }
  if (attempt === 59) throw new Error("Preview server did not become ready");
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const browser = await chromium.launch({ headless: true });
const results = [];
let failure;
let currentPage;
let currentName;

try {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    currentName = name;
    const now = Date.now();
    const context = await browser.newContext({
      viewport: { width, height },
      locale: "ko-KR",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.addInitScript(({ key, now }) => {
      localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        recent: [
          {
            id: "studio",
            href: "/studio?preset=illustration&workId=private-document&token=secret",
            visitedAt: now,
          },
        ],
        plan: { goal: "comic", pace: "project", updatedAt: now },
      }));
    }, { key: storageKey, now });

    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const launchpad = page.locator('[data-creator-launchpad="v1"]');
    await launchpad.waitFor({ state: "visible", timeout: 60_000 });

    const recommendation = launchpad.getByRole("link", { name: /이 계획으로 시작하기/ });
    await expect(recommendation).toHaveAttribute("href", "/studio/comic");
    await expect(launchpad.getByRole("button", { name: /컷으로 이야기하기/ })).toHaveAttribute("aria-pressed", "true");
    await expect(launchpad.getByRole("button", { name: /프로젝트/ })).toHaveAttribute("aria-pressed", "true");

    const recent = launchpad.getByRole("link", { name: /창작 스튜디오/ });
    await expect(recent).toHaveAttribute("href", "/studio?preset=illustration");
    assert.equal((await recent.getAttribute("href"))?.includes("workId"), false);
    assert.equal((await recent.getAttribute("href"))?.includes("token"), false);

    await launchpad.getByRole("button", { name: /자료와 재료 모으기/ }).click();
    await expect(recommendation).toHaveAttribute("href", "/research/assets");
    const saved = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), storageKey));
    assert.deepEqual(saved.plan.goal, "materials");
    assert.deepEqual(saved.plan.pace, "project");
    assert.equal(JSON.stringify(saved).includes("private-document"), false);
    assert.equal(JSON.stringify(saved).includes("secret"), false);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-creator-launchpad="v1"]').waitFor({ state: "visible" });
    await expect(page.locator('[data-creator-launchpad="v1"]').getByRole("link", { name: /이 계획으로 시작하기/ }))
      .toHaveAttribute("href", "/research/assets");

    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.defineProperties(event, {
        prompt: { value: async () => undefined },
        userChoice: { value: Promise.resolve({ outcome: "accepted", platform: "web" }) },
      });
      window.dispatchEvent(event);
    });
    const nudge = page.getByRole("status", { name: "툰스튜디오를 앱처럼 열어보세요" });
    await expect(nudge).toBeVisible();
    await nudge.getByRole("button", { name: "설치", exact: true }).click();
    await expect(nudge).toHaveCount(0);

    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.locator('[data-creator-launchpad="v1"]')).toContainText("오프라인");

    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `Horizontal overflow: ${name}`,
    );
    assert.deepEqual(errors, [], `Uncaught page errors: ${name}`);
    await page.screenshot({
      path: `${output}/${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    results.push({
      name,
      viewport: [width, height],
      persistedPlan: true,
      sanitizedRecentHref: true,
      installPrompt: true,
      offlineSignal: true,
      noHorizontalOverflow: true,
    });
    await context.close();
    currentPage = undefined;
  }
} catch (error) {
  failure = String(error);
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({
      path: `${output}/failure-${currentName}.png`,
      fullPage: true,
      animations: "disabled",
    }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  writeFileSync(
    `${output}/report.json`,
    JSON.stringify({
      status: failure ? "failed" : "passed",
      failure,
      sourceCommit: process.env.GITHUB_SHA || "local",
      origin,
      results,
    }, null, 2) + "\n",
  );
}

console.log(JSON.stringify({ status: "passed", results }, null, 2));
