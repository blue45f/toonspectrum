import { GUEST_SESSION_KEY } from "../apps/web/src/domains/auth/public/session/guest-session";
import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage";
import { CREATOR_EXPERIENCE_STORAGE_KEY } from "../apps/web/src/shared/lib/creator-experience-mode";
import { assertStudioWorkspaceHome } from "../scripts/lib/studio-workspace-browser-contract.mjs";

import { expect, test } from "./fixtures/non-studio-test";
import { capturePageEvidence } from "./helpers/capture-page-evidence";

import type { Page } from "@playwright/test";

const THEME_STORAGE_KEY = "toonstudio-theme";
const CREATOR_INTENT_DESTINATIONS = [
  "/story-lab",
  "/studio/new",
  "/studio/bg3d",
  "/studio/assets",
  "/production",
  "/studio/publish",
];

/**
 * 작업 홈(/home)은 로그인하지 않았고 게스트도 아니면 환영 게이트를 먼저 보여 준다.
 * 홈의 실제 내비게이션·상태 바를 검증하는 테스트는 의도적으로 고른 게스트 신원을 심고 시작한다.
 */
async function seedGuestSession(page: Page) {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ id: "guest_e2e-creator-flagship", createdAt: Date.now() }));
  }, { key: GUEST_SESSION_KEY });
}

function themeEnvelope() {
  return JSON.stringify({
    state: { preference: "light", studioPreference: "inherit", theme: "light" },
    version: 0,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({
    language,
    themeKey,
    theme,
    creatorExperienceKey,
    betaNoticeKey,
    betaNoticeRevision,
  }) => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: language }, version: 0 }));
    localStorage.setItem(themeKey, theme);
    localStorage.setItem(creatorExperienceKey, JSON.stringify({ mode: "classic" }));
    localStorage.setItem(betaNoticeKey, betaNoticeRevision);
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  }, {
    language: "ko",
    themeKey: THEME_STORAGE_KEY,
    theme: themeEnvelope(),
    creatorExperienceKey: CREATOR_EXPERIENCE_STORAGE_KEY,
    betaNoticeKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
    betaNoticeRevision: STUDIO_BETA_NOTICE_REVISION,
  });

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
    await seedGuestSession(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/home", { waitUntil: "domcontentloaded" });
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
    const primaryAction = home.locator('.cf-hero a[href="/studio/new"]');
    const tabs = home.getByRole("tablist", { name: "작업실 둘러보기" }).getByRole("tab");

    await expect(home).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("작업실을 눌러서 둘러보세요");
    await expect(home.locator('.cf-hero a[href="/studio"]')).toBeVisible();
    await expect(primaryAction).toBeVisible();
    // 둘러보기는 세 탭으로 나뉘고 기본은 '화면 구성'(번호를 눌러 보는 예시 편집기)이다.
    await expect(tabs).toHaveCount(3);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(home.locator(".isw")).toBeVisible();
    await expect(home.getByRole("group", { name: "작업실 영역 고르기" }).getByRole("button")).toHaveCount(5);

    // '바로 시작' 탭: 시작 선택기가 모든 시작점으로 이어진다.
    await tabs.nth(1).click();
    const intentCards = home.locator("#creator-start .cf-intent-visual-nav a");
    await expect(intentCards).toHaveCount(CREATOR_INTENT_DESTINATIONS.length);
    expect(await intentCards.evaluateAll((links) => links.map((link) => link.getAttribute("href"))))
      .toEqual(CREATOR_INTENT_DESTINATIONS);
    await intentCards.first().focus();
    await expect(intentCards.first()).toBeFocused();

    // 소개 흐름의 이전·다음.
    await expect(home.locator('a[rel="prev"][href="/about"]')).toBeVisible();
    await expect(home.locator('a[rel="next"][href="/about/workflow"]')).toBeVisible();

    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(hasNoHorizontalOverflow).toBe(true);

    if (width <= 820) {
      const actionBox = await primaryAction.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    // 지연 로드된 알림·인증 컨트롤이 나타나도 작은 화면의 헤더 액션이 잘리지 않아야 한다.
    await page.getByRole("link", { name: "알림 센터", exact: true }).first().waitFor({ state: "visible" });
    const header = page.locator('[data-site-chrome="header"]');
    const headerActions = header.locator(':scope > div').first().locator('button:visible, a:visible');
    for (const action of await headerActions.all()) {
      const box = await action.boundingBox();
      if (!box) continue;
      expect(box.x, "헤더 액션이 왼쪽으로 넘치면 안 됩니다.").toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, "헤더 액션이 오른쪽으로 넘치면 안 됩니다.").toBeLessThanOrEqual(width + 1);
    }
    await capturePageEvidence(page, testInfo, `all-in-one-home-${width}`);
    expect(pageErrors).toEqual([]);
  });
}

