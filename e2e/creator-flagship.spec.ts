import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";
import { STUDIO_EXACT_RESUME_RESTORED_EVENT, studioExactResumeStorageKey } from "../apps/web/src/domains/creator/studio-exact-resume-context";
import { readDurableStudioAutosaveDocument } from "../scripts/lib/studio-verify-durable-autosave.mjs";
import { assertStudioWorkspaceHome } from "../scripts/lib/studio-workspace-browser-contract.mjs";

import { expect, test } from "./fixtures/non-studio-test";
import { capturePageEvidence } from "./helpers/capture-page-evidence";

const THEME_STORAGE_KEY = "toonspectrum-theme";

function themeEnvelope() {
  return JSON.stringify({
    state: { preference: "light", studioPreference: "inherit", theme: "light" },
    version: 0,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ language, themeKey, theme }) => {
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: language }, version: 0 }));
    localStorage.setItem(themeKey, theme);
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  }, { language: "ko", themeKey: THEME_STORAGE_KEY, theme: themeEnvelope() });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Deliberate offline fixture" } });
  });
});

for (const width of [320, 390, 820, 1440]) {
  test(`studio-first home keeps real navigation and accessible controls at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await assertStudioWorkspaceHome(page);
    await capturePageEvidence(page, testInfo, `studio-workspace-${width}`);
  });
}

for (const width of [320, 390, 820, 1440]) {
  test(`studio introduction stays readable and unclipped at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/about/studio", { waitUntil: "domcontentloaded" });
    const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');
    const primaryAction = home.locator('.cf-hero a.cf-primary[href="/studio/new"]');
    const startCards = home.locator(".cf-start-card");

    await expect(home).toBeVisible();
    await expect(page).toHaveTitle(/기획부터 연재까지/u);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("기획부터 연재까지");
    await expect(home.locator(".cf-home-preview img")).toBeVisible();
    await expect(home.locator(".cf-intent-visual-nav img")).toHaveCount(6);
    await expect(home.locator('.cf-hero-links a[href="/brand-film"]')).toBeVisible();
    await expect(home.locator('.cf-hero a.cf-secondary[href="/product-tour"]')).toBeVisible();
    await expect(home.locator(".cf-bridge-visual img")).toBeVisible();
    await expect(home.locator(".cf-production-journey img")).toBeVisible();
    await expect(startCards).toHaveCount(4);
    await expect(primaryAction).toBeVisible();

    await startCards.first().focus();
    await expect(startCards.first()).toBeFocused();

    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(hasNoHorizontalOverflow).toBe(true);

    if (width <= 820) {
      const actionBox = await primaryAction.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await capturePageEvidence(page, testInfo, `all-in-one-home-${width}`);
    expect(pageErrors).toEqual([]);
  });
}

test("task-first search opens the global command palette without losing the query", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "작품·도구·메뉴 검색", exact: true }).click();
  const search = page.getByPlaceholder(/작품 제목, 작가, 기능 명령/u);
  await expect(search).toBeVisible();
  await search.fill("비 오는 교실 배경");
  await expect(search).toHaveValue("비 오는 교실 배경");
});

test("the front door exposes planning, 2D, 3D, assets, collaboration and publishing", async ({ page }) => {
  await page.goto("/about/studio");
  const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');

  await expect(home.locator('.cf-hero a.cf-primary[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-hero a.cf-secondary[href="/product-tour"]')).toBeVisible();
  await expect(home.locator('.cf-simple-closing a[href="/production/projects/sample-project/overview"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/story-lab"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/bg3d"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/assets"]')).toBeVisible();
  await expect(home.locator(".cf-intent nav a")).toHaveCount(6);
  await expect(home).not.toContainText("그림은 익숙한 도구에서");
  await expect(home).not.toContainText("기존 드로잉 도구 그대로");
});

