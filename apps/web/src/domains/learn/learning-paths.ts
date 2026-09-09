import { LESSONS } from "./learning-content";
import type { LearningProgress, Lesson } from "./learning-model";

export const LEARNING_LEVELS = ["starter", "growing", "advanced"] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export const LEARNING_GOALS = ["first-episode", "story", "visual", "studio", "publish"] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

export const SKILL_IDS = ["story", "direction", "drawing", "color", "lettering", "workflow"] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDefinition {
  id: SkillId;
  label: string;
  description: string;
}

export interface LessonMeta {
  level: LearningLevel;
  skills: readonly SkillId[];
  outcome: string;
  format: "concept-lab" | "studio-practice";
}

export interface LearningPath {
  id: string;
  title: string;
  summary: string;
  outcome: string;
  level: LearningLevel;
  lessonIds: readonly string[];
  recommendedGoals: readonly LearningGoal[];
}

export interface PathStats {
  total: number;
  started: number;
  completed: number;
  percent: number;
  totalMinutes: number;
  remainingMinutes: number;
}

export type LessonState = "not-started" | "in-progress" | "completed";

export const SKILLS: readonly SkillDefinition[] = [
  { id: "story", label: "이야기 설계", description: "로그라인과 장면의 목표를 컷으로 바꾸는 힘" },
  { id: "direction", label: "컷 연출", description: "시선, 호흡, 카메라와 정보 순서를 설계하는 힘" },
  { id: "drawing", label: "드로잉", description: "형태, 실루엣, 투시와 선의 역할을 통제하는 힘" },
  { id: "color", label: "채색", description: "명도, 밑색, 음영과 합성 범위를 구분하는 힘" },
  { id: "lettering", label: "대사·말풍선", description: "대화의 순서와 읽기 편한 글자 공간을 만드는 힘" },
  { id: "workflow", label: "제작 워크플로", description: "레이어, 원본, 내보내기와 검수를 안전하게 잇는 힘" },
];

export const LESSON_META: Readonly<Record<string, LessonMeta>> = {
  "story-board": { level: "starter", skills: ["story", "direction"], outcome: "상황·변화·반응이 분명한 3컷 콘티", format: "concept-lab" },
  "scroll-rhythm": { level: "starter", skills: ["direction"], outcome: "의도에 맞는 두 가지 스크롤 호흡안", format: "concept-lab" },
  "camera-perspective": { level: "growing", skills: ["direction", "drawing"], outcome: "아이레벨과 소실점이 일관된 공간 초안", format: "concept-lab" },
  "character-silhouette": { level: "growing", skills: ["drawing", "color"], outcome: "작게 보아도 행동과 초점이 읽히는 한 컷", format: "concept-lab" },
  inking: { level: "growing", skills: ["drawing", "workflow"], outcome: "선 굵기의 이유가 드러나는 비교 시트", format: "concept-lab" },
  "color-layers": { level: "growing", skills: ["color", "workflow"], outcome: "밑색·음영·클리핑이 분리된 채색 구조", format: "concept-lab" },
  lettering: { level: "starter", skills: ["lettering", "direction"], outcome: "대화 순서가 한눈에 읽히는 말풍선 배치", format: "concept-lab" },
  "publish-check": { level: "advanced", skills: ["color", "lettering", "workflow"], outcome: "원본과 게시본을 분리한 최종 검수 기록", format: "concept-lab" },
  "studio-first-page": { level: "starter", skills: ["story", "direction", "workflow"], outcome: "툰스튜디오에서 만든 첫 3컷 러프", format: "studio-practice" },
  "studio-layer-practice": { level: "growing", skills: ["drawing", "color", "workflow"], outcome: "수정 가능한 레이어 원본과 확인된 내보내기", format: "studio-practice" },
};

const FALLBACK_META: LessonMeta = {
  level: "starter",
  skills: ["workflow"],
  outcome: "학습 내용을 적용한 제작 결과물",
  format: "concept-lab",
};

export const LEARNING_PATHS: readonly LearningPath[] = [
  {
    id: "first-three-panels",
    title: "첫 3컷 완성",
    summary: "아이디어를 읽히는 세 컷으로 바꾸고 툰스튜디오에서 첫 러프까지 완성합니다.",
    outcome: "상황·변화·반응이 담긴 세 컷 러프와 개선 메모",
    level: "starter",
    lessonIds: ["story-board", "scroll-rhythm", "lettering", "studio-first-page"],
    recommendedGoals: ["first-episode", "story", "studio"],
  },
  {
    id: "story-direction",
    title: "스토리·연출 강화",
    summary: "장면의 목표, 스크롤 호흡, 카메라와 대사의 순서를 하나의 연출 흐름으로 연결합니다.",
    outcome: "공간과 읽는 순서가 설계된 장면 콘티",
    level: "growing",
    lessonIds: ["story-board", "scroll-rhythm", "camera-perspective", "lettering"],
    recommendedGoals: ["story", "visual", "first-episode"],
  },
  {
    id: "visual-finish",
    title: "그림 완성도 올리기",
    summary: "실루엣, 선화, 명도와 레이어 채색을 비교 실험하며 화면의 초점을 정리합니다.",
    outcome: "축소 화면에서도 초점과 수정 구조가 살아 있는 한 컷",
    level: "growing",
    lessonIds: ["character-silhouette", "inking", "color-layers", "studio-layer-practice"],
    recommendedGoals: ["visual", "publish"],
  },
  {
    id: "studio-quickstart",
    title: "툰스튜디오 빠른 시작",
    summary: "기획과 레이어 원리를 짧게 익힌 뒤 실제 작업 화면에서 안전한 제작 흐름을 연습합니다.",
    outcome: "세 컷 초안, 분리된 레이어 원본, 확인한 내보내기",
    level: "starter",
    lessonIds: ["story-board", "studio-first-page", "color-layers", "studio-layer-practice"],
    recommendedGoals: ["studio", "first-episode"],
  },
  {
    id: "publish-ready",
    title: "첫 회차 게시 준비",
    summary: "이야기와 대사, 채색 구조를 점검하고 실제 게시 크기의 결과물까지 검수합니다.",
    outcome: "수정 가능한 원본, 게시본, 체크리스트가 갖춰진 첫 회차",
    level: "advanced",
    lessonIds: ["story-board", "lettering", "color-layers", "publish-check"],
    recommendedGoals: ["publish", "first-episode"],
  },
];

