import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { LESSONS } from "./learning-content";
import { emptyProgress } from "./learning-model";
import {
  LEARNING_PATHS,
  LESSON_META,
  SKILL_IDS,
  buildSessionPlan,
  getLessonMeta,
  getLessonRequirementProgress,
  getLessonState,
  getPathLessons,
  getPathStats,
  getSkillProgress,
  recommendLearningPath,
} from "./learning-paths";

describe("learning path catalogue", () => {
  it("covers every lesson with valid metadata", () => {
    assert.deepEqual(Object.keys(LESSON_META).sort(), LESSONS.map((lesson) => lesson.id).sort());
    for (const lesson of LESSONS) {
      const meta = getLessonMeta(lesson.id);
      assert.ok(meta.outcome.length >= 12);
      assert.ok(meta.skills.length > 0);
      assert.ok(meta.skills.every((skill) => SKILL_IDS.includes(skill)));
      assert.equal(meta.format, lesson.track === "studio" ? "studio-practice" : "concept-lab");
    }
  });

  it("ships unique, resolvable paths and includes every lesson in at least one path", () => {
    assert.equal(LEARNING_PATHS.length, 5);
    assert.equal(new Set(LEARNING_PATHS.map((path) => path.id)).size, LEARNING_PATHS.length);
    const lessonIds = new Set(LESSONS.map((lesson) => lesson.id));
    const included = new Set<string>();
    for (const path of LEARNING_PATHS) {
      assert.match(path.id, /^[a-z0-9-]+$/u);
      assert.ok(path.lessonIds.length >= 3);
      assert.equal(new Set(path.lessonIds).size, path.lessonIds.length);
      assert.ok(path.lessonIds.every((id) => lessonIds.has(id)));
      assert.equal(getPathLessons(path).length, path.lessonIds.length);
      path.lessonIds.forEach((id) => included.add(id));
    }
    assert.deepEqual([...included].sort(), [...lessonIds].sort());
  });

  it("uses both the goal and experience level for deterministic recommendations", () => {
    assert.equal(recommendLearningPath("first-episode", "starter").id, "first-three-panels");
    assert.equal(recommendLearningPath("story", "growing").id, "story-direction");
    assert.equal(recommendLearningPath("visual", "growing").id, "visual-finish");
    assert.equal(recommendLearningPath("studio", "starter").id, "studio-quickstart");
    assert.equal(recommendLearningPath("publish", "advanced").id, "publish-ready");
    assert.equal(recommendLearningPath("first-episode", "advanced").id, "publish-ready");
  });
});

describe("learning path progress", () => {
  it("distinguishes untouched, in-progress and completed lessons", () => {
    const progress = emptyProgress();
    const lesson = LESSONS[0];
    assert.equal(getLessonState(progress, lesson.id), "not-started");
    progress.lessons[lesson.id] = { checks: [0], answer: null, notes: "", completed: false };
    assert.equal(getLessonState(progress, lesson.id), "in-progress");
    progress.lessons[lesson.id] = {
      checks: lesson.checks.map((_, index) => index),
      answer: lesson.quiz.answer,
      notes: "완료",
      completed: true,
    };
    assert.equal(getLessonState(progress, lesson.id), "completed");
  });

  it("derives bounded requirement progress from valid unique checks and the correct answer", () => {
    const lesson = LESSONS[0];
    const progress = emptyProgress();
    progress.lessons[lesson.id] = {
      checks: [0, 0, -1, lesson.checks.length + 5],
      answer: lesson.quiz.answer,
      notes: "직접 만든 비정상 입력도 안전하게 처리",
      completed: false,
    };
    const expected = Math.round((2 / (lesson.checks.length + 1)) * 100);
    assert.equal(getLessonRequirementProgress(lesson, progress), expected);
    assert.ok(getLessonRequirementProgress(lesson, progress) <= 100);
    progress.lessons[lesson.id].completed = true;
    assert.equal(getLessonRequirementProgress(lesson, progress), 100);
  });

  it("calculates path completion and remaining time from the shared progress record", () => {
    const path = LEARNING_PATHS[0];
    const lessons = getPathLessons(path);
    const progress = emptyProgress();
    const first = lessons[0];
    progress.lessons[first.id] = {
      checks: first.checks.map((_, index) => index),
      answer: first.quiz.answer,
      notes: "첫 단계 완료",
      completed: true,
    };
    progress.lessons[lessons[1].id] = { checks: [0], answer: null, notes: "학습 중", completed: false };
    const stats = getPathStats(path, progress);
    assert.equal(stats.total, lessons.length);
    assert.equal(stats.started, 2);
    assert.equal(stats.completed, 1);
    assert.equal(stats.percent, 25);
    assert.equal(stats.remainingMinutes, stats.totalMinutes - first.minutes);
  });

  it("resumes an active lesson before earlier untouched lessons", () => {
    const path = LEARNING_PATHS[0];
    const lessons = getPathLessons(path);
    const progress = emptyProgress();
    progress.lessons[lessons[1].id] = { checks: [0], answer: null, notes: "여기서 멈춤", completed: false };
    const plan = buildSessionPlan(path, progress, 30);
    assert.equal(plan[0].id, lessons[1].id);
    assert.ok(plan.reduce((sum, lesson) => sum + lesson.minutes, 0) <= 30);
  });

  it("builds a bounded session and falls back to a review lesson after completion", () => {
    const path = LEARNING_PATHS[0];
    const progress = emptyProgress();
    const plan = buildSessionPlan(path, progress, 30);
    assert.ok(plan.length >= 1);
    assert.ok(plan.reduce((sum, lesson) => sum + lesson.minutes, 0) <= 30);

    for (const lesson of getPathLessons(path)) {
      progress.lessons[lesson.id] = {
        checks: lesson.checks.map((_, index) => index),
        answer: lesson.quiz.answer,
        notes: "완료",
        completed: true,
      };
    }
    const review = buildSessionPlan(path, progress, 15);
    assert.ok(review.length >= 1);
    assert.equal(review[0].id, path.lessonIds[0]);
  });

  it("reports every skill without presenting it as a mastery score", () => {
    const skillProgress = getSkillProgress(emptyProgress());
    assert.deepEqual(skillProgress.map((skill) => skill.id), [...SKILL_IDS]);
    assert.ok(skillProgress.every((skill) => skill.total > 0 && skill.completed === 0 && skill.percent === 0));
  });
});
