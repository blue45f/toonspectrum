import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const origin = process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:4472";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Local fixture only");
const output = "artifacts/blueprint-mcp-workflow";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }), results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", reducedMotion: "reduce" });
    const writes = [], errors = [];
    await context.route("**/api/**", (route) => { if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) writes.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 403, json: { error: "fixture network disabled" } }); });
    await context.addInitScript(() => localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 })));
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(20000);
    try {
      await page.goto(`${origin}/tools/browser-harnesses/blueprint-mcp-workflow.html`);
      await page.getByRole("heading", { name: "제작·개인 검수 초안 실동작 확인" }).waitFor();
      const article = page.getByRole("heading", { name: "선화 테스트", exact: true }).locator("xpath=ancestor::article[1]");
      await article.getByText("단계·담당·의존성 편집", { exact: true }).click();
      const title = article.getByLabel("작업 제목", { exact: true }); await title.fill("저장하지 않은 선화 입력");
      await page.getByRole("button", { name: "일정 보기", exact: true }).click();
      await page.getByLabel("표시할 달", { exact: true }).fill("2026-09");
      await page.getByRole("region", { name: "제작 일정", exact: true }).getByRole("button", { name: /선화 테스트/u }).click();
      await expect(title).toHaveValue("저장하지 않은 선화 입력");
      await page.getByRole("button", { name: "동시 변경 재현", exact: true }).click();
      await expect(article.getByRole("alert")).toContainText("다른 곳에서");
      await expect(article.getByRole("button", { name: "작업 정보 저장", exact: true })).toBeDisabled();
      await article.getByRole("button", { name: "입력 대신 최신 작업 불러오기", exact: true }).click();
      await expect(title).toHaveValue("선화 테스트"); await expect(article.getByLabel("담당자 표시", { exact: true })).toHaveValue("원격 변경 담당자");
      await page.getByRole("combobox", { name: "제작 단계", exact: true }).first().selectOption("lineart");
      await page.getByRole("combobox", { name: "작업 정렬", exact: true }).selectOption("due");
      await page.getByText("내 보기 저장·불러오기", { exact: true }).click();
      await page.getByLabel("보기 이름", { exact: true }).fill("내 선화 일정");
      await page.getByRole("button", { name: "현재 조건 저장", exact: true }).click();
      await page.getByRole("button", { name: "내 선화 일정", exact: true }).waitFor({ timeout: 60000 });
      await page.getByLabel("테스트 의견", { exact: true }).fill("페이지 위치와 함께 보존할 개인 의견");
      await page.getByText("개인 초안·묶음 발행", { exact: true }).click();
      await page.getByRole("button", { name: "초안에 담고 입력 비우기", exact: true }).click();
      await expect(page.locator("[data-local-draft-confirmation]")).toHaveAttribute("data-local-draft-confirmation", "1", { timeout: 60000 });
      await expect(page.getByLabel("테스트 의견", { exact: true })).toHaveValue("");
      await page.reload();
      await page.getByText("내 보기 저장·불러오기", { exact: true }).click();
      await page.getByRole("button", { name: "저장된 보기 불러오기", exact: true }).click();
      await page.getByRole("button", { name: "내 선화 일정", exact: true }).click({ timeout: 60000 });
      await expect(page.getByRole("combobox", { name: "작업 정렬", exact: true })).toHaveValue("due");
      await expect(page.getByRole("combobox", { name: "제작 단계", exact: true }).first()).toHaveValue("lineart");
      await page.getByText("개인 초안·묶음 발행", { exact: true }).click();
      await page.getByRole("button", { name: "개인 초안 불러오기", exact: true }).click();
      await page.getByRole("checkbox", { name: "페이지 위치와 함께 보존할 개인 의견", exact: true }).waitFor({ timeout: 60000 });
      await expect(page.getByRole("button", { name: "선택한 초안 발행·결과 확인", exact: true })).toBeDisabled();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal page overflow");
      assert.deepEqual(writes, [], "No publication or team writes during local draft/view storage");
      assert.deepEqual(errors, [], "No browser runtime errors");
      await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
      results.push({ width, status: "passed", evidence: "Real SQLite/OPFS reload, actual components, synthetic task/auth fixture, API blocked" });
      console.log(`PASS blueprint workflow ${width}`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${width}-failure.png`, fullPage: true }).catch(() => undefined);
      results.push({ width, status: "failed", error: String(error), errors, writes }); throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ origin, results }, null, 2)); }