const LEVEL_RANK: Readonly<Record<LearningLevel, number>> = { starter: 0, growing: 1, advanced: 2 };

export function getLessonMeta(lessonId: string): LessonMeta {
  return LESSON_META[lessonId] ?? FALLBACK_META;
}

export function getLessonState(progress: LearningProgress, lessonId: string): LessonState {
  const saved = progress.lessons[lessonId];
  if (saved?.completed) return "completed";
  if (saved && (saved.checks.length > 0 || saved.answer !== null || saved.notes.trim().length > 0)) return "in-progress";
  return "not-started";
}

/** Requirement progress is derived from valid unique checks and the correct answer, never from raw array length. */
export function getLessonRequirementProgress(lesson: Lesson, progress: LearningProgress): number {
  const saved = progress.lessons[lesson.id];
  if (!saved) return 0;
  if (saved.completed) return 100;
  const checked = new Set(saved.checks.filter((index) => Number.isInteger(index) && index >= 0 && index < lesson.checks.length)).size;
  const correct = saved.answer === lesson.quiz.answer ? 1 : 0;
  const total = Math.max(1, lesson.checks.length + 1);
  return Math.min(100, Math.round(((checked + correct) / total) * 100));
}

export function getPathLessons(path: LearningPath, lessons: readonly Lesson[] = LESSONS): Lesson[] {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  return path.lessonIds.map((id) => byId.get(id)).filter((lesson): lesson is Lesson => Boolean(lesson));
}

export function getPathStats(path: LearningPath, progress: LearningProgress): PathStats {
  const lessons = getPathLessons(path);
  const states = lessons.map((lesson) => getLessonState(progress, lesson.id));
  const completed = states.filter((state) => state === "completed").length;
  const started = states.filter((state) => state !== "not-started").length;
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
  const remainingMinutes = lessons.reduce((sum, lesson) => sum + (getLessonState(progress, lesson.id) === "completed" ? 0 : lesson.minutes), 0);
  return {
    total: lessons.length,
    started,
    completed,
    percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
    totalMinutes,
    remainingMinutes,
  };
}

export function recommendLearningPath(goal: LearningGoal, level: LearningLevel): LearningPath {
  const ranked = LEARNING_PATHS.map((path, index) => {
    const goalIndex = path.recommendedGoals.indexOf(goal);
    const goalScore = goalIndex < 0 ? 0 : goalIndex === 0 ? 8 : 6;
    const distance = Math.abs(LEVEL_RANK[path.level] - LEVEL_RANK[level]);
    const levelScore = distance === 0 ? 3 : distance === 1 ? 1 : 0;
    return { path, index, score: goalScore + levelScore };
  });
  ranked.sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0].path;
}

/** Resume active work first, then continue untouched lessons in curriculum order within the time budget. */
export function buildSessionPlan(path: LearningPath, progress: LearningProgress, budgetMinutes: number): Lesson[] {
  const lessons = getPathLessons(path);
  const inProgress = lessons.filter((lesson) => getLessonState(progress, lesson.id) === "in-progress");
  const untouched = lessons.filter((lesson) => getLessonState(progress, lesson.id) === "not-started");
  const candidates = inProgress.length || untouched.length ? [...inProgress, ...untouched] : lessons;
  const budget = Number.isFinite(budgetMinutes) ? Math.max(5, Math.min(120, Math.round(budgetMinutes))) : 30;
  const selected: Lesson[] = [];
  let total = 0;
  for (const lesson of candidates) {
    if (selected.length === 0 || total + lesson.minutes <= budget) {
      selected.push(lesson);
      total += lesson.minutes;
    }
  }
  return selected;
}

export function getSkillProgress(progress: LearningProgress) {
  return SKILLS.map((skill) => {
    const lessons = LESSONS.filter((lesson) => getLessonMeta(lesson.id).skills.includes(skill.id));
    const completed = lessons.filter((lesson) => getLessonState(progress, lesson.id) === "completed").length;
    return {
      ...skill,
      completed,
      total: lessons.length,
      percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
    };
  });
}
