import { expect, test } from "@playwright/test";

import type { FeedbackComment, FeedbackEntry } from "../packages/core/src/feedback";
import type { Page } from "@playwright/test";

const fixture = (index: number, category: FeedbackEntry["category"] = "bug"): FeedbackEntry => ({
  id: `post-${index}`, category, title: ["필터 적용 후 브러시가 멈춰요", "자주 쓰는 에셋을 한곳에 모으고 싶어요", "레이어 이름 일괄 변경 기능을 요청해요"][index % 3],
  text: "창작 중 발견한 불편함을 나눕니다. 같은 경험이 있다면 공감과 댓글로 알려주세요.", tags: ["스튜디오"],
  status: "open", progress: "received", metadata: { area: "drawing", steps: "1. 필터 적용\n2. 브러시 사용" },
  answeredAt: null, createdAt: "2026-09-01T09:00:00.000Z", author: { id: "member", name: "그리는 하루", avatar: "" },
  replyCount: 0, voteCount: 0, viewerVoted: false,
});
async function setup(page: Page, options: { count?: number; admin?: boolean; listFail?: boolean; replyFail?: boolean; sendFail?: boolean; legacy?: boolean } = {}) {
  let rows = Array.from({ length: options.count ?? 3 }, (_, index) => fixture(index, ["bug", "idea", "request"][index % 3] as FeedbackEntry["category"]));
  const replies: Record<string, FeedbackComment[]> = {};
  const writes: { path: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  let listFail = !!options.listFail;
  let replyFail = !!options.replyFail;
  let sendFail = !!options.sendFail;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/feedback/posts**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (request.method() === "GET" && path.endsWith("/posts")) {
      if (listFail) { listFail = false; return json({ message: "일시적인 목록 오류입니다." }, 503); }
      let filtered = rows;
      const category = url.searchParams.get("category"); const progress = url.searchParams.get("progress"); const query = url.searchParams.get("q");
      if (category && category !== "all") filtered = filtered.filter((row) => row.category === category);
      if (progress && progress !== "all") filtered = filtered.filter((row) => row.progress === progress);
      if (query) filtered = filtered.filter((row) => row.title.includes(query) || row.text.includes(query));
      const start = Number(url.searchParams.get("cursor") ?? 0); const end = start + 20;
      return json({ items: filtered.slice(start, end), hasMore: filtered.length > end, nextCursor: filtered.length > end ? String(end) : null, canManage: !!options.admin, ...(options.legacy ? {} : { contractVersion: 2 }) });
    }
    const segments = path.split("/"); const action = segments.at(-1); const postId = segments.at(-2) ?? "";
    if (request.method() === "GET" && action === "replies") {
      if (replyFail) { replyFail = false; return json({ message: "댓글 조회 오류입니다." }, 503); }
      return json(replies[postId] ?? []);
    }
    if (request.method() === "GET") return json(rows.find((row) => row.id === action) ?? {}, 200);
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ path, body, headers: request.headers() });
    if (path.endsWith("/posts")) {
      const created = { ...fixture(100), ...body, id: `created-${writes.length}` } as FeedbackEntry;
      rows = [created, ...rows]; return json(created, 201);
    }
    const row = rows.find((item) => item.id === postId);
    if (!row) return json({ message: "없는 제보" }, 404);
    if (action === "vote") { row.viewerVoted = body.voted === true; row.voteCount = row.viewerVoted ? 1 : 0; return json({ voted: row.viewerVoted, voteCount: row.voteCount }); }
    if (action === "replies") {
      if (sendFail) { sendFail = false; return json({ message: "댓글 전송 실패. 다시 시도해 주세요." }, 503); }
      const reply: FeedbackComment = { id: `reply-${writes.length}`, postId, parentId: null, author: row.author, text: String(body.text), isOfficial: false, createdAt: row.createdAt };
      (replies[postId] ??= []).push(reply); row.replyCount++; return json(reply, 201);
    }
    if (action === "progress") {
      if (!options.admin) return json({ message: "운영자만 변경할 수 있어요." }, 403);
      row.progress = body.progress as FeedbackEntry["progress"]; row.status = "answered"; row.replyCount++;
      (replies[postId] ??= []).push({ id: `status-${writes.length}`, postId, parentId: null, author: { name: "운영팀", avatar: "" }, text: String(body.note), isOfficial: true, createdAt: row.createdAt });
      return json(row);
    }
    return json({ message: "Unknown test endpoint" }, 404);
  });
  return { writes, errors };
}
const open = (page: Page, params = "") => page.goto(`/e2e/feedback-community.html${params}`);
const composer = (page: Page) => page.getByRole("form", { name: "공개 제보 작성" });

