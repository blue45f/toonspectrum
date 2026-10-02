import { LESSONS } from "./learning-content";
import { getLessonMeta } from "./learning-paths";
import type { LearningProgress, Lesson } from "./learning-model";

/**
 * 강좌와 스튜디오 실습을 잇는 미션 모델.
 *
 * 미션은 강좌당 하나이며, 단계(steps)는 강좌의 실습 체크리스트를 그대로 쓴다 —
 * 체크 상태의 단일 출처는 기존 학습 진도(`LearningProgress`)이고, 이 모듈은
 * "스튜디오에 다녀왔는가/실습을 마쳤는가"라는 미션 단위 기록만 따로 보관한다.
 * 상태는 저장값을 믿지 않고 두 기록을 합쳐 파생한다(완료는 체크가 모두
 * 채워졌을 때만 인정한다).
 */
export interface PracticeMission {
  id: string;
  lessonId: string;
  title: string;
  goal: string;
  task: string;
  minutes: number;
  steps: readonly string[];
}

export type MissionStatus = "not-started" | "in-progress" | "ready" | "completed";

export interface MissionRecord {
  startedAt: string | null;
  completedAt: string | null;
}

export interface PracticeProgress {
  version: 1;
  missions: Record<string, MissionRecord>;
}

export const PRACTICE_STORAGE_KEY = "toonstudio:learning-practice:v1";

const MAX_STORED_MISSIONS = 64;
const MAX_TIMESTAMP_LENGTH = 64;

export const PRACTICE_MISSIONS: readonly PracticeMission[] = LESSONS.map((lesson) => ({
  id: `mission-${lesson.id}`,
  lessonId: lesson.id,
  title: `${lesson.title} — 스튜디오 실습`,
  goal: getLessonMeta(lesson.id).outcome,
  task: lesson.task,
  minutes: lesson.minutes,
  steps: lesson.checks,
}));

const MISSION_BY_LESSON = new Map(PRACTICE_MISSIONS.map((mission) => [mission.lessonId, mission]));

export function getPracticeMission(lessonId: string): PracticeMission | undefined {
  return MISSION_BY_LESSON.get(lessonId);
}

/** 실습 상태는 서버가 아니라 URL 파라미터로만 스튜디오에 넘긴다(설계 2.4). */
export function buildStudioPracticeUrl(mission: PracticeMission): string {
  const params = new URLSearchParams({
    practice: "lesson",
    lesson: mission.lessonId,
    mission: mission.id,
  });
  return `/studio/canvas?${params.toString()}`;
}

export function emptyPracticeProgress(): PracticeProgress {
  return { version: 1, missions: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedTimestamp(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TIMESTAMP_LENGTH ? value : null;
}

/** 브라우저 저장소는 신뢰할 수 없는 입력으로 취급한다. 모르는 강좌와 깨진 레코드는 버린다. */
export function parsePracticeProgress(raw: string | null, lessons: readonly Lesson[] = LESSONS): PracticeProgress {
  if (!raw || raw.length > 100_000) return emptyPracticeProgress();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return emptyPracticeProgress(); }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.missions)) return emptyPracticeProgress();
  const known = new Set(lessons.map((lesson) => lesson.id));
  const missions: Record<string, MissionRecord> = {};
  for (const [lessonId, record] of Object.entries(value.missions)) {
    if (!known.has(lessonId) || !isRecord(record)) continue;
    const parsed: MissionRecord = {
      startedAt: boundedTimestamp(record.startedAt),
      completedAt: boundedTimestamp(record.completedAt),
    };
    if (parsed.startedAt === null && parsed.completedAt === null) continue;
    missions[lessonId] = parsed;
    if (Object.keys(missions).length >= MAX_STORED_MISSIONS) break;
  }
  return { version: 1, missions };
}

export function loadPracticeProgress(storage: Pick<Storage, "getItem"> | null): PracticeProgress {
  if (!storage) return emptyPracticeProgress();
  try { return parsePracticeProgress(storage.getItem(PRACTICE_STORAGE_KEY)); }
  catch { return emptyPracticeProgress(); }
}

