import { describe, expect, it } from "vitest";

import { LESSONS } from "./learning-content";
import { emptyProgress, type LearningProgress, type LessonProgress } from "./learning-model";
import {
  PRACTICE_MISSIONS,
  PRACTICE_STORAGE_KEY,
  areMissionStepsDone,
  buildStudioPracticeUrl,
  completeMission,
  emptyPracticeProgress,
  getMissionStatus,
  getPracticeMission,
  loadPracticeProgress,
  markMissionStarted,
  parsePracticeProgress,
  reopenMission,
  savePracticeProgress,
  suggestNextMission,
  type PracticeProgress,
} from "./learning-practice";

const NOW = "2026-10-02T00:00:00.000Z";
const LATER = "2026-10-02T01:00:00.000Z";

function lessonProgress(partial: Partial<LessonProgress>): LessonProgress {
  return { checks: [], answer: null, notes: "", completed: false, ...partial };
}

function learningWith(lessons: Record<string, LessonProgress>): LearningProgress {
  return { ...emptyProgress(), lessons };
}

function allChecks(lessonId: string): number[] {
  const lesson = LESSONS.find((item) => item.id === lessonId);
  return lesson ? lesson.checks.map((_, index) => index) : [];
}

describe("실습 미션 카탈로그", () => {
  it("모든 강좌에 정확히 하나의 미션을 제공하고 단계는 강좌 체크리스트를 그대로 쓴다", () => {
    expect(PRACTICE_MISSIONS).toHaveLength(LESSONS.length);
    for (const lesson of LESSONS) {
      const mission = getPracticeMission(lesson.id);
      expect(mission?.lessonId).toBe(lesson.id);
      expect(mission?.steps).toEqual(lesson.checks);
      expect(mission?.goal.length).toBeGreaterThan(0);
    }
    expect(getPracticeMission("no-such-lesson")).toBeUndefined();
  });

  it("스튜디오 진입 URL은 상태 없이 파라미터로만 미션을 넘긴다", () => {
    const mission = getPracticeMission("story-board");
    expect(mission && buildStudioPracticeUrl(mission)).toBe(
      "/studio/canvas?practice=lesson&lesson=story-board&mission=mission-story-board",
    );
  });
});

describe("실습 진도 파싱", () => {
  it("없거나 깨진 저장값은 빈 진도로 되돌린다", () => {
    expect(parsePracticeProgress(null)).toEqual(emptyPracticeProgress());
    expect(parsePracticeProgress("{broken")).toEqual(emptyPracticeProgress());
    expect(parsePracticeProgress(JSON.stringify({ version: 2, missions: {} }))).toEqual(emptyPracticeProgress());
  });

  it("모르는 강좌와 빈 레코드는 버리고 유효한 기록만 남긴다", () => {
    const raw = JSON.stringify({
      version: 1,
      missions: {
        "story-board": { startedAt: NOW, completedAt: null },
        "ghost-lesson": { startedAt: NOW, completedAt: NOW },
        "scroll-rhythm": { startedAt: null, completedAt: null },
        inking: { startedAt: 42, completedAt: NOW },
      },
    });
    const parsed = parsePracticeProgress(raw);
    expect(parsed.missions["story-board"]).toEqual({ startedAt: NOW, completedAt: null });
    expect(parsed.missions["ghost-lesson"]).toBeUndefined();
    expect(parsed.missions["scroll-rhythm"]).toBeUndefined();
    expect(parsed.missions.inking).toEqual({ startedAt: null, completedAt: NOW });
  });

  it("저장 후 다시 읽으면 같은 진도가 복원된다", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
    const progress = markMissionStarted(emptyPracticeProgress(), "inking", NOW);
    expect(savePracticeProgress(storage, progress)).toBe(true);
    expect(memory.has(PRACTICE_STORAGE_KEY)).toBe(true);
    expect(loadPracticeProgress(storage)).toEqual(progress);
  });
});