test("guest can read but not write/vote, and no false private-inquiry claim", async ({ page }) => {
  const state = await setup(page);
  await open(page, "?viewer=guest");
  await expect(page.getByRole("heading", { name: "제보·제안 커뮤니티" })).toBeVisible();
  await expect(page.getByText("읽기는 누구나,")).toBeVisible();
  await expect(page.getByRole("button", { name: /필터 적용 후 브러시가 멈춰요 공감/ })).toBeDisabled();
  await expect(composer(page)).toHaveCount(0);
  await expect(page.getByText("운영팀에 비공개 문의")).toHaveCount(0);
  expect(state.errors).toEqual([]);
  await page.screenshot({ path: "artifacts/feedback/desktop-guest.png", fullPage: true });
});

test("request creation requires public confirmation and does not expose URL/session data", async ({ page }) => {
  const state = await setup(page); await open(page, "?type=request&token=must-not-be-sent");
  const form = composer(page);
  await form.getByLabel("제목", { exact: false }).fill("작업 중 레이어를 일괄 정리하고 싶어요");
  await form.getByLabel("의견과 요청 내용").fill("여러 레이어 이름에 순번을 한 번에 추가하고 싶습니다.");
  await form.getByRole("button", { name: "공개 제보 등록" }).click();
  await expect(form.getByRole("alert")).toContainText("공개 여부"); expect(state.writes).toHaveLength(0);
  await form.getByLabel("제보 내용이 공개되는 것을 확인했습니다.").check();
  await form.getByRole("button", { name: "공개 제보 등록" }).click();
  await expect(page.getByText("제보가 등록되었습니다.", { exact: false })).toBeVisible();
  expect(state.writes[0].body.category).toBe("request");
  expect(JSON.stringify(state.writes[0])).not.toContain("must-not-be-sent");
  expect(state.writes[0].headers["x-user-id"]).toBeUndefined();
  expect(state.errors).toEqual([]);
});

test("structured bug reproduction is persisted without a fabricated template body", async ({ page }) => {
  const state = await setup(page); await open(page);
  const form = composer(page);
  await form.getByLabel("제목", { exact: false }).fill("필터 사용 후 오류를 재현했어요");
  await form.getByLabel("어떤 문제가 있었나요?").fill("필터를 적용한 뒤 선을 그리면 반응하지 않습니다.");
  await form.getByLabel("재현 순서").fill("필터 선택 → 브러시 그리기");
  await form.getByLabel("기대했던 동작").fill("선이 그려집니다.");
  await form.getByLabel("실제로 발생한 동작").fill("선이 그려지지 않습니다.");
  await form.getByLabel("제보 내용이 공개되는 것을 확인했습니다.").check();
  await form.getByRole("button", { name: "공개 제보 등록" }).click();
  await expect(page.getByText("제보가 등록되었습니다.", { exact: false })).toBeVisible();
  expect(state.writes[0].body.metadata).toMatchObject({ steps: "필터 선택 → 브러시 그리기", expected: "선이 그려집니다.", actual: "선이 그려지지 않습니다." });
});

test("search, type filtering, pagination and reset use the server contract", async ({ page }) => {
  await setup(page, { count: 24 }); await open(page);
  await expect(page.locator(".fb-post")).toHaveCount(20);
  await page.getByRole("button", { name: "제보 더보기" }).click(); await expect(page.locator(".fb-post")).toHaveCount(24);
  await page.getByLabel("제보 검색").fill("레이어"); await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.locator(".fb-post")).toHaveCount(8);
  await page.getByRole("button", { name: "필터 초기화" }).click(); await expect(page.locator(".fb-post")).toHaveCount(20);
  await page.getByRole("group", { name: "제보 유형 필터" }).getByRole("button", { name: "아이디어" }).click();
  await expect(page.locator(".fb-post")).toHaveCount(8);
});

