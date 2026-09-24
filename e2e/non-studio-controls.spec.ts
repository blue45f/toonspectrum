import { expect, test } from "./fixtures/non-studio-test";

const backup = { _app: "toonspectrum-library", version: 1, ratings: { "isolated-work": 4.5 }, reads: {}, subscriptions: {}, reviews: {}, likedReviews: {}, collections: [] };
const reference = { id: 'kmas:["id","non-studio-control-fixture"]', title: "검증용 가상 작품", subtitle: "테스트 데이터", writer: "검증용 작가", illustrator: "검증용 작가", publisher: "검증용 출판사", platform: "", genre: "테스트", age: "전체연령", isbn: "", outline: "테스트용 줄거리" };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  });
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/auth/session")) {
      await route.fulfill({ status: 200, json: { user: null, expires: null } });
    } else {
      await route.fulfill({ status: 503, json: { message: "Isolated browser outage fixture" } });
    }
  });
});

test.describe("mobile campus map keyboard focus", () => {
  // The spatial campus owns this route and suppresses the marketing overlay.
  // Disable the optional fixture handler so this round trip observes only the map dialog.
  test.use({ dismissBetaEvent: false });

  test("campus map opens, closes with Escape and restores keyboard focus", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator('[role="dialog"][aria-labelledby="beta-open-gate-title"]')).toHaveCount(0);
    const trigger = page.getByRole("button", { name: "공간 지도 열기", exact: true });
    const map = page.getByRole("dialog", { name: "창작 세계의 공간 지도", exact: true });
    await trigger.focus();
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(map).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(map).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test("anonymous account gate opens and dismisses login without submitting credentials", async ({ page }) => {
  await page.goto("/me");
  await page.locator('main button:not([data-auth-trigger])', { hasText: /^로그인$/u }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("settings preserve preferences and require explicit valid backup replacement", async ({ page }, testInfo) => {
  await page.goto("/settings");
  const hundred = page.getByRole("button", { name: "100점", exact: true });
  await hundred.click();
  await page.reload();
  await expect(hundred).toHaveAttribute("aria-pressed", "true");
  const files = page.getByLabel("서재 백업 파일");
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("toonspectrum-store") ?? "{}").state?.ratings);
  await files.setInputFiles({ name: "unrelated.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.locator("[data-library-import]").getByRole("alert")).toContainText("기존 기록은 변경하지 않았습니다");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("toonspectrum-store") ?? "{}").state?.ratings)).toEqual(initial);
  await files.setInputFiles({ name: "library.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole("region", { name: "백업 복원 미리보기" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("toonspectrum-store") ?? "{}").state?.ratings)).toEqual(initial);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await files.setInputFiles({ name: "library.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole("button", { name: "기존 기록 교체 확인" }).click();
  await expect(page.locator("[data-library-import]").getByRole("status")).toContainText("복원했습니다");
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("toonspectrum-store") ?? "{}").state?.ratings)).toEqual(backup.ratings);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "내 서재 백업 내보내기", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^toonspectrum-library-.*\.json$/u);
  await download.saveAs(testInfo.outputPath("isolated-library-backup.json"));
  await page.screenshot({ path: testInfo.outputPath("settings-390.png"), fullPage: true, animations: "disabled", timeout: 30_000 });
});

test("search supports mobile filters, saved-only and list controls during an outage", async ({ page }) => {
  await page.goto("/search?q=검증");
  const field = page.locator("#search-explorer-query");
  await expect(field).toHaveValue("검증");
  await field.fill("두번째 검색");
  // Let the real query navigation settle before checking modal focus restoration.
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("두번째 검색");
  const toggle = page.getByRole("button", { name: "필터", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const filters = page.getByRole("dialog", { name: "필터", exact: true });
  await expect(filters).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(filters).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await filters.getByRole("button", { name: /결과 보기$/u }).click();
  await expect(filters).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const saved = page.getByRole("button", { name: "내 찜만", exact: true });
  await saved.click(); await expect(saved).toHaveAttribute("aria-pressed", "true");
  await saved.click(); await expect(saved).toHaveAttribute("aria-pressed", "false");
  // Segmented exposes tabs, not buttons, to assistive technology.
  const list = page.getByRole("tab", { name: "리스트 보기", exact: true });
  await list.click();
  await expect(list).toHaveAttribute("aria-selected", "true");
  await expect(field).toHaveValue("두번째 검색");
});

test("market kind, explicit search and sorting reach the API with the chosen conditions", async ({ page }) => {
  const requests: URL[] = [];
  await page.route(/\/api\/creator\/marketplace\/resources(?:\?.*)?$/u, async (route) => {
    requests.push(new URL(route.request().url()));
    await route.fulfill({ status: 200, json: { items: [], limit: 12, hasMore: false, nextCursor: null } });
  });
  await page.goto("/market/browse");
  await page.getByRole("button", { name: "브러시", exact: true }).click();
  await expect(page).toHaveURL(/kind=brush/u);
  const field = page.getByRole("searchbox", { name: "마켓 리소스 검색" });
  await field.fill("잉크"); await field.press("Enter");
  await page.getByRole("combobox", { name: "정렬 기준" }).selectOption("newest");
  await expect.poll(() => requests.some((url) => url.searchParams.get("kind") === "brush" && url.searchParams.get("search") === "잉크" && url.searchParams.get("sort") === "newest")).toBe(true);
});

test("reference search, detail, notebook persistence and actual export remain connected", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let requests = 0;
  await page.route("**/api/kmas/references?*", async (route) => {
    requests += 1;
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, json: { source: "kmas", items: [reference], total: 1, hasNext: false, cached: false, fetchedAt: "2026-09-06T00:00:00Z", query: { field: url.searchParams.get("field"), q: url.searchParams.get("q"), page: 1 } } });
  });
  await page.goto("/references");
  await expect(page.locator(".ref-start")).toBeVisible();
  expect(requests).toBe(0);
  await page.locator('input[name="q"]').fill("검증용");
  expect(requests).toBe(0);
  await page.locator(".ref-search-form").getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.locator(".ref-card h3")).toHaveText(reference.title);
  await page.locator(".ref-card-main").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.locator("#ref-personal-note").fill("격리 브라우저 검증 메모");
  await dialog.getByRole("button", { name: "메모 저장", exact: true }).click();
  // Saving is asynchronous and intentionally blocks closing to prevent data loss.
  await expect(dialog.getByRole("status").filter({ hasText: "연구노트에 저장했습니다" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "메모 저장", exact: true })).toBeDisabled();
  await expect(page.locator("#ref-personal-note")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ref-card-main")).toBeFocused();
  await page.locator(".ref-tabs").getByRole("button", { name: /내 연구노트/u }).click();
  await expect(page.locator(".ref-note-preview")).toHaveText("격리 브라우저 검증 메모");
  await page.reload();
  await expect(page.locator(".ref-note-preview")).toHaveText("격리 브라우저 검증 메모");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "노트 내보내기", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/u);
  await download.saveAs(testInfo.outputPath("isolated-reference-note.md"));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("toonstudio:kmas-reference-notes:v1") ?? "{}").notes[0].item.outline)).toBe("");
  await page.screenshot({ path: testInfo.outputPath("reference-notebook-1440.png"), fullPage: true, animations: "disabled", timeout: 30_000 });
});
