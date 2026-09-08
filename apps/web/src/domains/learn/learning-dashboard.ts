import { EMPTY_LESSON, type LearningProgress, type Lesson } from "./learning-model";

export type LearningStatus = "all" | "not-started" | "in-progress" | "completed";
export type LearningDuration = "all" | "quick" | "standard" | "deep";
export type LearningSort = "curriculum" | "recommended" | "shortest";

export interface LearningFilters {
  query: string;
  track: "all" | Lesson["track"];
  status: LearningStatus;
  duration: LearningDuration;
  sort: LearningSort;
}

export interface LearningStats {
  completed: number;
  inProgress: number;
  untouched: number;
  totalMinutes: number;
  remainingMinutes: number;
  completionPercent: number;
}

export function lessonStatus(lesson: Lesson, progress: LearningProgress): Exclude<LearningStatus, "all"> {
  const saved = progress.lessons[lesson.id] ?? EMPTY_LESSON;
  if (saved.completed) return "completed";
  if (saved.checks.length > 0 || saved.answer !== null || saved.notes.trim().length > 0) return "in-progress";
  return "not-started";
}

export function lessonCompletionPercent(lesson: Lesson, progress: LearningProgress): number {
  const saved = progress.lessons[lesson.id] ?? EMPTY_LESSON;
  if (saved.completed) return 100;
  const total = Math.max(1, lesson.checks.length + 1);
  const validChecks = lesson.checks.reduce((count, _, index) => count + (saved.checks.includes(index) ? 1 : 0), 0);
  const correctQuiz = saved.answer === lesson.quiz.answer ? 1 : 0;
  return Math.round(((validChecks + correctQuiz) / total) * 100);
}

function matchesDuration(minutes: number, duration: LearningDuration): boolean {
  if (duration === "quick") return minutes <= 12;
  if (duration === "standard") return minutes >= 13 && minutes <= 16;
  if (duration === "deep") return minutes >= 17;
  return true;
}

function normalized(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/gu, "");
}

export function filterAndSortLessons(
  lessons: readonly Lesson[],
  progress: LearningProgress,
  filters: LearningFilters,
  termNames: Readonly<Record<string, string>>,
): Lesson[] {
  const needle = normalized(filters.query.trim().slice(0, 200));
  const indexed = lessons.map((lesson, index) => ({ lesson, index, status: lessonStatus(lesson, progress) }));
  const visible = indexed.filter(({ lesson, status }) => {
    if (filters.track !== "all" && lesson.track !== filters.track) return false;
    if (filters.status !== "all" && status !== filters.status) return false;
    if (!matchesDuration(lesson.minutes, filters.duration)) return false;
    if (!needle) return true;
    const haystack = [lesson.title, lesson.summary, lesson.task, ...lesson.terms.map((id) => termNames[id] ?? id)];
    return haystack.some((value) => normalized(value).includes(needle));
  });

  if (filters.sort === "shortest") {
    visible.sort((a, b) => a.lesson.minutes - b.lesson.minutes || a.index - b.index);
  } else if (filters.sort === "recommended") {
    const priority = { "in-progress": 0, "not-started": 1, completed: 2 } as const;
    visible.sort((a, b) => priority[a.status] - priority[b.status] || a.index - b.index);
  }
  return visible.map(({ lesson }) => lesson);
}

export function learningStats(lessons: readonly Lesson[], progress: LearningProgress): LearningStats {
  let completed = 0;
  let inProgress = 0;
  let totalMinutes = 0;
  let remainingMinutes = 0;
  for (const lesson of lessons) {
    const status = lessonStatus(lesson, progress);
    totalMinutes += lesson.minutes;
    if (status === "completed") completed += 1;
    else {
      remainingMinutes += lesson.minutes;
      if (status === "in-progress") inProgress += 1;
    }
  }
  return {
    completed,
    inProgress,
    untouched: lessons.length - completed - inProgress,
    totalMinutes,
    remainingMinutes,
    completionPercent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
  };
}

export function nextLesson(lessons: readonly Lesson[], progress: LearningProgress): Lesson | undefined {
  return lessons.find((lesson) => lessonStatus(lesson, progress) === "in-progress")
    ?? lessons.find((lesson) => lessonStatus(lesson, progress) === "not-started")
    ?? lessons[0];
}
