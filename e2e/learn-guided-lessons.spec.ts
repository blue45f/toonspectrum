import { expect, test } from "@playwright/test";

import { LESSONS } from "../apps/web/src/domains/learn/learning-content";
import { LEARNING_PATHS, getPathLessons } from "../apps/web/src/domains/learn/learning-paths";
import { STORAGE_KEY } from "../apps/web/src/domains/learn/learning-model";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("toonspectrum-compat-dismissed", "true"));
});

test("lesson detail exposes an outcome, jump navigation, progress requirements and adjacent lessons", async ({ page }) => {
  const lesson = LESSONS[1];
  await page.goto(`/learn/lessons/${lesson.id}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
  await expect(page.getByRole("heading", { name: "이 수업을 마치면", exact: true })).toBeVisible();
  await expect(page.getByText(lesson.task, { exact: true })).toBeVisible();

  const outline = page.getByRole("navigation", { name: "이 강좌 목차" });
  await expect(outline).toBeVisible();
  await expect(outline.getByRole("link")).toHaveCount(lesson.sections.length + 4);
  await expect(outline.getByRole("link", { name: /예제 조절하기/u })).toHaveAttribute("href", `#${lesson.id}-lab`);
  await expect(outline.getByRole("link", { name: /직접 실습하기/u })).toHaveAttribute("href", `#${lesson.id}-practice`);
  await expect(outline.getByRole("link", { name: /확인 퀴즈/u })).toHaveAttribute("href", `#${lesson.id}-quiz`);

  await expect(page.locator(".learn-requirement-list li")).toHaveCount(3);
  await expect(page.getByRole("progressbar", { name: "강좌 완료 요구사항 진행률" })).toHaveAttribute("value", "0");
  await expect(page.getByRole("navigation", { name: "이전·다음 강좌" }).getByRole("link")).toHaveCount(2);
});

test("lesson requirements update immediately and completion remains explicitly gated", async ({ page }) => {
  const lesson = LESSONS[0];
  await page.goto(`/learn/lessons/${lesson.id}`);

  const finish = page.getByRole("button", { name: "이 강좌 학습 완료", exact: true });
  const requirementProgress = page.getByRole("progressbar", { name: "강좌 완료 요구사항 진행률" });
  const requirements = page.locator(".learn-requirement-list li");

  await expect(finish).toBeDisabled();
  await expect(requirementProgress).toHaveAttribute("value", "0");
  await expect(requirements.nth(0)).toHaveAttribute("data-done", "false");
  await expect(requirements.nth(1)).toHaveAttribute("data-done", "false");
  await expect(requirements.nth(2)).toHaveAttribute("data-done", "false");

  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("radio").nth(lesson.quiz.answer).check();

  await expect(requirementProgress).toHaveAttribute("value", "100");
  await expect(requirements.nth(0)).toHaveAttribute("data-done", "true");
  await expect(requirements.nth(1)).toHaveAttribute("data-done", "true");
  await expect(requirements.nth(2)).toHaveAttribute("data-done", "false");
  await expect(finish).toBeEnabled();

  await finish.click();
  await expect(page.getByRole("button", { name: "학습 완료됨", exact: true })).toBeDisabled();
  await expect(requirements.nth(2)).toHaveAttribute("data-done", "true");
  await expect(page.getByRole("heading", { name: "수업을 완료했습니다", exact: true })).toBeVisible();
});

test("the learning hub resumes a later active lesson before untouched earlier steps", async ({ page }) => {
  const path = LEARNING_PATHS[0];
  const lessons = getPathLessons(path);
  const active = lessons[1];

  await page.addInitScript(({ key, lessonId }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      lessons: {
        [lessonId]: {
          checks: [0],
          answer: null,
          notes: "여기서 멈춘 수업",
          completed: false,
        },
      },
      bookmarks: [],
    }));
  }, { key: STORAGE_KEY, lessonId: active.id });

  await page.goto("/learn");
  await expect(page.locator(".learn-dashboard-next").getByRole("link")).toHaveText(`${active.title} →`);
  await expect(page.locator(".learn-session-list li").first().getByRole("heading", { level: 3 })).toHaveText(active.title);
  await expect(page.locator(".learn-session-list li").first()).toContainText("학습 중");
});

test("guided lesson layout keeps its landmarks and document width on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/learn/lessons/${LESSONS[0].id}`);

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "이 강좌 목차" })).toBeVisible();
  await expect(page.locator(".learn-guided-lesson-sidebar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
