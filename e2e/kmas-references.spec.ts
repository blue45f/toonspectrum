import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

// Synthetic records exist only in tests, never in the production page.
const fixture = {
  id: 'kmas:["id","test-only-reference"]', title: "검증용 가상 작품", subtitle: "테스트 데이터",
  writer: "검증용 글 작가", illustrator: "검증용 그림 작가", publisher: "검증용 출판사",
  platform: "", genre: "테스트", age: "전체연령", isbn: "", outline: "테스트용 줄거리입니다.",
};
const storageKey = "toonstudio:kmas-reference-notes:v1";
async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("toonspectrum-intro-shown", "1");
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  });
  await page.route("**/api/kmas/references?*", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: { source: "kmas", items: [fixture], total: 1, hasNext: false, cached: false,
      fetchedAt: "2026-09-06T00:00:00Z", query: { field: url.searchParams.get("field"), q: url.searchParams.get("q"), page: Number(url.searchParams.get("page")) } } });
  });
}
async function submit(page: Page, q = "검증용") {
  await page.locator('input[name="q"]').fill(q);
  await page.locator(".ref-search-form").getByRole("button", { name: /^검색$|^Search$/ }).click();
  await expect(page.locator(".ref-card h3")).toHaveText(fixture.title);
}
test("no eager API call; explicit search and history restore inputs", async ({ page }) => {
  await prepare(page);
  let requests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/kmas/references?")) requests++; });
  await page.goto("/references");
  await expect(page.locator(".ref-start")).toBeVisible();
  await expect(page).toHaveTitle(/만화 레퍼런스|Comic references/);
  expect(requests).toBe(0);
  await page.locator('input[name="q"]').fill("typing only");
  expect(requests).toBe(0);
  await submit(page, "첫 검색");
  await submit(page, "두번째 검색");
  await page.goBack();
  await expect(page.locator('input[name="q"]')).toHaveValue("첫 검색");
  await expect(page.locator(".ref-card h3")).toHaveText(fixture.title);
  await page.goForward();
  await expect(page.locator('input[name="q"]')).toHaveValue("두번째 검색");
});
test("detail, personal note, reload, export and deliberate removal", async ({ page }) => {
  await prepare(page); await page.goto("/references"); await submit(page);
  const detail = page.locator(".ref-card-main");
  await detail.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#ref-personal-note").fill("컷 사이의 시선 연결을 연구한다.");
  await page.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(page.locator("[data-reference-status]")).toContainText(/저장|Saved|saved/);
  await page.keyboard.press("Escape");
  await expect(detail).toBeFocused();
  await page.locator(".ref-tabs").getByRole("button", { name: /내 연구노트|My notebook/ }).click();
  await expect(page.locator(".ref-note-preview")).toHaveText("컷 사이의 시선 연결을 연구한다.");
  await page.reload();
  await expect(page.locator(".ref-note-preview")).toHaveText("컷 사이의 시선 연결을 연구한다.");
  const raw = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  expect(JSON.parse(raw!).notes[0].item.outline).toBe("");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /노트 내보내기|Export notes/ }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/reference-notes-.*\.md$/);
  await page.locator(".ref-note-list").getByRole("button").click();
  await page.getByRole("dialog").getByRole("button", { name: /노트 삭제|Delete note/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /메모와 함께 삭제 확인|Confirm deletion of note/ }).click();
  await expect(page.locator(".ref-note-list")).toHaveCount(0);
});
test("missing approved key is an explicit failure, not a fake empty result", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/kmas/references?*", (route) => route.fulfill({ status: 503, json: { code: "KMAS_NOT_CONFIGURED" } }));
  await page.goto("/references?q=검증용&field=title&page=1");
  await expect(page.locator(".ref-error")).toContainText(/인증키|approved/);
  await expect(page.locator(".ref-card")).toHaveCount(0);
  await expect(page.locator(".ref-error a")).toHaveAttribute("href", "https://www.kmas.or.kr/guide/openapi");
});
test("malformed saved notes remain untouched and the page remains usable", async ({ page }) => {
  await prepare(page);
  await page.addInitScript((key) => localStorage.setItem(key, "corrupt-document"), storageKey);
  await page.goto("/references");
  await expect(page.locator(".ref-library > [role=alert]")).toBeVisible();
  await submit(page);
  await page.locator(".ref-card-index button").click();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("corrupt-document");
});
for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  test(`responsive reference view ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport); await prepare(page); await page.goto("/references");
    await expect(page.locator(".ref-search-form")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`references-${viewport.width}-initial.png`), fullPage: true });
    await submit(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`references-${viewport.width}-fixture.png`), fullPage: true });
    await page.locator(".ref-card-main").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape"); await expect(page.locator(".ref-card-main")).toBeFocused();
  });
}

test("an unsaved draft requires confirmation before closing", async ({ page }) => {
  await prepare(page); await page.goto("/references"); await submit(page);
  await page.locator(".ref-card-main").click();
  await page.locator("#ref-personal-note").fill("저장 전 초안");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#ref-personal-note")).toHaveValue("저장 전 초안");
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("two tabs preserve the winning edit and keep the conflicting draft", async ({ page, context }) => {
  await prepare(page); await page.goto("/references"); await submit(page);
  await page.locator(".ref-card-main").click();
  await page.locator("#ref-personal-note").fill("최초 메모");
  await page.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').notes?.[0]?.note, storageKey)).toBe("최초 메모");
  const second = await context.newPage();
  await prepare(second); await second.goto("/references?view=notes");
  await second.locator(".ref-note-list").getByRole("button").click();
  await second.locator("#ref-personal-note").fill("두 번째 탭 초안");
  await page.locator("#ref-personal-note").fill("첫 번째 탭 저장본");
  await page.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(second.locator(".ref-note-editor [role=alert]")).toBeVisible();
  await second.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(second.locator("#ref-personal-note")).toHaveValue("두 번째 탭 초안");
  await expect(second.locator("[data-reference-status]")).toContainText(/다른 탭|Another tab/);
  expect(await second.evaluate((key) => JSON.parse(localStorage.getItem(key)!).notes[0].note, storageKey)).toBe("첫 번째 탭 저장본");
});

test("backup restore adds new items without overwriting existing notes", async ({ page }) => {
  await prepare(page);
  await page.addInitScript(({ key, item }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, notes: [{ item: { ...item, outline: "" }, note: "기존 메모 유지", savedAt: "2026-09-06T00:00:00Z" }] }));
  }, { key: storageKey, item: fixture });
  await page.goto("/references?view=notes");
  const incoming = [
    { item: fixture, note: "덮어쓰면 안 되는 백업", savedAt: "2026-09-06T00:00:00Z" },
    { item: { ...fixture, id: 'kmas:["id","fixture-import"]', title: "복원된 검증 자료" }, note: "새 메모", savedAt: "2026-09-06T00:00:00Z" },
  ];
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "toonstudio-kmas-references", version: 1, notes: incoming })) });
  await expect(page.locator(".ref-import-preview")).toBeVisible();
  await expect(page.locator(".ref-notebook > .ref-note-list article")).toHaveCount(1);
  await page.locator(".ref-import-preview").getByRole("button", { name: /새 자료만 추가 확인|Confirm adding new references/ }).click();
  await expect(page.locator(".ref-notebook > .ref-note-list article")).toHaveCount(2);
  const notes = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).notes, storageKey);
  expect(notes.find((note: { item: { id: string } }) => note.item.id === fixture.id).note).toBe("기존 메모 유지");
  expect(notes.every((note: { item: { outline: string } }) => note.item.outline === "")).toBe(true);
});

test("quota failure does not mark an unsaved draft as saved", async ({ page }) => {
  await prepare(page); await page.goto("/references"); await submit(page);
  await page.locator(".ref-card-main").click();
  await page.locator("#ref-personal-note").fill("저장 실패 시 남아야 하는 초안");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key === "toonstudio:kmas-reference-notes:v1") throw new DOMException("test quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(page.locator("[data-reference-status]")).toContainText(/저장하지 못|write failed/);
  await expect(page.locator("#ref-personal-note")).toHaveValue("저장 실패 시 남아야 하는 초안");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});


test("closing an unsaved note preserves a recoverable tab draft after reload", async ({ page }) => {
  await prepare(page); await page.goto("/references"); await submit(page);
  await page.locator(".ref-card-main").click();
  await page.locator("#ref-personal-note").fill("새로고침 후에도 복구할 임시 메모");
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await page.locator(".ref-tabs").getByRole("button", { name: /내 연구노트|My notebook/ }).click();
  await expect(page.locator(".ref-draft-shelf article")).toHaveCount(1);
  await page.reload();
  await page.locator(".ref-draft-shelf").getByRole("button").click();
  await expect(page.locator("#ref-personal-note")).toHaveValue("새로고침 후에도 복구할 임시 메모");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await page.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(page.locator("[data-reference-status]")).toContainText(/저장|Saved|saved/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ref-draft-shelf")).toHaveCount(0);
  await expect(page.locator(".ref-notebook > .ref-note-list article")).toHaveCount(1);
});

test("backup preview can be cancelled without a storage write", async ({ page }) => {
  await prepare(page); await page.goto("/references?view=notes");
  const notes = [{ item: fixture, note: "미리보기만 할 메모", savedAt: "2026-09-06T00:00:00Z" }];
  await page.locator('input[type="file"]').setInputFiles({ name: "preview.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "toonstudio-kmas-references", version: 1, notes })) });
  await expect(page.locator(".ref-import-preview")).toBeVisible();
  await expect(page.locator(".ref-import-preview")).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await page.locator(".ref-import-preview").getByRole("button", { name: /^취소$|^Cancel$/ }).click();
  await expect(page.locator(".ref-import-preview")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("a recovered stale draft cannot replace a note saved by another tab", async ({ page, context }) => {
  await prepare(page); await page.goto("/references"); await submit(page);
  await page.locator(".ref-card-main").click();
  await page.locator("#ref-personal-note").fill("첫 저장본");
  await page.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(page.locator("[data-reference-status]")).toContainText(/저장|Saved|saved/);
  await page.locator("#ref-personal-note").fill("복구할 오래된 기준의 초안");
  page.once("dialog", (dialog) => dialog.accept()); await page.keyboard.press("Escape");
  const second = await context.newPage(); await prepare(second); await second.goto("/references?view=notes");
  await second.locator(".ref-notebook > .ref-note-list").getByRole("button").click();
  await second.locator("#ref-personal-note").fill("다른 탭 최신 저장본");
  await second.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(second.locator("[data-reference-status]")).toContainText(/저장|Saved|saved/);
  await page.goto("/references?view=notes");
  await page.locator(".ref-draft-shelf").getByRole("button").click();
  await expect(page.locator("#ref-personal-note")).toHaveValue("복구할 오래된 기준의 초안");
  await page.getByRole("dialog").getByRole("button", { name: /메모 저장|Save note/ }).click();
  await expect(page.locator("[data-reference-status]")).toContainText(/다른 탭|Another tab/);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).notes[0].note, storageKey)).toBe("다른 탭 최신 저장본");
});
