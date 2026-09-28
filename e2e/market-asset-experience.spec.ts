
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@toonstudio/contracts/creator-marketplace-starter-catalog";

import type { CreatorMarketplaceCloudLibraryItem } from "../apps/web/src/shared/lib/creator-marketplace-cloud-library-contract";

test.use({ actionTimeout: 30_000, navigationTimeout: 30_000 });

function material(index: number, name: string, kind: "brush" | "3d-asset" = "brush"): CreatorMarketplaceCloudLibraryItem {
  const id = `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`;
  return {
    id, logicalPackId: `community:${String(index).repeat(64)}`, packageId: `e2e/material-${index}`, name, kind,
    membership: "active", addedAt: `2026-09-${String(20 + index).padStart(2, "0")}T00:00:00Z`, archivedAt: null,
    addedFrom: { releaseId: id, resourceVersion: "1.0.0", releaseOrdinal: 1, manifestHash: "a".repeat(64) },
    confirmation: { state: "none" },
    catalog: { state: "available", head: { id, name, kind, resourceVersion: "1.0.0", minimumStudioVersion: "0.1.0", releaseOrdinal: 1, manifestHash: "a".repeat(64) } },
    updateState: "no-account-confirmation",
  };
}

async function mockMarket(page: Page) {
  const items = [material(1, "잉크 펜 세트"), material(2, "학교 배경", "3d-asset"), material(3, "다음 페이지 수채화")];
  const changes: boolean[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    localStorage.setItem("toonstudio-studio-beta-notice-acknowledged", "2026-09-24-data-and-policy-v1");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/session")) {
      await route.fulfill({ status: 200, json: { authenticated: true, user: { id: "123e4567-e89b-42d3-a456-000000000009", name: "테스트 창작자", email: null, image: null, role: "user" } } }); return;
    }
    if (/\/creator\/marketplace\/library\/[0-9a-f-]+$/u.test(url.pathname) && route.request().method() === "PATCH") {
      const item = items.find((candidate) => url.pathname.endsWith(candidate.id));
      if (!item) { await route.fulfill({ status: 404, json: { message: "Unknown test item" } }); return; }
      const archived = (route.request().postDataJSON() as { archived: boolean }).archived;
      const membership = archived ? "archived" : "active";
      const changed = item.membership !== membership;
      item.membership = membership; item.archivedAt = archived ? "2026-09-28T00:00:00Z" : null;
      changes.push(archived);
      await route.fulfill({ status: 200, json: { operation: "set-archive", libraryScope: "account", libraryItemId: item.id, logicalPackId: item.logicalPackId, membership, changed, updatedAt: "2026-09-28T00:00:00Z" } }); return;
    }
    if (url.pathname.endsWith("/creator/marketplace/library")) {
      const view = url.searchParams.get("view") ?? "active";
      const filtered = items.filter((item) => item.membership === view);
      const next = url.searchParams.has("cursor");
      const pageItems = next ? filtered.slice(2) : filtered.slice(0, 2);
      const hasMore = !next && filtered.length > 2;
      await route.fulfill({ status: 200, json: { items: pageItems, limit: 50, hasMore, nextCursor: hasMore ? "nextpage" : null } }); return;
    }
    if (url.pathname.endsWith("/creator/marketplace/resources")) {
      await route.fulfill({ status: 200, json: { items: CREATOR_MARKETPLACE_STARTER_RECORDS.slice(0, 2), limit: 12, hasMore: false, nextCursor: null } }); return;
    }
    await route.fulfill({ status: 503, json: { message: "Unrelated service unavailable in isolated browser test" } });
  });
  return { changes };
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

