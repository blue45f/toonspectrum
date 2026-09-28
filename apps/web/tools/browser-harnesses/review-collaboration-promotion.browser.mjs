import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// 합성 예시에서 실제 포인터·키보드·표지 변환만 검증한다. 운영 API를 호출하지 않는다.
const base = process.env.WORKFLOW_QA_URL ?? "http://127.0.0.1:5196";
const output = process.env.WORKFLOW_QA_OUTPUT ?? "/tmp/toonstudio-workflow-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const passed = [];
const errors = [];
const fixture = `${base}/tools/browser-harnesses/review-collaboration-promotion.html`;
const check = (condition, name) => { assert.ok(condition, name); passed.push(name); console.log(name); };
async function open(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  await page.getByTestId("production-card-interaction-ready").waitFor();
  return page;
}
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await open(desktop);
  const handle = page.getByRole("button", { name: "콘티 조작 검증 드래그 핸들" });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  check((await page.getByTestId("production-move-preview").innerText()).includes("이동 가능"), "데스크톱 키보드 이동 사전 검증");
  await page.screenshot({ path: path.join(output, "desktop-keyboard-preview.png") });
  await page.keyboard.press("Enter");
  await page.locator('[data-production-drop-column="working"] [data-production-task="interaction-ready"]').waitFor();
  passed.push("키보드 이동 저장 후 작업 열 변경");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "콘티 조작 검증 드래그 핸들");
  passed.push("키보드 이동 후 카드 핸들 초점 복원");
  await page.getByRole("button", { name: "예시 초기화" }).click();
  await handle.focus(); await page.keyboard.press("Space"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Escape");
  check(await page.getByTestId("production-move-preview").count() === 0, "Escape 이동 취소");
  await handle.dragTo(page.locator('[data-production-drop-column="working"]'));
  await page.locator('[data-production-drop-column="working"] [data-production-task="interaction-ready"]').waitFor();
  passed.push("마우스 드래그앤드롭 저장");
  await page.getByText("보드 열 맞춤 설정", { exact: true }).click();
  await page.getByRole("button", { name: "검수 열 앞으로" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-production-drop-column]")[1]?.getAttribute("data-production-drop-column") === "review");
  check(await page.locator("[data-production-drop-column]").nth(1).getAttribute("data-production-drop-column") === "review", "열 재배치");
  await page.getByRole("checkbox", { name: "검수", exact: true }).click();
  await page.getByRole("region", { name: "검수 열", exact: true }).getByRole("button", { name: "열 펼치기" }).waitFor();
  check(await page.getByRole("region", { name: "검수 열", exact: true }).getByRole("button", { name: "열 펼치기" }).isVisible(), "열 접기와 복원 조작");
  await desktop.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await open(mobile);
  const phoneHandle = phone.getByRole("button", { name: "콘티 조작 검증 드래그 핸들" });
  await phoneHandle.scrollIntoViewIfNeeded();
  const box = await phoneHandle.boundingBox();
  assert.ok(box);
  const cdp = await mobile.newCDPSession(phone);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let index = 1; index <= 12; index += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (350 - x) * index / 12, y, id: 1 }] });
    await phone.waitForTimeout(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await phone.locator('[data-production-drop-column="working"] [data-production-task="interaction-ready"]').waitFor();
  passed.push("390px 모바일 실제 터치 드래그 저장");
  check(await phone.locator('[data-production-drop-column="working"]').evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1; }), "터치 이동 후 목적지 열 전체가 화면에 보임");
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "모바일 보드 문서 가로 넘침 없음");
  await phone.screenshot({ path: path.join(output, "mobile-board.png") });
  await phone.getByRole("button", { name: "검수", exact: true }).click();
  await phone.getByRole("textbox", { name: "검수 질문" }).fill("첫 컷에서 확인할 연출");
  await phone.getByRole("button", { name: "cut-12-002 컷으로 이동" }).click();
  check(await phone.getByRole("textbox", { name: "검수 질문" }).inputValue() === "", "다른 컷으로 질문 초안이 섞이지 않음");
  await phone.getByRole("button", { name: "cut-12-001 컷으로 이동" }).click();
  check(await phone.getByRole("textbox", { name: "검수 질문" }).inputValue() === "첫 컷에서 확인할 연출", "모바일 컷별 초안 복원");
  await phone.getByRole("button", { name: "차단 질문 컷", exact: true }).click();
  check(await phone.getByRole("button", { name: /컷으로 이동/ }).count() === 1, "모바일 차단 이슈 우선 탐색");
  await phone.screenshot({ path: path.join(output, "mobile-review.png") });
  await phone.getByRole("button", { name: "홍보", exact: true }).click();
  const png = await phone.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 20;
    const context = canvas.getContext("2d"); context.fillRect(0, 0, 16, 20);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await phone.getByLabel("표지 이미지 선택").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await phone.getByRole("img", { name: "표지 미리 보기", exact: true }).waitFor();
  check((await phone.getByRole("img", { name: "표지 미리 보기", exact: true }).getAttribute("src")).startsWith("data:image/jpeg;base64,"), "실제 PNG를 브라우저에서 JPEG 표지로 변환");
  await phone.getByRole("checkbox", { name: "예시 게시 권한 확인" }).check();
  check(await phone.getByRole("progressbar").getAttribute("value") === "4", "홍보 게시 전 4개 검사 완료");
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "모바일 홍보 미리 보기 가로 넘침 없음");
  await phone.screenshot({ path: path.join(output, "mobile-promotion.png"), fullPage: true });
  await phone.getByRole("button", { name: "표지 제거", exact: true }).click();
  check(await phone.getByRole("img", { name: "표지 미리 보기", exact: true }).count() === 0, "표지 제거 후 미리 보기 갱신");
  check(errors.length === 0, `브라우저 런타임 오류 없음: ${errors.join("; ")}`);
  await mobile.close();
} finally {
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, pageErrors: errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ passed, pageErrors: errors, output }, null, 2));
