import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const BOARD_KEY = "toonstudio.open-creation.board.v1:artic:1";
const aicPayload = { data: [
  { id: 1, title: "공개 갑옷", artist_display: "Museum artist", credit_line: "Museum credit", is_public_domain: true },
  { id: 2, title: "비공개 갑옷", is_public_domain: false },
] };
const wikiPayload = { query: { search: [{ pageid: 10, title: "한복", timestamp: "2026-09-13T08:00:00.000Z", snippet: "본문은 재배포하지 않음" }] } };

test("resource entry preserves both creation and material atlas, including mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/insights/resources");
  await expect(page.getByRole("link", { name: "무료 배경·소품 소재 도감 열기" })).toBeVisible();
  await page.getByRole("link", { name: "무료 창작 재료실 열기" }).click();
  await expect(page.getByRole("heading", { name: "무료 창작 재료실", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("search, provenance, six briefs, backups and reload cache work without sending private notes", async ({ page }) => {
  const requests: string[] = [];
  await page.route("https://api.artic.edu/**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ json: aicPayload });
  });
  await page.goto("/research/open-creation");
  await expect(page.getByRole("heading", { name: "무료 창작 재료실", exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByLabel("작가 메모 (외부 전송 안 함)").fill("PRIVATE MANUSCRIPT 1369");
  await page.getByLabel("찾을 소재").fill("갑옷");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "공개 갑옷", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "비공개 갑옷", exact: true })).toHaveCount(0);
  expect(new URL(requests[0]).searchParams.get("q")).toBe("armor");
  expect(requests.join(" ")).not.toContain("PRIVATE MANUSCRIPT 1369");
  await page.getByRole("button", { name: "재료 보드에 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "재료 보드 1/60", exact: true })).toBeVisible();
  await page.getByLabel("작품·콘텐츠 주제").fill("갑옷의 비밀");
  for (const title of ["4컷 만화 콘티", "캐릭터 설정집", "세계관·배경 시트", "숏폼 홍보 구성안", "드로잉 연습 과제", "자료 큐레이션 초안"]) {
    await page.getByRole("button", { name: title }).click();
    await page.getByRole("button", { name: "무료 제작 브리프 만들기", exact: true }).click();
    const output = page.getByLabel("제작 브리프 (직접 수정 가능)");
    await expect(output).toHaveValue(new RegExp(title, "u"));
    const text = await output.inputValue();
    expect(text).toContain("https://www.artic.edu/artworks/1");
    expect(text).toContain("Museum credit");
    expect(text).toContain("PRIVATE MANUSCRIPT 1369");
  }
  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "출처 포함 Markdown 내보내기", exact: true }).click();
  const markdown = await markdownDownload;
  expect(markdown.suggestedFilename()).toBe("toonstudio-creation-kit.md");
  expect(await readFile((await markdown.path())!, "utf8")).toContain("출처·권리 기록");
  const boardDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "보드 JSON 백업", exact: true }).click();
  const board = await boardDownload;
  const backup = JSON.parse(await readFile((await board.path())!, "utf8"));
  expect(backup.items).toHaveLength(1);
  expect(backup.items[0].rights).toBe("CC0");
  await page.reload();
  await expect(page.getByRole("button", { name: "재료 보드 1/60", exact: true })).toBeVisible();
  await page.getByLabel("찾을 소재").fill("갑옷");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  await expect(page.getByText(/저장된 검색 결과 1개/u)).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("Cleveland requires CC0 and Wikipedia never presents article text or images", async ({ page }) => {
  await page.route("https://openaccess-api.clevelandart.org/**", (route) => route.fulfill({ json: { data: [
    { id: 3, title: "공개 도자기", share_license_status: "CC0", url: "https://www.clevelandart.org/art/3" },
    { id: 4, title: "제한 도자기", share_license_status: "Copyrighted", url: "https://www.clevelandart.org/art/4" },
  ] } }));
  await page.route("https://ko.wikipedia.org/**", (route) => route.fulfill({ json: wikiPayload }));
  await page.goto("/research/open-creation");
  await page.getByLabel("무료 제공처").selectOption("cleveland");
  await page.getByLabel("찾을 소재").fill("도자기");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "공개 도자기", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "제한 도자기", exact: true })).toHaveCount(0);
  await page.getByLabel("무료 제공처").selectOption("wikipedia");
  await page.getByLabel("찾을 소재").fill("한복");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  const article = page.locator("article").filter({ has: page.getByRole("heading", { name: "한복", exact: true }) });
  await expect(article).toBeVisible();
  await expect(article.locator("img")).toHaveCount(0);
  await expect(article).toContainText("원문 확인");
  await expect(page.getByText("본문은 재배포하지 않음", { exact: true })).toHaveCount(0);
});

test("rate limits stop repeat requests without disabling local briefs", async ({ page }) => {
  let requests = 0;
  await page.route("https://api.artic.edu/**", async (route) => {
    requests += 1;
    await route.fulfill({ status: 429, headers: { "Retry-After": "120" }, json: { error: "limited" } });
  });
  await page.goto("/research/open-creation");
  await page.getByLabel("찾을 소재").fill("갑옷");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("호출 한도에 도달");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("초 후 다시 검색");
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "무료 제작 브리프 만들기", exact: true }).click();
  await expect(page.getByLabel("제작 브리프 (직접 수정 가능)")).toBeVisible();
});

test("corrupt local data remains intact and is not overwritten by a new save", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "{broken"), BOARD_KEY);
  await page.route("https://api.artic.edu/**", (route) => route.fulfill({ json: aicPayload }));
  await page.goto("/research/open-creation");
  await expect(page.getByRole("alert")).toContainText("기존 자료를 덮어쓰지 않습니다");
  await page.getByLabel("찾을 소재").fill("갑옷");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  await expect(page.getByRole("button", { name: "재료 보드에 저장", exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), BOARD_KEY)).toBe("{broken");
});


test("AIC thumbnails use anonymous CORS under the app's cross-origin isolation policy", async ({ page }) => {
  let imageMode: string | undefined;
  await page.route("https://api.artic.edu/**", route => route.fulfill({ json: {
    config: { iiif_url: "https://www.artic.edu/iiif/2" },
    data: [{ ...aicPayload.data[0], image_id: "cors-fixture" }],
  } }));
  await page.route("https://www.artic.edu/iiif/**", async route => {
    imageMode = route.request().headers()["sec-fetch-mode"];
    await route.fulfill({ contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" },
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
  });
  await page.goto("/research/open-creation");
  await page.getByLabel("찾을 소재").fill("갑옷");
  await page.getByRole("button", { name: "무료 자료 검색", exact: true }).click();
  const image = page.getByRole("img", { name: "공개 갑옷", exact: true });
  await expect(image).toHaveAttribute("crossorigin", "anonymous");
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(imageMode).toBe("cors");
});
