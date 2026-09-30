import { describe, expect, it } from "vitest";
import {
  drawPosePrompt,
  findStoreApp,
  gradeQuiz,
  installApp,
  launchAppSession,
  listConteTemplates,
  listPosePrompts,
  listQuizQuestions,
  listStoreApps,
  uninstallApp,
} from "./studio-virtual-space-app-store";

describe("가상공간 앱 스토어 레지스트리", () => {
  it("기본 내장 앱 3종을 제공한다", () => {
    const apps = listStoreApps();
    expect(apps.map((app) => app.id)).toEqual(["conte-template-pack", "drawing-quiz", "pose-challenge"]);
    for (const app of apps) {
      expect(app.name[0]).not.toBe("");
      expect(app.name[1]).not.toBe("");
      expect(app.description[0]).not.toBe("");
      expect(app.description[1]).not.toBe("");
    }
  });

  it("알 수 없는 앱 id 조회는 null을 반환한다", () => {
    expect(findStoreApp("no-such-app")).toBeNull();
  });
});

describe("앱 설치/제거", () => {
  it("앱을 설치하고 중복 설치를 거부한다", () => {
    const first = installApp([], "drawing-quiz");
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("설치 실패");
    expect(first.installedAppIds).toEqual(["drawing-quiz"]);

    const duplicate = installApp(first.installedAppIds, "drawing-quiz");
    expect(duplicate).toEqual({ ok: false, reason: "already-installed" });
  });

  it("등록되지 않은 앱 설치를 거부한다", () => {
    expect(installApp([], "no-such-app")).toEqual({ ok: false, reason: "unknown-app" });
  });

  it("입력 배열을 변경하지 않고 새 배열을 반환한다", () => {
    const before: readonly string[] = [];
    const result = installApp(before, "pose-challenge");
    expect(before).toEqual([]);
    if (!result.ok) throw new Error("설치 실패");
    expect(result.installedAppIds).toEqual(["pose-challenge"]);
  });

  it("설치된 앱을 제거하고 미설치 앱 제거를 거부한다", () => {
    const installed = installApp([], "conte-template-pack");
    if (!installed.ok) throw new Error("설치 실패");
    const removed = uninstallApp(installed.installedAppIds, "conte-template-pack");
    expect(removed).toEqual({ ok: true, installedAppIds: [] });

    const missing = uninstallApp([], "conte-template-pack");
    expect(missing).toEqual({ ok: false, reason: "not-installed" });
    expect(uninstallApp([], "no-such-app")).toEqual({ ok: false, reason: "unknown-app" });
  });
});

describe("앱 세션 실행", () => {
  it("설치된 앱의 세션을 생성한다", () => {
    const result = launchAppSession(["drawing-quiz"], "drawing-quiz", {
      sessionId: "session-1",
      startedAt: "2026-09-30T00:00:00.000Z",
    });
    expect(result).toEqual({
      ok: true,
      session: { sessionId: "session-1", appId: "drawing-quiz", startedAt: "2026-09-30T00:00:00.000Z" },
    });
  });

  it("미설치 앱과 알 수 없는 앱의 실행을 거부한다", () => {
    expect(launchAppSession([], "drawing-quiz")).toEqual({ ok: false, reason: "not-installed" });
    expect(launchAppSession([], "no-such-app")).toEqual({ ok: false, reason: "unknown-app" });
  });
});

describe("콘티 템플릿 팩", () => {
  it("컷 템플릿 목록을 제공한다", () => {
    const templates = listConteTemplates();
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(template.panelCount).toBeGreaterThan(0);
      expect(template.name[0]).not.toBe("");
    }
  });
});

describe("작화 퀴즈 채점", () => {
  it("문항 수와 답안 길이에 맞춰 채점한다", () => {
    const questions = listQuizQuestions();
    const allCorrect = questions.map((question) => question.answerIndex);
    expect(gradeQuiz(allCorrect)).toEqual({
      score: questions.length,
      total: questions.length,
      correctQuestionIds: questions.map((question) => question.id),
    });

    const allWrong = questions.map((question) => (question.answerIndex + 1) % question.choices.length);
    const graded = gradeQuiz(allWrong);
    expect(graded.score).toBe(0);
    expect(graded.total).toBe(questions.length);
    expect(graded.correctQuestionIds).toEqual([]);
  });

  it("부족한 답안은 오답 처리하고 남는 답안은 무시한다", () => {
    const total = listQuizQuestions().length;
    expect(gradeQuiz([]).score).toBe(0);
    const long = gradeQuiz(new Array<number>(total + 5).fill(-1));
    expect(long.score).toBe(0);
    expect(long.total).toBe(total);
  });
});

describe("포즈 뽑기", () => {
  it("같은 시드는 항상 같은 주제를 반환한다", () => {
    expect(drawPosePrompt(42)).toEqual(drawPosePrompt(42));
  });

  it("서로 다른 시드는 목록 안의 유효한 주제를 반환한다", () => {
    const prompts = listPosePrompts();
    const ids = new Set(prompts.map((prompt) => prompt.id));
    for (const seed of [1, 7, 123, 9999]) {
      const picked = drawPosePrompt(seed);
      expect(ids.has(picked.id)).toBe(true);
      expect(picked.durationSec).toBeGreaterThan(0);
    }
  });
});
