import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";

import { chromium, type BrowserContext } from "playwright";

import { createProductionDemoProject } from "../apps/web/src/domains/creator/production-hub/production-demo";

const origin = process.env.COLLAB_QA_LOCAL_URL ?? "http://127.0.0.1:5198";
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("합성 HTTP 응답 검증은 로컬 서버에서만 실행합니다.");
const output = "/tmp/toonstudio-collaboration-session-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const passed: string[] = [], errors: string[] = [];
const access = { view: true, edit: true, comment: true, manage: true, owner: true, role: "owner" };
let revision = 1, rejectSave = true, denyRead = false, saveCalls = 0;
async function intercept(context: BrowserContext) {
  await context.route("**/api/production/projects/**", async (route) => {
    const request = route.request(), id = new URL(request.url()).pathname.split("/")[4];
    if (request.method() === "POST") {
      saveCalls += 1;
      if (rejectSave) return route.fulfill({ status: 503, json: { error: "검증용 저장 실패: 입력 유지" } });
      revision += 1;
      return route.fulfill({ status: 200, json: { aggregate: { ...createProductionDemoProject(), projectId: id, revision } } });
    }
    if (denyRead) return route.fulfill({ status: 403, json: { error: "검증용 권한 회수" } });
    return route.fulfill({ status: 200, json: { aggregate: { ...createProductionDemoProject(), projectId: id, revision }, access } });
  });
}
const fixture = `${origin}/tools/browser-harnesses/collaboration-session-safety.html`;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(20_000); context.setDefaultNavigationTimeout(45_000);
  await intercept(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "검수 질문" }).waitFor();
  await page.getByRole("textbox", { name: "검수 질문" }).fill("실패해도 남아야 하는 검수 질문");
  await page.getByRole("button", { name: "질문 추가", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(saveCalls, 1, "실제로 저장 요청이 실패했는지 확인");
  assert.equal(await page.getByRole("textbox", { name: "검수 질문" }).inputValue(), "실패해도 남아야 하는 검수 질문");
  passed.push("실제 HTTP 클라이언트 저장 실패를 검수 입력까지 전달하고 초안 보존");
  await page.screenshot({ path: `${output}/review-save-failure.png` });
  rejectSave = false;
  const second = await context.newPage();
  second.on("pageerror", (error) => errors.push(error.message));
  await second.goto(fixture, { waitUntil: "domcontentloaded" });
  await second.getByRole("textbox", { name: "검수 질문" }).waitFor();
  await page.getByRole("button", { name: "질문 추가", exact: true }).click();
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('[aria-label="검수 질문"]')?.value === "");
  passed.push("저장 성공 때만 검수 질문 초안 제거");
  await second.waitForFunction(() => document.querySelector('[data-testid="session-state"]')?.textContent?.includes("r2"));
  passed.push("동일 origin 실제 BroadcastChannel로 다른 탭 최신 버전 재조회");
  await second.getByRole("button", { name: "다른 프로젝트", exact: true }).click();
  await second.waitForFunction(() => document.querySelector('[data-testid="session-state"]')?.textContent?.includes("qa-project-b"));
  passed.push("프로젝트 전환 후 새 범위로 재조회");
  await page.getByRole("button", { name: "계정 로그아웃", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="session-state"]')?.textContent === "프로젝트 데이터 없음");
  assert.equal(await page.getByRole("textbox", { name: "검수 질문" }).count(), 0);
  passed.push("계정 범위 해제 즉시 비공개 작업실과 입력 제거");
  denyRead = true;
  await second.getByRole("button", { name: "최신 상태 확인", exact: true }).click();
  await second.getByRole("alert").waitFor();
  assert.equal(await second.getByRole("textbox", { name: "검수 질문" }).count(), 0);
  passed.push("403 권한 회수 응답 후 작업 캐시와 편집 UI 제거");
  await second.setViewportSize({ width: 390, height: 844 });
  assert.ok(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  passed.push("모바일 접근 오류 화면 가로 넘침 없음");
  await second.screenshot({ path: `${output}/mobile-permission-revoked.png`, fullPage: true });
  assert.deepEqual(errors, []);
  passed.push("브라우저 미처리 런타임 오류 없음");
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ scope: "local-http-fixtures", passed, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks: passed.length, passed, errors, output }, null, 2));
