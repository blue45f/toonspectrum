import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/tools/browser-harnesses/creator-onboarding-e2e.html";
const TITLE = "나에게 맞는 작업 환경 만들기";

test.beforeEach(async ({ page }) => {
  let profile = {
    id: "onboarding-browser", name: "Browser tester", email: "browser@example.test",
    image: null, avatar: null, bio: null, regionSettings: null, creatorRoleProfile: {},
  };
  let workspace = { projectKey: "global", revision: 0, document: {} };
  // All mutations stay in this browser test; never contact a real account or backend.
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/me/profile")) {
      profile = { ...profile, ...request.postDataJSON() };
      await route.fulfill({ json: { profile } });
    } else if (path.endsWith("/me")) {
      await route.fulfill({ json: { profile } });
    } else if (path.includes("/creator/role-workspaces/")) {
      if (request.method() === "PUT") workspace = { ...workspace, revision: workspace.revision + 1, document: request.postDataJSON().document };
      await route.fulfill({ json: workspace });
    } else {
      await route.fulfill({ json: {} });
    }
  });
});

async function fillWorkspace(page: Page) {
  await expect(page.getByRole("dialog", { name: TITLE })).toBeVisible();
  await page.getByRole("button", { name: /팀 · 스튜디오/ }).click();
  await page.getByRole("button", { name: /현업 · 전문/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /글작가/ }).click();
  await page.getByRole("button", { name: /어시스턴트/ }).click();
  await page.getByLabel("대표 역할").selectOption("story");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "스토리·대본 집필", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /함께 작업해요/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /Production/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
}

test("completes all six steps with real profile and workspace clients", async ({ page }) => {
  await page.goto(HARNESS);
  await fillWorkspace(page);
  const saved = page.waitForRequest((request) => request.method() === "PUT" && request.url().includes("/creator/role-workspaces/"));
  await page.getByRole("button", { name: "이 작업실로 시작", exact: true }).click();
  expect((await saved).postDataJSON().document).toMatchObject({
    onboardingComplete: true, activeRole: "story", workspaceMode: "production", collaborationMode: "team",
  });
  await expect(page.getByRole("dialog", { name: TITLE })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#opener")).toBeVisible();
  await expect(page.getByRole("dialog", { name: TITLE })).toHaveCount(0);
});

test("Escape dismissal survives reload and route changes", async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.getByRole("dialog", { name: TITLE })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#opener")).toBeFocused();
  await page.reload();
  await page.waitForFunction(() => typeof (window as unknown as { onboardingHarness: { navigate: unknown } }).onboardingHarness?.navigate === "function");
  for (const path of ["/studio/bg3d", "/studio/canvas", "/studio/p/project-1/space", "/studio?mode=bg3d", "/studio"]) {
    await page.evaluate((next) => (window as unknown as { onboardingHarness: { navigate: (path: string) => void } }).onboardingHarness.navigate(next), path);
    await expect(page.getByRole("dialog", { name: TITLE })).toHaveCount(0);
  }
});

for (const path of ["/studio/bg3d", "/studio"]) {
  test(`does not compete with Studio modal isolation at ${path}`, async ({ page }) => {
    await page.goto(`${HARNESS}?route=${encodeURIComponent(path)}&modal=1`);
    await expect(page.locator("#root")).toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "3D 작업 확인", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { onboardingHarness: { clicks: number } }).onboardingHarness.clicks)).toBe(1);
    await expect(page.getByRole("dialog", { name: TITLE })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#studio-test-dialog")).toHaveCount(0);
    await expect(page.locator("#root")).not.toHaveAttribute("inert", "");
  });
}

test("portal controls remain interactive outside an inert application root", async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.getByRole("dialog", { name: TITLE })).toBeVisible();
  await page.locator("#root").evaluate((root) => root.setAttribute("inert", ""));
  await page.getByRole("button", { name: /현업 · 전문/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "어떤 역할을 하고 있나요?", exact: true })).toBeVisible();
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: TITLE })).toHaveCount(0);
});

test("keeps optimistic offline saves visible and retries successfully", async ({ page }) => {
  const savePattern = "**/api/creator/role-workspaces/global";
  await page.route(savePattern, async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 503, json: { error: "서버 저장 실패" } });
    else await route.fallback();
  });
  await page.goto(HARNESS);
  await fillWorkspace(page);
  await page.getByRole("button", { name: "이 작업실로 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("dialog", { name: TITLE })).toBeVisible();
  await page.unroute(savePattern);
  await page.getByRole("button", { name: "이 작업실로 시작", exact: true }).click();
  await expect(page.getByRole("dialog", { name: TITLE })).toHaveCount(0);
});
