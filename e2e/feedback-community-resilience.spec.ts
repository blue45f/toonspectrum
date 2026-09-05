import { expect, test } from "@playwright/test";

import type { FeedbackEntry } from "../packages/core/src/feedback";

const entry: FeedbackEntry = {
  id: "resilience-post", category: "bug", title: "초안 보존 검증",
  text: "새로고침 중에도 작성한 의견을 유지해야 합니다.", tags: [],
  status: "open", progress: "received", metadata: {}, answeredAt: null,
  createdAt: "2026-09-01T09:00:00.000Z", author: { id: "member", name: "창작자", avatar: "" },
  replyCount: 0, voteCount: 0, viewerVoted: false,
};
const result = () => ({ contractVersion: 2, items: [entry], hasMore: false, nextCursor: null, canManage: false });

test("failed refresh and recovery keep the same inline comment draft mounted", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/feedback/posts**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/replies")) return route.fulfill({ json: [] });
    calls++;
    return calls === 2 ? route.fulfill({ status: 503, json: { message: "새로고침 일시 실패" } }) : route.fulfill({ json: result() });
  });
  await page.goto("/e2e/feedback-community.html");
  await page.getByRole("button", { name: entry.title, exact: true }).click();
  const draft = page.getByLabel("공개 댓글");
  await draft.fill("작성 중인 댓글입니다.");
  await page.getByRole("button", { name: "제보 목록 새로고침" }).click();
  await expect(page.getByRole("alert")).toContainText("새로고침 일시 실패");
  await expect(page.locator(".fb-post")).toHaveCount(1);
  await expect(draft).toHaveValue("작성 중인 댓글입니다.");
  await expect(page.getByRole("button", { name: "댓글 등록", exact: true })).toBeDisabled();
  await draft.fill("오류가 나도 계속 작성할 수 있습니다.");
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.getByRole("button", { name: "댓글 등록", exact: true })).toBeEnabled();
  await expect(draft).toHaveValue("오류가 나도 계속 작성할 수 있습니다.");
});

test("failed new filters never display the preceding filter's rows", async ({ page }) => {
  await page.route("**/api/feedback/posts**", async (route) => {
    return new URL(route.request().url()).searchParams.get("q")
      ? route.fulfill({ status: 503, json: { message: "검색 실패" } }) : route.fulfill({ json: result() });
  });
  await page.goto("/e2e/feedback-community.html");
  await expect(page.locator(".fb-post")).toHaveCount(1);
  await page.getByLabel("제보 검색").fill("새로운 조건");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("검색 실패");
  await expect(page.locator(".fb-post")).toHaveCount(0);
});

test("malformed entry fields are reported without crashing React", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/feedback/posts**", (route) => route.fulfill({ json: { ...result(), items: [{ ...entry, author: null }] } }));
  await page.goto("/e2e/feedback-community.html");
  await expect(page.getByRole("alert")).toContainText("제보 목록 응답을 확인할 수 없어요");
  await expect(page.getByRole("button", { name: "공개 제보 등록" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("a malformed successful creation response does not clear the report draft", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/feedback/posts**", async (route) => {
    if (route.request().method() === "POST") { writes++; return route.fulfill({ status: 201, json: { ok: true } }); }
    return route.fulfill({ json: result() });
  });
  await page.goto("/e2e/feedback-community.html");
  const form = page.getByRole("form", { name: "공개 제보 작성" });
  await expect(form.getByRole("button", { name: "공개 제보 등록" })).toBeEnabled();
  await form.getByLabel("제목", { exact: false }).fill("실제 등록 결과를 확인해 주세요");
  await form.getByLabel("어떤 문제가 있었나요?").fill("불완전한 응답을 받아도 초안은 지우지 않습니다.");
  await form.getByLabel("제보 내용이 공개되는 것을 확인했습니다.").check();
  await form.getByRole("button", { name: "공개 제보 등록" }).click();
  await expect(form.getByRole("alert")).toContainText("등록 결과를 확인하지 못했어요");
  await expect(form.getByLabel("제목", { exact: false })).toHaveValue("실제 등록 결과를 확인해 주세요");
  await expect(form.getByLabel("제보 내용이 공개되는 것을 확인했습니다.")).toBeChecked();
  await expect(page.getByText("제보가 등록되었습니다.", { exact: false })).toHaveCount(0);
  expect(writes).toBe(1);
});

test("invalid vote and reply acknowledgements preserve confirmed counts and drafts", async ({ page }) => {
  await page.route("**/api/feedback/posts**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") return route.fulfill({ json: path.endsWith("/vote") ? { voted: true, voteCount: -1 } : { ok: true } });
    return route.fulfill({ json: path.endsWith("/replies") ? [] : result() });
  });
  await page.goto("/e2e/feedback-community.html");
  const vote = page.getByRole("button", { name: /초안 보존 검증 공감/ });
  await vote.click();
  await expect(page.locator(".fb-post > article > .fb-error")).toBeVisible();
  await expect(vote).toHaveAttribute("aria-pressed", "false");
  await expect(vote).toContainText("0");
  await page.getByRole("button", { name: entry.title, exact: true }).click();
  await page.getByLabel("공개 댓글").fill("보존해야 할 댓글입니다.");
  await page.getByRole("button", { name: "댓글 등록", exact: true }).click();
  await expect(page.locator(".fb-thread").getByRole("alert")).toContainText("댓글 등록 결과를 확인하지 못했어요");
  await expect(page.getByLabel("공개 댓글")).toHaveValue("보존해야 할 댓글입니다.");
  await expect(page.getByText("댓글이 등록되었습니다.", { exact: true })).toHaveCount(0);
});