test("소장 소재 검색과 페이지 확장, 표시 방식을 실제 화면에서 연결한다", async ({ page }, info) => {
  await mockMarket(page);
  await page.goto("/market/library", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "잉크 펜 세트" })).toBeVisible();
  await expect(page.getByText(/불러온 2개 중 2개 표시/u)).toBeVisible();
  await page.getByRole("searchbox", { name: "내 에셋 검색" }).fill("다음 페이지");
  await expect(page.getByRole("heading", { name: /일치하는 소재를 찾지/u })).toBeVisible();
  await page.getByRole("button", { name: "더 보기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "다음 페이지 수채화" })).toBeVisible();
  await expect(page.getByText("불러온 3개 중 1개 표시")).toBeVisible();
  await page.getByRole("button", { name: "내 에셋 검색어 지우기" }).click();
  await page.getByRole("combobox", { name: "에셋 종류" }).selectOption("3d-asset");
  await expect(page.getByRole("list", { name: "내 에셋 목록" }).locator(":scope > li")).toHaveCount(1);
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  await expect(page.getByRole("list", { name: "내 에셋 목록" })).toHaveClass(/--list/u);
  await expect(page.getByRole("link", { name: "미리보기·사용권 확인" }).first()).toHaveAttribute("href", /\/market\/resource\//u);
  await page.screenshot({ path: info.outputPath("library-desktop-list.png"), fullPage: true });
});

test("계정 보관과 실행 취소를 서버 확인 후 적용한다", async ({ page }) => {
  const { changes } = await mockMarket(page);
  await page.goto("/market/library", { waitUntil: "domcontentloaded" });
  const card = page.locator(".market-library-card").filter({ has: page.getByRole("heading", { name: "잉크 펜 세트" }) });
  await card.getByRole("button", { name: "목록에서 보관" }).click();
  await expect(page.getByRole("heading", { name: "잉크 펜 세트" })).toHaveCount(0);
  await page.getByRole("button", { name: "방금 작업 실행 취소" }).click();
  await expect(page.getByRole("heading", { name: "잉크 펜 세트" })).toBeVisible();
  expect(changes).toEqual([true, false]);
  const active = page.getByRole("tab", { name: "소장", exact: true });
  await active.focus(); await active.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "보관됨", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "보관된 에셋이 없어요" })).toBeVisible();
});

test("모바일 내 에셋은 가로 넘침 없이 44px 조작과 접근성을 유지한다", async ({ page }, info) => {
  await mockMarket(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/market/library", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "잉크 펜 세트" })).toBeVisible();
  for (const width of [390, 320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoOverflow(page);
    for (const name of ["카드 보기", "목록 보기"]) {
      const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const results = await new AxeBuilder({ page }).include(".market-library-page")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await page.screenshot({ path: info.outputPath("library-mobile.png"), fullPage: true });
});

test("마켓 홈 검색과 목록 보기 URL은 검색 조건을 유지한다", async ({ page }, info) => {
  await mockMarket(page);
  await page.goto("/market", { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "찾고 싶은 소재" }).fill("잉크");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "마켓 리소스 검색" })).toHaveValue("잉크");
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("layout")).toBe("list");
  expect(new URL(page.url()).searchParams.get("q")).toBe("잉크");
  await expect(page.getByRole("navigation", { name: "마켓 주요 내비게이션" }).getByRole("link", { name: "브러시", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoOverflow(page);
  await page.screenshot({ path: info.outputPath("market-browse-mobile.png"), fullPage: true });
});

test("실제 소재 카드에서 비교 선반으로 연결하고 작은 화면에서 터치 대상을 유지한다", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/market/browse", { waitUntil: "domcontentloaded" });
  const record = CREATOR_MARKETPLACE_STARTER_RECORDS[0];
  if (!record) throw new Error("Missing starter fixture");
  const compare = page.getByRole("button", { name: `${record.name} 비교 목록에 추가` });
  await compare.click();
  await expect(page.getByRole("region", { name: "선택한 비교 후보" })).toContainText("1/4");
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  await expect(page.locator(".market-browse-results--list > li")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoOverflow(page);
  const favourite = page.getByRole("button", { name: `${record.name} 찜하기` });
  const bounds = await favourite.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: `비교 후보 ${record.name} 제외` }).click();
  await expect(page.getByRole("region", { name: "선택한 비교 후보" })).toHaveCount(0);
});

test("밝은 테마의 에셋 검색·필터도 접근성 대비를 유지한다", async ({ page }, info) => {
  await mockMarket(page);
  await page.addInitScript(() => localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { theme: "light", preference: "light", studioPreference: "inherit" }, version: 0 })));
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/market/library", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "잉크 펜 세트" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const results = await new AxeBuilder({ page }).include(".market-library-page")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await page.screenshot({ path: info.outputPath("library-light.png"), fullPage: true });
  await page.emulateMedia({ forcedColors: "active" });
  await assertNoOverflow(page);
  await expect(page.getByRole("button", { name: "목록 보기", exact: true })).toBeEnabled();
});

