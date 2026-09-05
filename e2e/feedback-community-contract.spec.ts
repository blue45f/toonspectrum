import { expect, test } from "@playwright/test";

import type { FeedbackEntry } from "../packages/core/src/feedback";

const entry: FeedbackEntry = {
  id: "contract-post", category: "bug", title: "응답 계약 회귀 검증",
  text: "구버전 응답과 일시적인 오류를 안전하게 처리합니다.", tags: [],
  status: "open", progress: "received", metadata: {}, answeredAt: null,
  createdAt: "2026-09-01T09:00:00.000Z", author: { id: "member", name: "테스트 창작자", avatar: "" },
  replyCount: 0, voteCount: 0, viewerVoted: false,
};
function result(hasMore = false, items = [entry]) {
  return { contractVersion: 2, items, hasMore, nextCursor: hasMore ? "20" : null, canManage: false };
}

for (const invalidPage of [
  { name: "legacy", body: { items: [{ ...entry, id: "legacy-next" }], hasMore: false, nextCursor: null } },
  { name: "non-advancing cursor", body: result(true) },
]) {
  test(`rejects ${invalidPage.name} on load more, preserves rows and allows retry`, async ({ page }) => {
    let moreCalls = 0;
    const requests: Record<string, string>[] = [];
    await page.route("**/api/feedback/posts**", async (route) => {
      requests.push(route.request().headers());
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      if (!cursor) return route.fulfill({ json: result(true) });
      moreCalls++;
      return route.fulfill({ json: moreCalls === 1 ? invalidPage.body : result(false, [{ ...entry, id: "valid-next", title: "확인된 다음 페이지" }]) });
    });
    await page.goto("/e2e/feedback-community.html?token=private-query-canary");
    await expect(page.locator(".fb-post")).toHaveCount(1);
    await page.getByRole("button", { name: "제보 더보기" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".fb-post")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "공개 제보 등록" })).toBeDisabled();
    await page.getByRole("button", { name: "다음 제보 다시 불러오기" }).click();
    await expect(page.locator(".fb-post")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "공개 제보 등록" })).toBeEnabled();
    expect(moreCalls).toBe(2);
    expect(requests.every((headers) => headers.referer === undefined)).toBe(true);
  });
}

test("a failed refresh preserves the draft but revokes readiness until a verified response", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/feedback/posts**", async (route) => {
    calls++;
    return calls === 2
      ? route.fulfill({ status: 503, json: { message: "새로고침 일시 실패" } })
      : route.fulfill({ json: result() });
  });
  await page.goto("/e2e/feedback-community.html");
  const form = page.getByRole("form", { name: "공개 제보 작성" });
  const title = form.getByLabel("제목", { exact: false });
  await title.fill("작성 중인 제보를 보존합니다");
  await page.getByRole("button", { name: "제보 목록 새로고침" }).click();
  await expect(page.getByRole("alert")).toContainText("새로고침 일시 실패");
  await expect(title).toHaveValue("작성 중인 제보를 보존합니다");
  await expect(form.getByRole("button", { name: "공개 제보 등록" })).toBeDisabled();
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(form.getByRole("button", { name: "공개 제보 등록" })).toBeEnabled();
  await expect(title).toHaveValue("작성 중인 제보를 보존합니다");
});

test("a malformed reply response is an error rather than an empty conversation", async ({ page }) => {
  let replyCalls = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/feedback/posts**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/replies")) {
      replyCalls++;
      return route.fulfill({ json: replyCalls === 1 ? { invalid: true } : [] });
    }
    return route.fulfill({ json: result() });
  });
  await page.goto("/e2e/feedback-community.html");
  await page.getByRole("button", { name: entry.title, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("댓글 응답을 확인할 수 없어요");
  await expect(page.getByText("아직 댓글이 없어요.", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "댓글 다시 불러오기" }).click();
  await expect(page.getByText("아직 댓글이 없어요.", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
