/** Local-only UI verification. Start Vite first; no production APIs or external assets are requested. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { expect } from "@playwright/test";
import { chromium } from "playwright";

const base = process.env.THEME_VERIFY_URL ?? "http://127.0.0.1:5276";
assert.equal(new URL(base).hostname, "127.0.0.1", "Theme verifier only accepts a loopback server");
const output = "artifacts/design-themes";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];
const presets = [["잉크", "dark"], ["페이퍼", "light"], ["그래파이트", "graphite"], ["미드나이트", "midnight"], ["세피아", "sepia"], ["고대비", "contrast"]];
async function createContext(viewport, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["data:", "blob:"].includes(url.protocol) && url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Local UI verification: API disabled"}' });
    return route.continue();
  });
  await context.addInitScript(() => {
    if (window.top !== window || location.hostname !== "127.0.0.1") return;
    localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
    localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
  });
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  return context;
}
async function choose(page, label, container = page) {
  const radio = container.getByRole("radio", { name: label, exact: true });
  await container.locator(".appearance-card").filter({ has: page.getByRole("radio", { name: label, exact: true }) }).click();
  await expect(radio).toBeChecked();
}
async function theme(page, value) {
  await expect(page.locator("html")).toHaveAttribute("data-design-theme", value);
}
try {
  const context = await createContext({ width: 1440, height: 1000 });
  const page = await context.newPage();
  await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "디자인 테마", exact: true }).waitFor({ timeout: 90000 });
  for (const [label, value] of presets) { await choose(page, label); await theme(page, value); }
  checks.push("all six presets selectable through visible cards");
  await choose(page, "미드나이트");
  await page.reload({ waitUntil: "domcontentloaded" });
  await theme(page, "midnight");
  await expect(page.getByRole("radio", { name: "미드나이트", exact: true })).toBeChecked();
  checks.push("preference restored on reload");
  const second = await context.newPage();
  await second.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
  await second.getByRole("heading", { name: "디자인 테마", exact: true }).waitFor();
  await choose(page, "세피아");
  await theme(second, "sepia");
  checks.push("cross-tab preference synchronization");
  await second.close();
  await page.getByRole("radio", { name: "시스템 설정 따르기", exact: true }).check();
  await page.emulateMedia({ colorScheme: "light" }); await theme(page, "light");
  await page.emulateMedia({ colorScheme: "dark" }); await theme(page, "dark");
  checks.push("live OS color-scheme following");
  await choose(page, "미드나이트");
  await page.getByRole("button", { name: "스튜디오", exact: true }).click();
  await choose(page, "페이퍼"); await theme(page, "midnight");
  await page.goto(`${base}/studio/canvas`, { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "디자인 테마", exact: true }).first();
  await trigger.waitFor({ timeout: 90000 }); await theme(page, "light");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "디자인 테마", exact: true });
  await expect(dialog).toBeVisible();
  await choose(page, "그래파이트", dialog); await theme(page, "graphite");
  await page.screenshot({ path: `${output}/studio-graphite-dialog.png` });
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  checks.push("Studio dialog, independent palette and Escape focus restoration");
  await page.evaluate(() => { history.pushState({}, "", "/settings"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByRole("heading", { name: "디자인 테마", exact: true }).waitFor();
  await theme(page, "midnight");
  checks.push("SPA navigation restores the site palette");
  await page.screenshot({ path: `${output}/settings-midnight.png` });
  await context.close();

  const mobile = await createContext({ width: 390, height: 844 }, true);
  const phone = await mobile.newPage();
  await phone.goto(`${base}/studio/canvas`, { waitUntil: "domcontentloaded" });
  const project = phone.getByRole("button", { name: "프로젝트 센터", exact: true });
  await project.waitFor({ timeout: 90000 }); await project.click();
  await phone.getByRole("dialog", { name: "프로젝트 센터", exact: true }).getByRole("button", { name: "디자인 테마", exact: true }).click();
  const phoneDialog = phone.getByRole("dialog", { name: "디자인 테마", exact: true });
  await expect(phoneDialog).toBeVisible();
  await expect(phone.getByRole("dialog", { name: "프로젝트 센터", exact: true })).toBeHidden();
  await choose(phone, "세피아", phoneDialog); await theme(phone, "sepia");
  for (const width of [390, 320]) {
    await phone.setViewportSize({ width, height: 844 });
    const bounds = await phoneDialog.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `dialog fits ${width}px viewport`);
    const overflow = await phoneDialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    assert.equal(overflow, false, `no horizontal dialog overflow at ${width}px`);
    await phone.screenshot({ path: `${output}/studio-mobile-${width}.png` });
  }
  await phone.getByRole("button", { name: "테마 설정 닫기", exact: true }).click();
  await expect(phoneDialog).toBeHidden(); await expect(project).toBeFocused();
  checks.push("mobile project-menu handoff, 390/320px layout, return to launcher");
  await mobile.close();
  assert.deepEqual(errors, [], "no uncaught browser errors");
  const report = { checks, pageErrors: errors, limitation: "Local UI-only run; backend APIs and remote assets intentionally unavailable. This does not certify document export or production build." };
  writeFileSync(`${output}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
