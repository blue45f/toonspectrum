import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openBoard(page: Page) {
  await page.goto("/production/projects/sample-project/production", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("production-work-board")).toBeVisible({ timeout: 90_000 });
}

test("작업 작성·블록 편집·상태 이동과 입력 조건 차단", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("production-work-board");
  await board.getByRole("button", { name: "작업 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "새 제작 작업" });
  await dialog.getByRole("textbox", { name: "작업 제목", exact: true }).fill("브라우저 검증용 콘티 작업");
  await dialog.getByRole("button", { name: "제목 추가", exact: true }).click();
  await dialog.getByRole("textbox", { name: "1번 제목", exact: true }).fill("연출 의도");
  await dialog.getByRole("button", { name: "체크 항목 추가", exact: true }).click();
  await dialog.getByRole("textbox", { name: "2번 체크 항목", exact: true }).fill("원고 비율 확인");
  await dialog.getByRole("button", { name: "2번 블록 위로", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "1번 체크 항목", exact: true })).toHaveValue(
    "원고 비율 확인",
  );
  await dialog.getByRole("button", { name: "작업 만들기", exact: true }).click();
  await expect(dialog).toBeHidden();
  await board.getByRole("textbox", { name: "작업 검색", exact: true }).fill("브라우저 검증용");
  await expect(board.getByRole("button", { name: "브라우저 검증용 콘티 작업", exact: true })).toBeVisible();
  await board
    .getByRole("combobox", { name: "브라우저 검증용 콘티 작업 상태 이동", exact: true })
    .selectOption("ready");
  await expect(board.getByRole("status")).toContainText("준비 완료");
  await board
    .getByRole("combobox", { name: "브라우저 검증용 콘티 작업 상태 이동", exact: true })
    .selectOption("in-progress");
  await expect(board.getByRole("alert")).toContainText("입력 버전");
  await expect(
    board
      .getByRole("region", { name: "준비 열", exact: true })
      .getByRole("button", { name: "브라우저 검증용 콘티 작업", exact: true }),
  ).toBeVisible();
  await board.getByRole("button", { name: "브라우저 검증용 콘티 작업", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "브라우저 검증용 콘티 작업", exact: true });
  await expect(edit.getByRole("textbox", { name: "1번 체크 항목", exact: true })).toHaveValue(
    "원고 비율 확인",
  );
  await edit.getByRole("textbox", { name: "작업 제목", exact: true }).fill("아직 저장하지 않은 제목");
  await edit.getByRole("button", { name: "대화상자 닫기", exact: true }).click();
  await expect(edit.getByRole("button", { name: "편집 계속", exact: true })).toBeVisible();
  await edit.getByRole("button", { name: "저장하지 않고 닫기", exact: true }).click();
  await expect(edit).toBeHidden();
});

test("팀 프로세스 드래그 배치·저장과 회차 생성 미리보기", async ({ page }) => {
  await openBoard(page);
  await page.getByRole("button", { name: "공정 설정", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "우리 팀의 제작 프로세스", exact: true });
  await dialog.getByRole("button", { name: /스튜디오 제작.*8단계/u }).click();
  await dialog.getByRole("textbox", { name: "프로세스 이름", exact: true }).fill("우리 스튜디오 제작 흐름");
  await dialog
    .getByRole("button", { name: "선화 드래그 핸들", exact: true })
    .dragTo(dialog.getByRole("button", { name: "배경 드래그 핸들", exact: true }));
  await dialog.getByRole("button", { name: "프로세스 저장", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "우리 스튜디오 제작 흐름", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "회차 공정 만들기", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "회차 공정 작업 만들기", exact: true });
  await expect(preview.getByText(/추가 예정/u)).toBeVisible();
  await expect(preview.getByText(/초안으로 생성|이미 필요한 공정/u)).toBeVisible();
  await preview.getByRole("button", { name: "대화상자 닫기", exact: true }).click();
});

for (const theme of ["light", "dark", "contrast"]) {
  test(`${theme} 테마의 반응형·접근성 검증`, async ({ page }, testInfo) => {
    await openBoard(page);
    await page.evaluate((value) => document.documentElement.setAttribute("data-design-theme", value), theme);
    const board = page.getByTestId("production-work-board");
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
      await board.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`) });
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(geometry.scroll, `문서 전체의 가로 넘침 ${theme}/${width}`).toBeLessThanOrEqual(
        geometry.width + 1,
      );
      const small = await board
        .locator("button:visible, select:visible, input:not([type=checkbox]):visible")
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.getBoundingClientRect().height < 43)
            .map((element) => element.getAttribute("aria-label") ?? element.textContent?.slice(0, 40)),
        );
      expect(small, `터치 영역 ${theme}/${width}`).toEqual([]);
    }
    const results = await new AxeBuilder({ page })
      .include('[data-testid="production-work-board"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
}

test("320px 편집 대화상자의 가로 넘침·접근성·키보드 닫기", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBoard(page);
  await page.getByRole("button", { name: "공정 설정", exact: true }).click();
  const designer = page.getByRole("dialog", { name: "우리 팀의 제작 프로세스", exact: true });
  await expect(designer).toBeVisible();
  const geometry = await designer.evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  const small = await designer
    .locator("button:visible")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().height < 43)
        .map((element) => element.textContent),
    );
  expect(small).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("workflow-dialog-320.png") });
  const result = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations.map((entry) => entry.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(designer).toBeHidden();
  await expect(page.getByRole("button", { name: "공정 설정", exact: true })).toBeFocused();
});

test("모바일 일괄 편집은 미리 보기 후 지정한 필드만 원자적으로 저장한다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  const board = page.getByTestId("production-work-board");
  const taskTitle = "13화 대본 2차 초안";
  await board.getByRole("checkbox", { name: `${taskTitle} 선택`, exact: true }).check();
  await board.getByRole("button", { name: "선택 작업 일괄 편집", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "선택 작업 일괄 편집", exact: true });
  await dialog.getByRole("combobox", { name: "우선순위", exact: true }).selectOption("urgent");
  await dialog.getByRole("combobox", { name: "마감 변경", exact: true }).selectOption("set");
  await dialog.getByLabel("새 마감 · 내 시간대", { exact: true }).fill("2026-10-15T18:00");
  await dialog.getByRole("button", { name: "변경 미리 보기", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "일괄 변경 미리 보기", exact: true })).toContainText(taskTitle);
  const geometry = await dialog.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  const result = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map((entry) => entry.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("bulk-edit-preview-390.png") });
  await dialog.getByRole("button", { name: "1개 작업 변경", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(board.getByRole("status")).toContainText("1개 작업");
  const card = board.locator('article[data-testid^="production-card-"]').filter({ has: page.getByRole("button", { name: taskTitle, exact: true }) });
  await expect(card).toContainText("긴급");
  await expect(card).toContainText("작업 중");
});
