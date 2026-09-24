import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage";

import { expect, test } from "./fixtures/non-studio-test";

const LANGUAGE_STORAGE_KEY = "toonspectrum-lang";
const COMPAT_DISMISSAL_KEY = "toonspectrum-compat-dismissed";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({
    betaNoticeKey,
    betaNoticeRevision,
    languageStorageKey,
    compatDismissalKey,
  }) => {
    localStorage.setItem(betaNoticeKey, betaNoticeRevision);
    localStorage.setItem(languageStorageKey, JSON.stringify({
      state: { lang: "ko" },
      version: 0,
    }));
    sessionStorage.setItem(compatDismissalKey, "true");
  }, {
    betaNoticeKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
    betaNoticeRevision: STUDIO_BETA_NOTICE_REVISION,
    languageStorageKey: LANGUAGE_STORAGE_KEY,
    compatDismissalKey: COMPAT_DISMISSAL_KEY,
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        json: { authenticated: false, user: null },
      });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { message: "Deliberate offline fixture" },
    });
  });
});

test("editor pages survive an OPFS handoff and hydrate the publish command center", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/studio", {
    waitUntil: "domcontentloaded",
  });

  const seeded = await page.evaluate(async () => {
    const handoff = await import(
      "/src/domains/creator/studio-publish-handoff.ts"
    );
    const canvases = [
      document.createElement("canvas"),
      document.createElement("canvas"),
    ];
    canvases[0].width = 320;
    canvases[0].height = 480;
    canvases[1].width = 360;
    canvases[1].height = 640;

    const colors = ["#592a90", "#0d7680"];
    canvases.forEach((canvas, index) => {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas unavailable");
      context.fillStyle = colors[index]!;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "white";
      context.font = "bold 32px sans-serif";
      context.fillText(`PAGE ${index + 1}`, 40, 80);
    });

    const record = await handoff.prepareStudioPublishHandoffFromCanvases({
      title: "브라우저 게시 인계 검증",
      canvases,
      pageNames: ["표지", "엔딩"],
    });
    return {
      id: record.id,
      href: handoff.studioPublishHandoffHref(record.id),
    };
  });
  try {
    await page.goto(seeded.href, {
      waitUntil: "domcontentloaded",
    });

    const loadedBanner = page.locator(
      '[data-studio-publish-handoff-loaded="true"]',
    );
    await expect(loadedBanner).toBeVisible();
    await expect(loadedBanner).toContainText("편집기 원고 2페이지");
    await expect(loadedBanner).toContainText("24시간 뒤 만료");
    await expect(page.getByLabel("제목 *")).toHaveValue(
      "브라우저 게시 인계 검증",
    );
    await expect(page.getByText("표지.webp", { exact: true })).toBeVisible();
    await expect(page.getByText("엔딩.webp", { exact: true })).toBeVisible();
    await expect(page.locator('button[aria-label$="이미지 삭제"]')).toHaveCount(2);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(loadedBanner).toBeVisible();
    await expect(page.getByLabel("제목 *")).toHaveValue(
      "브라우저 게시 인계 검증",
    );
    await expect(page.locator('button[aria-label$="이미지 삭제"]')).toHaveCount(2);
  } finally {
    await page.evaluate(async (handoffId) => {
      const handoff = await import(
        "/src/domains/creator/studio-publish-handoff.ts"
      );
      await handoff.acquireStudioPublishHandoffRepository().remove(handoffId);
    }, seeded.id);
  }

  expect(pageErrors).toEqual([]);
});
