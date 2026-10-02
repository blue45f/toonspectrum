import { useState } from "react";

import type { LearningProgress } from "./learning-model";
import {
  completeMission,
  loadPracticeProgress,
  markMissionStarted,
  reopenMission,
  savePracticeProgress,
  type PracticeMission,
  type PracticeProgress,
} from "./learning-practice";

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

const SAVE_WARNING = "실습 기록을 이 기기에 저장하지 못했습니다. 학습은 계속할 수 있지만 새로고침하면 미션 기록이 사라질 수 있습니다.";

/** 실습 미션 기록용 로컬 스토어 — 서버 상태는 만들지 않는다. */
export function useLearningPractice() {
  const [progress, setProgress] = useState<PracticeProgress>(() => loadPracticeProgress(browserStorage()));
  const [warning, setWarning] = useState("");

  function persist(next: PracticeProgress) {
    setProgress(next);
    setWarning(savePracticeProgress(browserStorage(), next) ? "" : SAVE_WARNING);
  }

  return {
    progress,
    warning,
    startMission(lessonId: string) {
      persist(markMissionStarted(progress, lessonId, new Date().toISOString()));
    },
    completeCurrentMission(mission: PracticeMission, learning: LearningProgress) {
      persist(completeMission(progress, mission, learning, new Date().toISOString()));
    },
    reopenCurrentMission(lessonId: string) {
      persist(reopenMission(progress, lessonId));
    },
  };
}

export type LearningPracticeStore = ReturnType<typeof useLearningPractice>;
