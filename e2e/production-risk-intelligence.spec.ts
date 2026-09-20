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

test("predictive risk stays explainable and requires explicit registration on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/production/projects/sample-project/overview", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "프로젝트 운영 조종석" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "예측 리스크 레이더" })).toBeVisible();
  await expect(page.getByText("왜 위험한가").first()).toBeVisible();
  await expect(page.getByText("예상 영향").first()).toBeVisible();
  await expect(page.getByText("권장 대응").first()).toBeVisible();
  await expect(page.getByText(/자동으로 담당자나 일정을 바꾸지 않습니다/u)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  const register = page.getByRole("button", { name: /예측 신호를 제작 위험으로 등록/u }).first();
  await expect(register).toBeEnabled();
  const signalCard = register.locator("xpath=ancestor::article[1]");
  await register.click();
  await expect(signalCard.getByText("위험 원장 등록됨", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "제작 위험으로 등록했습니다" })).toBeVisible();

  await capturePageEvidence(page, testInfo, "production-risk-overview-mobile");
  expect(pageErrors).toEqual([]);
});

test("schedule workspace exposes predicted risk as a distinct operational filter", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/production/projects/sample-project/schedule", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "일정·용량 작업실" })).toBeVisible();
  await expect(page.getByText("예측 위험", { exact: true }).first()).toBeVisible();
  const filter = page.getByLabel("위험 필터");
  await expect(filter.locator('option[value="predicted"]')).toHaveText("예측 위험");
  await filter.selectOption("predicted");
  await expect(filter).toHaveValue("predicted");
  await expect(page.getByText("현재 필터에 맞는 작업이 없습니다.")).toHaveCount(0);
  await expect(page.getByText(/마감보다 약|선행 작업|현재 작업이 차단/u).first()).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capturePageEvidence(page, testInfo, "production-risk-schedule-mobile");
  expect(pageErrors).toEqual([]);
});

test("recovery scenarios compare outcomes and apply only an explicit reversible change", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/production/projects/sample-project/overview", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "복구 시나리오 비교" })).toBeVisible();
  await expect(page.getByText(/원본 데이터에 적용하지 않고/u)).toBeVisible();
  const selector = page.getByLabel("시나리오를 비교할 위험");
  await selector.selectOption("blocker:task-episode-12-background");
  await expect(page.getByText("마감 2일 재조정", { exact: true })).toBeVisible();
  await expect(page.getByText("차단 입력 즉시 확정", { exact: true })).toBeVisible();
  await expect(page.getByText("미리보기 전용").first()).toBeVisible();
  await expect(page.getByText("위험 점수").first()).toBeVisible();
  await expect(page.getByText("예상 개선").first()).toBeVisible();

  const apply = page.getByRole("button", { name: "마감 2일 재조정 복구 시나리오 적용" });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByRole("status").filter({ hasText: "복구 시나리오를 원자적으로 적용했습니다" })).toBeVisible();
  const undo = page.getByRole("button", { name: "마감 2일 재조정 복구 시나리오 되돌리기" });
  await expect(page.locator("[data-production-recovery-scenarios]").getByRole("status")).toContainText("마감 2일 재조정 적용됨");
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole("status").filter({ hasText: "복구 시나리오를 원자적으로 되돌렸습니다" })).toBeVisible();
  await expect(undo).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capturePageEvidence(page, testInfo, "production-recovery-scenario-mobile");
  expect(pageErrors).toEqual([]);
});