test("task-first search opens the global command palette without losing the query", async ({ page }) => {
  await seedGuestSession(page);
  await page.goto("/home");
  await page.getByRole("button", { name: "작품·도구·메뉴 검색", exact: true }).click();
  const search = page.getByPlaceholder(/작품 제목, 작가, 기능 명령/u);
  await expect(search).toBeVisible();
  await search.fill("비 오는 교실 배경");
  await expect(search).toHaveValue("비 오는 교실 배경");
});

test("the front door exposes planning, 2D, 3D, assets, collaboration and publishing", async ({ page }) => {
  await page.goto("/about/studio");
  const home = page.locator('[data-creator-experience="all-in-one-studio-v3"]');

  await expect(home.locator('.cf-hero a[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-hero a[href="/studio"]')).toBeVisible();
  await home.getByRole("tab", { name: "바로 시작" }).click();
  await expect(home.locator("#creator-start .cf-intent-visual-nav a")).toHaveCount(CREATOR_INTENT_DESTINATIONS.length);
  for (const destination of CREATOR_INTENT_DESTINATIONS) {
    await expect(home.locator(`#creator-start .cf-intent-visual-nav a[href="${destination}"]`)).toBeVisible();
  }
  await home.getByRole("tab", { name: "재료·협업·도움" }).click();
  await expect(home.locator("#creator-support a[href]").first()).toBeVisible();
  await expect(home).not.toContainText("그림은 익숙한 도구에서");
  await expect(home).not.toContainText("기존 드로잉 도구 그대로");
});

test("tour tabs keep shareable addresses and legacy section links", async ({ page }) => {
  await page.goto("/about/studio");
  const tabs = page.getByRole("tablist", { name: "작업실 둘러보기" });
  await tabs.getByRole("tab", { name: "재료·협업·도움" }).click();
  await expect(page).toHaveURL(/[?&]tab=support/u);
  await expect(page.locator("#creator-support-title")).toBeVisible();
  // 탭은 주소만 바꾸고 방문 기록을 쌓지 않으므로, 새로고침해도 같은 탭이 열린다.
  await page.reload();
  await expect(tabs.getByRole("tab", { name: "재료·협업·도움" })).toHaveAttribute("aria-selected", "true");
  // 예전 섹션 주소(#creator-flow 등)도 막다른 길 없이 해당 탭을 연다.
  await page.goto("/about/studio#creator-support");
  await expect(tabs.getByRole("tab", { name: "재료·협업·도움" })).toHaveAttribute("aria-selected", "true");
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
  await expect(page.getByRole("heading", { name: "완성할 콘텐츠를 선택하세요", exact: true })).toBeVisible();
  await expect(page.locator('[data-studio-create-format="vertical-webtoon"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "시작 템플릿", exact: true })).toHaveValue("webtoon-vertical");
  await expect(page.locator('[data-studio-format-preview="vertical-webtoon"]')).toBeVisible();
  await expect(page.locator('[data-studio-mode-preview="webtoon"]')).toBeVisible();
  await expect(page.locator('[data-studio-auxiliary-workspaces="true"]')).not.toHaveAttribute("open", "");

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
