import { expect, test, type Page } from "@playwright/test";

interface FixtureState { posts: number; failNext: boolean; hold: Promise<void> | null; adminWrites: unknown[] }
async function fixture(page: Page): Promise<FixtureState> {
  const state: FixtureState = { posts: 0, failNext: false, hold: null, adminWrites: [] };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/test-account") && request.method() === "POST") {
      const body = request.postDataJSON();
      state.adminWrites.push(body);
      return route.fulfill({ json: { ok: true, id: "member-a", isTestAccount: body.isTestAccount } });
    }
    if (path.includes("/replies") && request.method() === "GET") return route.fulfill({ json: [] });
    if (path.includes("/replies") && request.method() === "DELETE") return route.fulfill({ json: { ok: true, softDeleted: false } });
    if (path.endsWith("/replies") && request.method() === "POST") {
      state.posts += 1;
      if (state.failNext) {
        state.failNext = false;
        return route.fulfill({ status: 503, json: { error: "연결을 확인하고 다시 등록해 주세요." } });
      }
      const body = request.postDataJSON();
      if (state.hold) await state.hold;
      return route.fulfill({ json: { id: `created-${state.posts}`, text: body.text, spoiler: body.spoiler ?? false,
        parentId: body.parentId ?? null, createdAt: "2026-09-28T00:00:00.000Z", children: [],
        author: { id: "member-a", name: "검증 작성자", avatar: "#112233" } } });
    }
    return route.fulfill({ status: 404, json: { error: "검증 범위 밖 요청은 차단합니다." } });
  });
  return state;
}
for (const width of [1440, 390]) {
  test.describe(`커뮤니티 Chromium ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    test("댓글 전송 중 초안 보존과 중복 클릭 방지", async ({ page }) => {
      const state = await fixture(page);
      let release: () => void = () => {};
      state.hold = new Promise<void>((resolve) => { release = resolve; });
      await page.goto("/e2e/community-replies.html");
      const area = page.getByRole("region", { name: "팬카페 댓글 검증" });
      await expect(area.getByText("첫 댓글을 남겨 대화를 시작하세요.")).toBeVisible();
      const input = area.getByRole("textbox", { name: "댓글 작성" });
      await input.fill("첫 번째 댓글");
      await area.getByRole("button", { name: "등록", exact: true }).click();
      try {
        await expect.poll(() => state.posts).toBe(1);
        await expect(area.getByRole("button", { name: "등록 중...", exact: true })).toBeDisabled();
        await input.fill("전송 도중 새로 쓴 내용");
      } finally { release(); }
      await expect(area.getByText("첫 번째 댓글", { exact: true })).toBeVisible();
      await expect(input).toHaveValue("전송 도중 새로 쓴 내용");
      expect(state.posts).toBe(1);
    });
    test("리뷰 답글 실패 후 입력 유지와 재등록", async ({ page }) => {
      const state = await fixture(page);
      state.failNext = true;
      await page.goto("/e2e/community-replies.html");
      const area = page.getByRole("region", { name: "리뷰 답글 검증" });
      await area.getByRole("button", { name: "답글 보기" }).click();
      const input = area.getByRole("textbox", { name: "리뷰에 답글 남기기" });
      await input.fill("통신이 끊겨도 유지할 답글");
      await area.getByRole("button", { name: "등록", exact: true }).click();
      await expect(area.getByRole("alert")).toContainText("다시 등록");
      await expect(input).toHaveValue("통신이 끊겨도 유지할 답글");
      await area.getByRole("button", { name: "등록", exact: true }).click();
      await expect(area.getByText("통신이 끊겨도 유지할 답글", { exact: true })).toBeVisible();
      await expect(input).toHaveValue("");
      expect(state.posts).toBe(2);
    });
    test("계정 전환 시 이전 댓글 초안을 분리", async ({ page }) => {
      await fixture(page);
      await page.goto("/e2e/community-replies.html");
      const input = page.getByRole("textbox", { name: "댓글 작성", exact: true });
      await input.fill("다른 계정에 보여주지 않을 초안");
      await page.getByRole("button", { name: "검증 계정 전환" }).click();
      await expect(input).toHaveValue("");
    });
    test("관리자 구분 변경에는 사유와 확인이 필요", async ({ page }) => {
      const state = await fixture(page);
      await page.goto("/e2e/community-replies.html");
      const area = page.getByRole("region", { name: "내부 테스트 계정 관리" });
      const button = area.getByRole("button", { name: "테스트 계정으로 지정" });
      await expect(button).toBeDisabled();
      await area.getByRole("textbox", { name: "변경 사유" }).fill("브라우저 댓글 회귀 검증");
      await expect(button).toBeDisabled();
      await area.getByRole("checkbox").check();
      await button.click();
      await expect(area.getByText("테스트 계정 · 관리자 전용", { exact: true })).toBeVisible();
      expect(state.adminWrites).toEqual([{ isTestAccount: true, expectedIsTestAccount: false, reason: "브라우저 댓글 회귀 검증" }]);
    });
    test("운영자에게는 구분 변경 폼을 노출하지 않음", async ({ page }) => {
      const state = await fixture(page);
      await page.goto("/e2e/community-replies.html?viewer=operator");
      const area = page.getByRole("region", { name: "내부 테스트 계정 관리" });
      await expect(area.getByText("계정 구분 변경은 관리자만 실행할 수 있습니다.")).toBeVisible();
      await expect(area.getByRole("button")).toHaveCount(0);
      expect(state.adminWrites).toHaveLength(0);
    });
    test("긴 댓글의 가로 넘침 방지와 브라우저 화면 증거", async ({ page }, testInfo) => {
      await fixture(page);
      await page.goto("/e2e/community-replies.html");
      const area = page.getByRole("region", { name: "팬카페 댓글 검증" });
      await expect(area.getByText("첫 댓글을 남겨 대화를 시작하세요.")).toBeVisible();
      const text = "긴문장".repeat(120);
      await area.getByRole("textbox", { name: "댓글 작성" }).fill(text);
      await area.getByRole("button", { name: "등록", exact: true }).click();
      await expect(area.getByText(text, { exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await testInfo.attach(`community-${width}px`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    });
  });
}
