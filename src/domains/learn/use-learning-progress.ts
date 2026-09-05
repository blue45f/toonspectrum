import { useEffect, useState } from "react";

import { LESSONS, TERMS } from "./learning-content";
import { canComplete, EMPTY_LESSON, emptyProgress, parseProgress, STORAGE_KEY, type LearningProgress, type LessonProgress } from "./learning-model";

const TERM_IDS = TERMS.map((term) => term.id);
interface SavedState { data: LearningProgress; warning: string }
function readSaved(): SavedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return { data: parseProgress(raw, LESSONS, TERM_IDS), warning: "" };
  } catch {
    return { data: emptyProgress(), warning: "이 브라우저에서는 기록 저장소를 사용할 수 없습니다. 현재 화면에서는 계속 학습할 수 있습니다." };
  }
}
export function useLearningProgress() {
  const [saved, setSaved] = useState<SavedState>(readSaved);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setSaved(readSaved());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function update(change: (current: LearningProgress) => LearningProgress) {
    let base = saved.data;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw !== null && !saved.warning) base = parseProgress(raw, LESSONS, TERM_IDS);
    } catch { /* Keep the in-memory session when storage is blocked. */ }
    const data = change(base);
    let warning = "";
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { warning = "기록을 기기에 저장하지 못했습니다. 메모를 복사해 보관하세요. 이번 화면의 학습은 계속할 수 있습니다."; }
    setSaved({ data, warning });
  }

  function patchLesson(id: string, patch: Partial<LessonProgress>) {
    const lesson = LESSONS.find((candidate) => candidate.id === id);
    if (!lesson) return;
    update((current) => {
      const progress = { ...(current.lessons[id] ?? EMPTY_LESSON), ...patch };
      progress.notes = progress.notes.slice(0, 4000);
      if (!canComplete(lesson, progress)) progress.completed = false;
      return { ...current, lessons: { ...current.lessons, [id]: progress } };
    });
  }

  function toggleBookmark(id: string) {
    if (!TERM_IDS.includes(id)) return;
    update((current) => ({ ...current, bookmarks: current.bookmarks.includes(id)
      ? current.bookmarks.filter((value) => value !== id) : [...current.bookmarks, id] }));
  }

  return { progress: saved.data, warning: saved.warning, patchLesson, toggleBookmark, reset: () => update(emptyProgress) };
}
export type LearningStore = ReturnType<typeof useLearningProgress>;