test("vote and retract show acknowledged server counts", async ({ page }) => {
  const state = await setup(page); await open(page);
  const vote = page.getByRole("button", { name: /필터 적용 후 브러시가 멈춰요 공감/ });
  await vote.click(); await expect(vote).toHaveAttribute("aria-pressed", "true"); await expect(vote).toContainText("1");
  await vote.click(); await expect(vote).toHaveAttribute("aria-pressed", "false"); await expect(vote).toContainText("0");
  expect(state.writes.filter((write) => write.path.endsWith("/vote")).map((write) => write.body.voted)).toEqual([true, false]);
});

test("failed comments retain text and report errors; Enter in textarea does not submit", async ({ page }) => {
  const state = await setup(page, { sendFail: true }); await open(page);
  await page.getByRole("button", { name: "필터 적용 후 브러시가 멈춰요", exact: true }).click();
  const field = page.getByLabel("공개 댓글"); await field.fill("저도 같은 증상을 겪었어요."); await field.press("Enter");
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "댓글 등록", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("댓글 전송 실패"); await expect(field).toHaveValue("저도 같은 증상을 겪었어요.\n");
  await page.getByRole("button", { name: "댓글 등록", exact: true }).click();
  await expect(page.getByText("댓글이 등록되었습니다.")).toBeVisible(); await expect(field).toHaveValue("");
});

test("reply load failures are not displayed as an empty thread", async ({ page }) => {
  await setup(page, { replyFail: true }); await open(page);
  await page.getByRole("button", { name: "필터 적용 후 브러시가 멈춰요", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("댓글 조회 오류");
  await page.getByRole("button", { name: "댓글 다시 불러오기" }).click();
  await expect(page.getByText("아직 댓글이 없어요.", { exact: false })).toBeVisible();
});

test("list errors are recoverable, not mistaken for no reports", async ({ page }) => {
  await setup(page, { listFail: true }); await open(page);
  await expect(page.getByRole("heading", { name: "제보 목록을 불러오지 못했어요" })).toBeVisible();
  await expect(page.getByText("첫 의견을 기다리고 있어요")).toHaveCount(0);
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click(); await expect(page.locator(".fb-post")).toHaveCount(3);
});

test("legacy API cannot silently accept a request as a question during a rolling deployment", async ({ page }) => {
  await setup(page, { legacy: true }); await open(page);
  await expect(page.getByRole("alert")).toContainText("업데이트가 아직 반영되지 않았어요");
  await expect(composer(page).getByRole("button", { name: "공개 제보 등록" })).toBeDisabled();
});

test("operator progress editor records a public note independently of ordinary replies", async ({ page }) => {
  const state = await setup(page, { admin: true }); await open(page);
  await page.getByRole("button", { name: "필터 적용 후 브러시가 멈춰요", exact: true }).click();
  await page.getByText("운영자 처리 상태 관리", { exact: true }).click();
  await page.getByLabel("변경할 처리 상태").selectOption("reviewing");
  await page.getByLabel("공개 처리 안내").fill("재현 조건을 확인하고 있습니다. 추가 정보를 공유해 주세요.");
  await page.getByRole("button", { name: "처리 상태 저장" }).click();
  await expect(page.locator(".fb-post").first().locator(".fb-progress")).toHaveText("검토 중");
  await expect(page.locator(".fb-reply").first()).toContainText("추가 정보를 공유해 주세요.");
  expect(state.writes[0].body.expectedProgress).toBe("received");
  expect(state.errors).toEqual([]);
  await page.screenshot({ path: "artifacts/feedback/desktop-operator.png", fullPage: true });
});

for (const width of [320, 390, 768, 1440]) {
  test(`responsive layout at ${width}px has no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); const state = await setup(page); await open(page);
    await expect(page.locator(".fb-post")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: /이 기능이 필요해요/ }).click();
    await expect(composer(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(state.errors).toEqual([]);
    if (width === 390 || width === 1440) await page.screenshot({ path: `artifacts/feedback/layout-${width}.png`, fullPage: true });
  });
}
