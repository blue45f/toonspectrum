import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, expect } from "@playwright/test";

const origin = new URL(process.env.STUDIO_QA_ORIGIN || "http://127.0.0.1:5253");
assert(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Use an owned local development fixture");
const output = resolve(process.env.STUDIO_QA_OUTPUT || ".qa/virtual-studio-huddle-layout");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failure;
try {
  for (const [width, height] of [[390, 844], [320, 568], [844, 390], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(new URL("/tools/browser-harnesses/virtual-studio-ambient-audio.html", origin).href);
    const panel = page.locator(".studio-p2p-huddle-panel");
    const close = page.getByRole("button", { name: "대화 패널 접기", exact: true });
    await page.getByRole("button", { name: "채팅·통화", exact: true }).click();
    await page.getByRole("button", { name: "동의하고 P2P 채팅 참여", exact: true }).click();
    await expect(page.getByRole("button", { name: "나가기", exact: true })).toBeVisible();
    const geometry = await page.locator(".studio-p2p-huddle-dock").evaluate((dock) => {
      const panel = dock.querySelector(".studio-p2p-huddle-panel");
      const close = panel.querySelector('button[aria-label="대화 패널 접기"]');
      const body = panel.querySelector(":scope > div");
      return { dock: dock.getBoundingClientRect().toJSON(), panel: panel.getBoundingClientRect().toJSON(),
        close: close.getBoundingClientRect().toJSON(), body: { height: body.clientHeight, scroll: body.scrollHeight } };
    });
    assert(geometry.dock.y >= 0 && geometry.dock.bottom <= height, "The whole dock must fit the viewport");
    assert(geometry.close.y >= 0 && geometry.close.bottom <= height, "The header close control must stay visible");
    assert(geometry.close.width >= 44 && geometry.close.height >= 44, "The close control needs a 44px target");
    assert(geometry.body.height > 0 && geometry.body.scroll > geometry.body.height, "Long joined content must scroll within its body");
    const input = page.getByRole("textbox", { name: "P2P 메시지", exact: true });
    await input.scrollIntoViewIfNeeded();
    await input.fill("화면 아래까지 읽은 뒤에도 접기 버튼을 사용할 수 있어요.");
    const visibleClose = await close.boundingBox();
    assert(visibleClose && visibleClose.y >= 0, "Scrolling chat content must not move the header off screen");
    await page.screenshot({ path: `${output}/joined-${width}-${height}.png` });
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    const activeToggle = page.getByRole("button", { name: /P2P 대화 중/u });
    await expect(activeToggle).toBeVisible();
    await activeToggle.click();
    await expect(input).toHaveValue("화면 아래까지 읽은 뒤에도 접기 버튼을 사용할 수 있어요.");
    await page.getByRole("button", { name: "나가기", exact: true }).click();
    await expect(page.getByRole("button", { name: "동의하고 P2P 채팅 참여", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    results.push({ viewport: [width, height], geometry, keyboardClose: true, collapsePreservesCallAndDraft: true, leave: true, errors });
    await page.close();
  }
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, `${JSON.stringify({ status: failure ? "failed" : "passed", failure,
    scope: "Actual launcher and controller in a development-only empty room; no authenticated server or remote media peer.", results }, null, 2)}\n`);
}
console.log(`Huddle layout: ${results.length} viewport journeys passed.`);
