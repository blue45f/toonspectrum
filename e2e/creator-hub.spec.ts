import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const ID = "11111111-1111-4111-8111-111111111111";
const post = { id: ID, author: { id: "artist", name: "테스트 작가" }, type: "commission", role: "ink",
  title: "선화 보조 작업자를 구합니다", payType: "paid", workMode: "remote", status: "open", version: 1,
  hidden: false, saved: false, expired: false, createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z",
  details: { description: "매주 웹툰 선화 작업을 함께할 작가님을 찾습니다. 작업 범위와 일정은 함께 협의합니다.",
    deliverables: "매주 10컷 원본 납품", terms: "저작권과 크레딧 사전 협의", compensation: "납품 후 7일 이내 지급",
    budgetMin: 100000, budgetMax: 200000, budgetUnit: "episode", deadline: "", location: "", genre: "판타지", tools: ["Clip Studio"], portfolioUrl: "" } };
const promotion = { id: ID, author: post.author, kind: "trailer", stage: "debut", genre: "판타지",
  title: "첫 웹툰을 소개합니다", seriesTitle: "별빛의 여행", description: "첫 번째 작품의 이야기를 소개합니다. 새로운 세계의 모험을 함께해 주세요.",
  readingUrl: "https://example.com/story", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", cover: "", tags: ["첫연재"],
  contentWarning: "", rightsConfirmed: true, version: 1, hidden: false, archived: false, saved: false,
  createdAt: post.createdAt, updatedAt: post.updatedAt };
const pageData = (items: unknown[]) => ({ items, hasMore: false, nextCursor: null, canModerate: false });
async function fixtures(page: Page, unavailable = false) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {}; let status = 200;
    if (path.endsWith("/auth/session")) { data = { authenticated: false, user: null }; }
    else if (path.endsWith("/collaborations/hiring/positions")) data = { items: [], next: null };
    else if (path.endsWith("/collaborations/posts")) {
      status = unavailable ? 503 : 200;
      data = unavailable ? { message: "구인·의뢰 저장소에 연결하지 못했어요." } : pageData([post]);
    } else if (path.endsWith(`/collaborations/posts/${ID}`)) data = { post, application: null, canManage: false, canModerate: false };
    else if (path.endsWith("/promotions/posts")) data = pageData([promotion]);
    else if (path.endsWith(`/promotions/posts/${ID}`)) data = { post: promotion, comments: [], canManage: false, canModerate: false };
    else if (path.endsWith("/me")) { status = 401; data = { message: "로그인이 필요해요." }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.route(/https:\/\/(?:www\.)?youtube-nocookie\.com\/.*|https:\/\/player\.vimeo\.com\/.*/u, (route) => route.abort());
}

test("recruitment filters, detail and creator link", async ({ page }) => {
  await fixtures(page); await page.goto("/collaborate");
  await expect(page.getByRole("heading", { name: "선화 보조 작업자를 구합니다" })).toBeVisible();
  await page.getByLabel("작업 분야", { exact: true }).selectOption("background");
  await expect(page).toHaveURL(/role=background/u);
  await page.getByRole("link", { name: "선화 보조 작업자를 구합니다" }).click();
  await expect(page.getByRole("heading", { name: "협업 조건 한눈에" })).toBeVisible();
  await expect(page.getByRole("link", { name: "테스트 작가", exact: true })).toHaveAttribute("href", "/u/artist");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test("an invalid optional hiring response preserves the original post and author", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/collaborations/hiring/positions*", (route) => route.fulfill({ json: {} }));
  await page.goto(`/collaborate/${ID}`);
  await expect(page.getByRole("heading", { name: post.title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "테스트 작가", exact: true })).toHaveAttribute("href", "/u/artist");
  await expect(page.getByRole("region", { name: "공개 모집 조건" }).getByRole("alert")).toBeVisible();
  await expect(page.getByText("이 조건에 맞는 공개 모집 자리가 없어요.")).toHaveCount(0);
});
test("new forms require authentication and never pretend to publish", async ({ page }) => {
  await fixtures(page); await page.goto("/collaborate/new");
  await expect(page.getByRole("link", { name: "로그인 / 회원가입", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "공고 공개 등록" })).toHaveCount(0);
  await page.goto("/community/promote/new");
  await expect(page.getByRole("heading", { name: "로그인 후 작품을 소개해 주세요" })).toBeVisible();
});
test("promotion discovery and consent-gated trailer", async ({ page }) => {
  await fixtures(page); await page.goto("/community/promote");
  await expect(page.getByRole("heading", { name: "첫 웹툰을 소개합니다" })).toBeVisible();
  await page.getByRole("link", { name: "첫 웹툰을 소개합니다", exact: true }).click();
  await expect(page.getByRole("heading", { name: "첫 웹툰을 소개합니다" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: /홍보 영상 보기/u }).click();
  await expect(page.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test("storage failure stays an error rather than a fake empty list", async ({ page }) => {
  await fixtures(page, true); await page.goto("/collaborate");
  await expect(page.getByRole("alert")).toContainText("연결하지 못했어요");
  await expect(page.getByRole("button", { name: "다시 불러오기", exact: true })).toBeVisible();
  await expect(page.getByText("조건에 맞는 공고가 아직 없어요.")).toHaveCount(0);
});
