import { expect, test } from "@playwright/test";

import { LESSONS } from "../apps/web/src/domains/learn/learning-content";
import { STORAGE_KEY } from "../apps/web/src/domains/learn/learning-model";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("toonspectrum-compat-dismissed", "true"));
});

test("learning home presents a next action, paths, progress and the complete curriculum", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("배우는 순간이");
  await expect(page.locator(".learn-continue-card")).toBeVisible();
  await expect(page.locator(".learn-path-card")).toHaveCount(4);
  await expect(page.locator(".learn-recommendation")).toHaveCount(3);
  await expect(page.locator(".learn-card")).toHaveCount(LESSONS.length);
  await expect(page.getByRole("search", { name: "강좌 찾아보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: /내 학습 기록/u })).toBeVisible();
});

test("URL-backed discovery combines text, track, status, duration and sorting filters", async ({ page }) => {
  const studioLessons = LESSONS.filter((lesson) => lesson.track === "studio");
  await page.goto("/learn");
  await page.getByLabel("학습 과정", { exact: true }).selectOption("studio");
  await expect(page).toHaveURL(/track=studio/u);
  await expect(page.locator(".learn-card")).toHaveCount(studioLessons.length);
  await page.getByLabel("진행 상태", { exact: true }).selectOption("not-started");
  await page.getByLabel("학습 시간", { exact: true }).selectOption("deep");
  await page.getByLabel("정렬", { exact: true }).selectOption("shortest");
  await expect(page).toHaveURL(/status=not-started/u);
  await expect(page).toHaveURL(/duration=deep/u);
  await expect(page).toHaveURL(/sort=shortest/u);
  await page.getByLabel("강좌 검색", { exact: true }).fill("존재하지 않는 검색어");
  await expect(page.getByRole("heading", { name: "조건에 맞는 수업이 없습니다." })).toBeVisible();
  await page.getByRole("button", { name: "전체 수업 보기", exact: true }).click();
  await expect(page.locator(".learn-card")).toHaveCount(LESSONS.length);
  await expect(page).toHaveURL(/\/learn$/u);
});

test("active work is resumed before untouched lessons and can be filtered", async ({ page }) => {
  const active = LESSONS[1];
  await page.addInitScript(({ key, lessonId }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      lessons: {
        [lessonId]: { checks: [0], answer: null, notes: "다음에 이어서", completed: false },
      },
      bookmarks: [],
    }));
  }, { key: STORAGE_KEY, lessonId: active.id });
  await page.goto("/learn");
  await expect(page.locator(".learn-continue-card").getByRole("heading", { level: 2 })).toHaveText(active.title);
  await expect(page.locator(".learn-continue-card").getByRole("link", { name: /멈춘 곳에서 이어가기/u })).toBeVisible();
  await page.getByLabel("진행 상태", { exact: true }).selectOption("in-progress");
  await expect(page.locator(".learn-card")).toHaveCount(1);
  await expect(page.locator(".learn-card h3")).toHaveText(active.title);
});

test("lesson details expose outcomes, jump navigation and completion requirements", async ({ page }) => {
  const lesson = LESSONS[0];
  await page.goto(`/learn/lessons/${lesson.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
  await expect(page.getByRole("navigation", { name: "이 강좌 목차" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "이 수업을 마치면" })).toBeVisible();
  await expect(page.locator(".learn-requirements li")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "이 강좌 학습 완료", exact: true })).toBeDisabled();
});
