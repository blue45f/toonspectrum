import { expect, test } from "@playwright/test";

import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage";

const SHAPER = '[data-character-shaper="true"]';
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";

test("Character Platform V3 executes its authoring core inside the browser", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({
    quickstart,
    mobileHint,
    betaNoticeKey,
    betaNoticeRevision,
  }) => {
    localStorage.setItem(quickstart, "1");
    localStorage.setItem(mobileHint, "1");
    localStorage.setItem(betaNoticeKey, betaNoticeRevision);
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  }, {
    quickstart: QUICKSTART_KEY,
    mobileHint: MOBILE_HINT_KEY,
    betaNoticeKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
    betaNoticeRevision: STUDIO_BETA_NOTICE_REVISION,
  });

  await page.goto("/studio/character", { waitUntil: "domcontentloaded" });
  await page.locator(SHAPER).waitFor({ timeout: 120_000 });
  await page.locator(`${SHAPER} canvas`).first().waitFor({ timeout: 120_000 });

  const launcher = page.locator(`${SHAPER} [data-character-quality-trigger="true"]`);
  await expect(launcher).toBeVisible();
  // The launcher is portaled into the moving 3D shell. Keyboard activation verifies the accessible
  // browser path without making the gate depend on a continuously animating pointer hit box.
  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "캐릭터 품질 워크벤치" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("CHARACTER PLATFORM V3 · WEB FIRST")).toBeVisible();
  await dialog.getByRole("tab", { name: "웹 코어" }).click();

  await expect(dialog.getByText("Browser-first 3D Runtime")).toBeVisible();
  await expect(dialog.getByText("CharacterDocument V3", { exact: false })).toBeVisible();
  await expect(dialog.getByText("Native 필수")).toBeVisible();
  await expect(dialog.getByText("NO", { exact: true })).toBeVisible();

  const kernelRows = dialog.locator("li").filter({ hasText: /viewport|kernel|project store|output/iu });
  await expect(kernelRows).not.toHaveCount(0);
  await expect(dialog.getByText(/manifold-wasm-(?:worker|main)/u)).toBeVisible();
  await expect(dialog.getByText(/occt-wasm-(?:worker|main)/u)).toBeVisible();

  await dialog.getByRole("button", { name: "3D 코어 검증" }).click();
  await expect(dialog.getByRole("status")).toContainText("브라우저 3D 코어 정상", {
    timeout: 30_000,
  });
  await expect(dialog.getByRole("status")).toContainText(/정점 \d+개 · 삼각형 \d+개/u);
});