test("section navigation keeps readable focus and browser history semantics", async ({ page }) => {
  await page.goto("/about/studio");
  const processLink = page.locator('.cf-jump-nav a[href="#creator-flow"]');
  await processLink.click();
  await expect(page).toHaveURL(/#creator-flow$/u);
  await expect(page.locator("#creator-process-title")).toBeFocused();
  await expect(page.locator("#creator-process-title")).toContainText("모든 단계가 다음 작업으로");
});

for (const width of [320, 390]) {
  test(`Studio task-first entry stays readable and unclipped at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/studio", { waitUntil: "domcontentloaded" });

    const library = page.getByRole("region", { name: "작품 관리", exact: true });
    await expect(library).toBeVisible();
    await expect(library.getByRole("heading", { name: "내 작업", exact: true })).toBeVisible();
    await expect(library.getByRole("link", { name: "새 작품 만들기", exact: true }).first()).toBeVisible();
    await expect(library.getByRole("link", { name: "파일 가져오기", exact: true }).first()).toBeVisible();
    const views = library.getByRole("navigation", { name: "내 작업 보기", exact: true });
    await expect(views.getByRole("link")).toHaveCount(3);
    await expect(library.getByRole("navigation", { name: "저장과 배포", exact: true })).toBeVisible();
    await expect(library.getByLabel("프로젝트 검색", { exact: true })).toBeVisible();
    await expect(page.getByText("클라우드와 동기화됨", { exact: true })).toHaveCount(0);
    await expect(page.getByText("보관·복구·저장은 각 작품의 실제 상태를 기준으로 확인합니다.", { exact: true })).toBeVisible();

    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(hasNoHorizontalOverflow).toBe(true);

    await capturePageEvidence(page, testInfo, `studio-task-first-${width}`);
    expect(pageErrors).toEqual([]);
  });
}

test("new project flow explains a disabled start action and preserves the chosen setup", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/studio/new?kind=webtoon&template=webtoon-vertical", { waitUntil: "domcontentloaded" });

  await expect(page.locator('[data-workspace-surface="focused"]')).toBeVisible();
  await expect(page.locator(".workspace-sidebar, .campus-toolbar")).toHaveCount(0);
  await expect(page.getByTestId("site-background-music-player")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "무엇을 만들까요?", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "만들 작업 선택", exact: true })).toHaveValue("webtoon");
  await expect(page.getByRole("combobox", { name: "시작 템플릿", exact: true })).toHaveValue("webtoon-vertical");
  const optionalSettings = page.locator('[data-studio-create-optional-settings="true"]');
  await expect(optionalSettings).not.toHaveAttribute("open", "");
  await optionalSettings.getByText("추가 설정", { exact: true }).click();
  await expect(optionalSettings).toHaveAttribute("open", "");
  await expect(optionalSettings.getByText("준비되는 작업 화면 보기", { exact: true })).toBeVisible();
  await optionalSettings.getByText("추가 설정", { exact: true }).click();

  const projectName = page.getByLabel("프로젝트 이름");
  await projectName.fill("");
  const startButton = page.locator('button[aria-describedby*="studio-create-disabled-reason"]');
  await expect(startButton).toBeDisabled();
  await expect(page.getByText("프로젝트 이름을 입력해 주세요.", { exact: true })).toBeVisible();

  await projectName.fill("별빛 식당 1화");
  await expect(startButton).toHaveCount(0);
  await expect(projectName).toHaveValue("별빛 식당 1화");
  await expect(page.getByRole("button", { name: /시작$/u }).last()).toBeEnabled();
  await expect(page.getByText("이 기기에 저장됨", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/작업은 이 기기에 자동 저장됩니다/u)).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(hasNoHorizontalOverflow).toBe(true);
  await capturePageEvidence(page, testInfo, "studio-new-guided-320");
});


test("recent work reopens the exact Studio document and restores its viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((eventName) => {
    const receipts: unknown[] = [];
    Object.assign(window, { __studioExactResumeReceipts: receipts });
    window.addEventListener(eventName, (event) => receipts.push((event as CustomEvent).detail));
  }, STUDIO_EXACT_RESUME_RESTORED_EVENT);

  await page.goto("/studio/new?kind=webtoon&template=webtoon-four-cut", {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("프로젝트 이름").fill("정확한 재개 검증 작품");
  const start = page.getByRole("button", { name: /시작$/u }).last();
  await expect(start).toBeEnabled();
  await start.click();
  await page.waitForURL(/\/studio\/p\/[^/]+\/d\/[^?]+/u);

  const createdUrl = new URL(page.url());
  const documentPath = createdUrl.pathname;
  const [, projectId, documentId] = documentPath.match(/^\/studio\/p\/([^/]+)\/d\/([^/]+)$/u)!;
  const resumeKey = studioExactResumeStorageKey(decodeURIComponent(projectId), decodeURIComponent(documentId));
  const viewport = page.locator("[data-studio-canvas-viewport]").first();
  await expect(viewport).toBeVisible({ timeout: 60_000 });

  // Persist actual authored content through the editor before testing a durable reopen.
  await page.keyboard.press("b");
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * .45, box!.y + box!.height * .4);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * .55, box!.y + box!.height * .45, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => {
    const saved = await readDurableStudioAutosaveDocument(page, studioAutosaveKey({ workId: decodeURIComponent(documentId) }));
    return saved?.pagesList.some((item) => item.elements?.some((element) => (element as { type?: string }).type === "draw")) ?? false;
  }).toBe(true);

  const canvasStatus = page.getByRole("group", { name: "캔버스 상태 및 보기" });
  const zoomIn = page.getByRole("button", { name: "확대", exact: true });
  for (let step = 0; step < 4; step += 1) await zoomIn.click();
  const zoomPercent = await canvasStatus.getByText(/^\d+%$/u).textContent();
  expect(zoomPercent).toMatch(/^\d+%$/u);

  const expectedView = await viewport.evaluate((element) => {
    const viewportElement = element as HTMLElement;
    const maxLeft = Math.max(0, viewportElement.scrollWidth - viewportElement.clientWidth);
    const maxTop = Math.max(0, viewportElement.scrollHeight - viewportElement.clientHeight);
    viewportElement.scrollLeft = Math.round(maxLeft * 0.5);
    viewportElement.scrollTop = Math.round(maxTop * 0.6);
    viewportElement.dispatchEvent(new Event("scroll", { bubbles: true }));
    return {
      leftRatio: maxLeft > 0 ? viewportElement.scrollLeft / maxLeft : 0,
      topRatio: maxTop > 0 ? viewportElement.scrollTop / maxTop : 0,
    };
  });
  expect(expectedView.topRatio).toBeGreaterThan(0.3);
  const readResume = () => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as { pageId?: string; scrollTop?: number; zoom?: number } : null;
  }, resumeKey);
  await expect.poll(async () => (await readResume())?.scrollTop ?? 0).toBeGreaterThan(0);
  const storedCheckpoint = await readResume();
  expect(storedCheckpoint?.pageId).toBeTruthy();
  expect(storedCheckpoint?.zoom ?? 0).toBeGreaterThan(1);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const recent = page.locator('a[data-workspace-resume="true"], a[data-space-exact-resume="true"]').first();
  await expect(recent).toBeVisible();
  await expect(recent).toContainText(/원고 이어하기|이어서 작업/u);
  const recentHref = await recent.getAttribute("href");
  expect(recentHref).not.toBeNull();
  const recentUrl = new URL(recentHref!, "https://toonstudio.test");
  expect(recentUrl.pathname).toBe(documentPath);
  expect(recentUrl.searchParams.get("resume")).toBe("latest");
  expect(recentUrl.searchParams.get("token")).toBeNull();
  expect(recentUrl.searchParams.get("room")).toBeNull();
  expect(recentUrl.searchParams.get("startTool")).toBeNull();

  await recent.click();
  await page.waitForURL((url) => url.pathname === documentPath);
  const restoredViewport = page.locator("[data-studio-canvas-viewport]").first();
  const recovery = page.getByRole("button", { name: "이어서 그리기", exact: true });
  await page.addLocatorHandler(recovery, async () => { await recovery.click(); });
  try {
    // Visible canvas chrome precedes asynchronous durable hydration. The same existing 60s
    // readiness budget must wait for the authoritative page/zoom receipt, not a placeholder view.
    await expect(page.getByText(
      `최근 작업 위치를 복원했어요. ${storedCheckpoint!.pageId} · 확대 ${Math.round(storedCheckpoint!.zoom! * 100)}%`,
      { exact: true },
    )).toBeVisible({ timeout: 60_000 });
  } finally {
    await page.removeLocatorHandler(recovery);
  }
  expect(new URL(page.url()).pathname).toBe(documentPath);
  const receipts = await page.evaluate(() =>
    (window as unknown as { __studioExactResumeReceipts: unknown[] }).__studioExactResumeReceipts);
  expect(receipts).toEqual([expect.objectContaining({
    projectId: decodeURIComponent(projectId), documentId: decodeURIComponent(documentId),
    pageId: storedCheckpoint!.pageId, zoom: storedCheckpoint!.zoom,
  })]);
  await expect(restoredViewport).toBeVisible();
  await expect(canvasStatus.getByText(/^\d+%$/u)).toHaveText(zoomPercent!);
  expect((await readResume())?.pageId).toBe(storedCheckpoint?.pageId);

  await expect.poll(async () => restoredViewport.evaluate((element) => {
    const viewportElement = element as HTMLElement;
    const maxTop = Math.max(0, viewportElement.scrollHeight - viewportElement.clientHeight);
    return maxTop > 0 ? viewportElement.scrollTop / maxTop : 0;
  })).toBeGreaterThan(0.3);
  const restoredView = await restoredViewport.evaluate((element) => {
    const viewportElement = element as HTMLElement;
    const maxLeft = Math.max(0, viewportElement.scrollWidth - viewportElement.clientWidth);
    const maxTop = Math.max(0, viewportElement.scrollHeight - viewportElement.clientHeight);
    return {
      leftRatio: maxLeft > 0 ? viewportElement.scrollLeft / maxLeft : 0,
      topRatio: maxTop > 0 ? viewportElement.scrollTop / maxTop : 0,
    };
  });
  expect(Math.abs(restoredView.leftRatio - expectedView.leftRatio)).toBeLessThan(0.12);
  expect(Math.abs(restoredView.topRatio - expectedView.topRatio)).toBeLessThan(0.12);
  expect(pageErrors).toEqual([]);
});
