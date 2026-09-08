import { describe, expect, it } from "vitest";

import { emptyProgress, type Lesson } from "./learning-model";
import { filterAndSortLessons, learningStats, lessonCompletionPercent, lessonStatus, nextLesson } from "./learning-dashboard";

const lessons: readonly Lesson[] = [
  {
    id: "short",
    title: "짧은 콘티",
    summary: "세 컷 이야기",
    track: "foundation",
    minutes: 10,
    lab: "pacing",
    sections: [],
    task: "콘티 만들기",
    checks: ["첫 단계", "둘째 단계"],
    mistake: "한 번에 완성하려 하지 않기",
    quiz: { question: "정답?", options: ["아니오", "예"], answer: 1, explanation: "예" },
    terms: ["story"],
    sources: [],
  },
  {
    id: "studio",
    title: "레이어 실습",
    summary: "스튜디오에서 연습",
    track: "studio",
    minutes: 20,
    lab: "layers",
    sections: [],
    task: "레이어 나누기",
    checks: ["레이어 확인"],
    mistake: "합치지 않기",
    quiz: { question: "정답?", options: ["예", "아니오"], answer: 0, explanation: "예" },
    terms: ["layer"],
    sources: [],
  },
];

describe("learning dashboard", () => {
  it("distinguishes untouched, active and completed lessons", () => {
    const progress = emptyProgress();
    expect(lessonStatus(lessons[0], progress)).toBe("not-started");
    progress.lessons.short = { checks: [0], answer: null, notes: "", completed: false };
    expect(lessonStatus(lessons[0], progress)).toBe("in-progress");
    progress.lessons.short = { checks: [0, 1], answer: 1, notes: "", completed: true };
    expect(lessonStatus(lessons[0], progress)).toBe("completed");
  });

  it("reports requirement-based progress without trusting arbitrary completion", () => {
    const progress = emptyProgress();
    progress.lessons.short = { checks: [0], answer: 1, notes: "", completed: false };
    expect(lessonCompletionPercent(lessons[0], progress)).toBe(67);
  });

  it("filters by query, track, status and duration and recommends active work first", () => {
    const progress = emptyProgress();
    progress.lessons.studio = { checks: [0], answer: null, notes: "", completed: false };
    const result = filterAndSortLessons(lessons, progress, {
      query: "레이어",
      track: "studio",
      status: "in-progress",
      duration: "deep",
      sort: "recommended",
    }, { story: "스토리", layer: "레이어" });
    expect(result.map((lesson) => lesson.id)).toEqual(["studio"]);
    expect(nextLesson(lessons, progress)?.id).toBe("studio");
  });

  it("summarizes time and completion", () => {
    const progress = emptyProgress();
    progress.lessons.short = { checks: [0, 1], answer: 1, notes: "", completed: true };
    expect(learningStats(lessons, progress)).toEqual({
      completed: 1,
      inProgress: 0,
      untouched: 1,
      totalMinutes: 30,
      remainingMinutes: 20,
      completionPercent: 50,
    });
  });
});