test("내 에셋에서 일반 회원가입을 열고 503에도 현재 작업과 입력을 보존한다", async ({ page }) => {
  await mockMarket(page);
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, json: { authenticated: false, user: null } }));
  await page.route("**/api/auth/providers", (route) => route.fulfill({ status: 200, json: {} }));
  await page.route("**/api/auth/signup", (route) => route.fulfill({ status: 503, json: { statusCode: 503, message: "Request could not be completed" } }));
  await page.goto("/market/library", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "닉네임", exact: true }).fill("가입 응답 검증");
  await dialog.getByRole("textbox", { name: "이메일", exact: true }).fill("material-qa@example.test");
  await dialog.locator('input[name="password"]').fill("fixture-only-password-long-enough");
  await dialog.getByRole("button", { name: "가입하고 시작", exact: true }).click();
  await expect(dialog.getByText(/가입·이메일 인증 서비스를 일시적으로 이용할 수 없어요/u)).toBeVisible();
  await expect(dialog.locator('input[name="password"]')).toHaveValue("fixture-only-password-long-enough");
  await expect(dialog.getByRole("tab", { name: "회원가입", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/market\/library$/u);
  await dialog.getByRole("button", { name: "로그인 창 닫기", exact: true }).click();
  await expect(page.getByRole("link", { name: "로그인 없이 무료 제작 소재 둘러보기" })).toBeVisible();
});

test("공개 카탈로그가 비어 있어도 실제 기본 소재까지 이동할 수 있다", async ({ page }) => {
  await mockMarket(page);
  await page.route("**/api/creator/marketplace/resources?*", (route) => route.fulfill({ status: 200, json: { items: [], limit: 12, hasMore: false, nextCursor: null } }));
  await page.goto("/market/browse", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "기본 무료 소재 사용하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "바로 꺼내 쓰는 무료 제작 소재" })).toBeVisible();
  await expect(page.locator('[data-essentials-id]').first()).toBeVisible();
});

test("이메일 가입 설정이 없으면 제출 전에 안내하고 기존 로그인은 유지한다", async ({ page }) => {
  await mockMarket(page);
  let signupRequests = 0;
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, json: { authenticated: false, user: null } }));
  await page.route("**/api/auth/providers", (route) => route.fulfill({ status: 200, json: { email: { available: false, reason: "missing-key" } } }));
  await page.route("**/api/auth/signup", (route) => { signupRequests += 1; return route.fulfill({ status: 503, json: {} }); });
  await page.goto("/market/library", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/이메일 신규 가입·인증 메일 발송이 아직 준비되지 않았습니다/u)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "가입하고 시작", exact: true })).toBeDisabled();
  await dialog.getByRole("tab", { name: "로그인", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "로그인", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "인증 메일 다시 보내기", exact: true })).toBeDisabled();
  expect(signupRequests).toBe(0);
  await page.route("**/api/auth/providers", (route) => route.fulfill({ status: 200, json: { email: { available: true, reason: "configured" } } }));
  await dialog.getByRole("button", { name: "이메일 서비스 다시 확인" }).click();
  await dialog.getByRole("tab", { name: "회원가입", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "가입하고 시작", exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/market\/library$/u);
});