describe("미션 상태 파생", () => {
  const mission = PRACTICE_MISSIONS[0];

  it("시작 전 → 시작 기록/부분 체크 → 진행 중으로 파생한다", () => {
    const empty = emptyProgress();
    expect(getMissionStatus(mission, emptyPracticeProgress(), empty)).toBe("not-started");
    const started = markMissionStarted(emptyPracticeProgress(), mission.lessonId, NOW);
    expect(getMissionStatus(mission, started, empty)).toBe("in-progress");
    const partial = learningWith({ [mission.lessonId]: lessonProgress({ checks: [0] }) });
    expect(getMissionStatus(mission, emptyPracticeProgress(), partial)).toBe("in-progress");
  });

  it("체크가 모두 채워지면 완료 가능(ready)이 되고, 완료 기록 후 completed가 된다", () => {
    const done = learningWith({ [mission.lessonId]: lessonProgress({ checks: allChecks(mission.lessonId) }) });
    expect(areMissionStepsDone(mission, done)).toBe(true);
    expect(getMissionStatus(mission, emptyPracticeProgress(), done)).toBe("ready");
    const completed = completeMission(emptyPracticeProgress(), mission, done, NOW);
    expect(getMissionStatus(mission, completed, done)).toBe("completed");
  });

  it("체크가 다 차지 않았으면 완료를 기록하지 않는다", () => {
    const partial = learningWith({ [mission.lessonId]: lessonProgress({ checks: [0] }) });
    const attempted = completeMission(emptyPracticeProgress(), mission, partial, NOW);
    expect(attempted).toEqual(emptyPracticeProgress());
  });

  it("완료 뒤 체크를 해제하면 저장된 완료를 인정하지 않는다", () => {
    const done = learningWith({ [mission.lessonId]: lessonProgress({ checks: allChecks(mission.lessonId) }) });
    const completed = completeMission(emptyPracticeProgress(), mission, done, NOW);
    const unchecked = learningWith({ [mission.lessonId]: lessonProgress({ checks: [0] }) });
    expect(getMissionStatus(mission, completed, unchecked)).toBe("in-progress");
  });

  it("완료를 되돌리면 시작 기록은 남고 완료만 풀린다", () => {
    const done = learningWith({ [mission.lessonId]: lessonProgress({ checks: allChecks(mission.lessonId) }) });
    const completed = completeMission(emptyPracticeProgress(), mission, done, NOW);
    const reopened = reopenMission(completed, mission.lessonId);
    expect(reopened.missions[mission.lessonId]).toEqual({ startedAt: NOW, completedAt: null });
    expect(getMissionStatus(mission, reopened, done)).toBe("ready");
  });

  it("시작 표시는 한 번만 기록되고 모르는 강좌는 무시한다", () => {
    const started = markMissionStarted(emptyPracticeProgress(), mission.lessonId, NOW);
    expect(markMissionStarted(started, mission.lessonId, LATER)).toBe(started);
    expect(markMissionStarted(emptyPracticeProgress(), "ghost", NOW)).toEqual(emptyPracticeProgress());
  });
});

describe("다음 미션 제안", () => {
  it("방금 완료한 강좌의 미션을 가장 먼저 제안한다", () => {
    const learning = learningWith({
      "story-board": lessonProgress({ checks: allChecks("story-board"), answer: 1, completed: true }),
    });
    expect(suggestNextMission(learning, emptyPracticeProgress(), "story-board")?.lessonId).toBe("story-board");
  });

  it("완료한 강좌의 미션이 끝나 있으면 다음 완료 강좌의 미션을 제안한다", () => {
    const learning = learningWith({
      "story-board": lessonProgress({ checks: allChecks("story-board"), completed: true }),
      "scroll-rhythm": lessonProgress({ checks: allChecks("scroll-rhythm"), completed: true }),
    });
    const practice = completeMission(emptyPracticeProgress(), PRACTICE_MISSIONS[0], learning, NOW);
    expect(suggestNextMission(learning, practice, "story-board")?.lessonId).toBe("scroll-rhythm");
  });

  it("완료한 강좌가 없으면 커리큘럼 첫 미완료 미션을 제안하고, 전부 끝나면 null이다", () => {
    expect(suggestNextMission(emptyProgress(), emptyPracticeProgress())?.lessonId).toBe(LESSONS[0].id);
    let practice: PracticeProgress = emptyPracticeProgress();
    const learning = learningWith(Object.fromEntries(
      LESSONS.map((lesson) => [lesson.id, lessonProgress({ checks: allChecks(lesson.id), completed: true })]),
    ));
    for (const mission of PRACTICE_MISSIONS) practice = completeMission(practice, mission, learning, NOW);
    expect(suggestNextMission(learning, practice)).toBeNull();
  });
});