export function savePracticeProgress(storage: Pick<Storage, "setItem"> | null, progress: PracticeProgress): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(parsePracticeProgress(JSON.stringify(progress))));
    return true;
  } catch {
    return false;
  }
}

function lessonById(lessonId: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === lessonId);
}

/** 강좌 체크리스트가 모두 채워졌는가 — 미션 완료의 유일한 전제 조건. */
export function areMissionStepsDone(mission: PracticeMission, learning: LearningProgress): boolean {
  const saved = learning.lessons[mission.lessonId];
  if (!saved) return false;
  return mission.steps.every((_, index) => saved.checks.includes(index));
}

function hasAnyStepDone(mission: PracticeMission, learning: LearningProgress): boolean {
  const saved = learning.lessons[mission.lessonId];
  return Boolean(saved && saved.checks.length > 0);
}

export function getMissionStatus(
  mission: PracticeMission,
  practice: PracticeProgress,
  learning: LearningProgress,
): MissionStatus {
  const record = practice.missions[mission.lessonId];
  const stepsDone = areMissionStepsDone(mission, learning);
  // 저장된 완료 표시는 체크가 실제로 다 채워졌을 때만 인정한다.
  if (record?.completedAt && stepsDone) return "completed";
  if (stepsDone) return "ready";
  if (record?.startedAt || record?.completedAt || hasAnyStepDone(mission, learning)) return "in-progress";
  return "not-started";
}

export function markMissionStarted(progress: PracticeProgress, lessonId: string, now: string): PracticeProgress {
  if (!lessonById(lessonId)) return progress;
  const record = progress.missions[lessonId];
  if (record?.startedAt) return progress;
  return {
    ...progress,
    missions: {
      ...progress.missions,
      [lessonId]: { startedAt: now, completedAt: record?.completedAt ?? null },
    },
  };
}

/** 체크가 다 채워지지 않았으면 완료를 기록하지 않는다. */
export function completeMission(
  progress: PracticeProgress,
  mission: PracticeMission,
  learning: LearningProgress,
  now: string,
): PracticeProgress {
  if (!areMissionStepsDone(mission, learning)) return progress;
  const record = progress.missions[mission.lessonId];
  if (record?.completedAt) return progress;
  return {
    ...progress,
    missions: {
      ...progress.missions,
      [mission.lessonId]: { startedAt: record?.startedAt ?? now, completedAt: now },
    },
  };
}

export function reopenMission(progress: PracticeProgress, lessonId: string): PracticeProgress {
  const record = progress.missions[lessonId];
  if (!record?.completedAt) return progress;
  return {
    ...progress,
    missions: {
      ...progress.missions,
      [lessonId]: { startedAt: record.startedAt, completedAt: null },
    },
  };
}

/**
 * 다음에 할 실습 미션을 고른다.
 * 1) 방금 완료한 강좌의 미션이 남아 있으면 그 미션.
 * 2) 완료한 강좌들 중 미션이 남은 것(커리큘럼 순서).
 * 3) 그 외에는 커리큘럼 순서상 첫 미완료 미션. 전부 끝났으면 null.
 */
export function suggestNextMission(
  learning: LearningProgress,
  practice: PracticeProgress,
  justCompletedLessonId?: string | null,
): PracticeMission | null {
  const isIncomplete = (mission: PracticeMission) =>
    getMissionStatus(mission, practice, learning) !== "completed";
  if (justCompletedLessonId) {
    const own = getPracticeMission(justCompletedLessonId);
    if (own && isIncomplete(own)) return own;
  }
  const fromCompletedLessons = PRACTICE_MISSIONS.find(
    (mission) => learning.lessons[mission.lessonId]?.completed && isIncomplete(mission),
  );
  if (fromCompletedLessons) return fromCompletedLessons;
  return PRACTICE_MISSIONS.find(isIncomplete) ?? null;
}
