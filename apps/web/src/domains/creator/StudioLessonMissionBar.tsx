import { Check, GraduationCap, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  getMissionStatus,
  useLearningPractice,
  useLearningProgress,
  type MissionStatus,
} from "@/domains/learn/public/learning-practice";

import { parseStudioLessonMission } from "./studio-lesson-mission";

const STATUS_LABEL: Record<MissionStatus, string> = {
  "not-started": "시작 전",
  "in-progress": "진행 중",
  ready: "완료할 수 있어요",
  completed: "완료",
};

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-9";

/**
 * 강좌 실습 미션 안내 바.
 *
 * learn 페이지의 "스튜디오에서 실습하기"가 여는 주소로 들어왔을 때만 캔버스 위에
 * 뜬다. 체크 상태의 단일 출처는 학습 진도(`useLearningProgress`)이고, 이 바는
 * 같은 스토어를 토글하므로 learn 탭으로 돌아가지 않아도 체크와 완료가 이어진다.
 * 실습 시작·완료 기록은 learn과 같은 로컬 실습 기록(`useLearningPractice`)에 남는다.
 */
export function StudioLessonMissionBar() {
  const [params] = useSearchParams();
  const mission = parseStudioLessonMission(params);
  const practice = useLearningPractice();
  const learning = useLearningProgress();
  const [dismissed, setDismissed] = useState(false);

  const lessonId = mission?.lessonId ?? null;
  const startedAt = lessonId ? practice.progress.missions[lessonId]?.startedAt ?? null : null;
  const { startMission } = practice;

  // learn의 버튼을 거치지 않고 주소로 바로 들어온 경우에도 실습 시작을 기록한다.
  // markMissionStarted가 멱등이라 이미 시작된 미션은 그대로 둔다.
  useEffect(() => {
    if (!lessonId || startedAt) return;
    startMission(lessonId);
  }, [lessonId, startedAt, startMission]);

  if (!mission || dismissed) return null;

  const status = getMissionStatus(mission, practice.progress, learning.progress);
  const savedChecks = learning.progress.lessons[mission.lessonId]?.checks ?? [];
  const doneCount = mission.steps.filter((_, index) => savedChecks.includes(index)).length;

  const toggleStep = (index: number) => {
    const next = savedChecks.includes(index)
      ? savedChecks.filter((value) => value !== index)
      : [...savedChecks, index].sort((a, b) => a - b);
    learning.patchLesson(mission.lessonId, { checks: next });
  };

  return (
    <section
      aria-label="학습 실습 미션"
      data-studio-lesson-mission-bar={status}
      className="pointer-events-auto absolute inset-x-2 bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+0.5rem)] z-40 mx-auto flex max-h-[min(42dvh,24rem)] w-auto max-w-[680px] flex-col gap-2 overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel/95 px-3 py-2.5 shadow-xl backdrop-blur lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-3 lg:w-[min(92vw,680px)] lg:-translate-x-1/2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-bold text-accent">
            <GraduationCap size={14} aria-hidden /> 학습 실습 미션 · 약 {mission.minutes}분 · {STATUS_LABEL[status]}
          </p>
          <p className="mt-0.5 truncate text-xs font-bold text-fg" title={mission.title}>
            {mission.title}
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          aria-label="실습 미션 안내 닫기"
          onClick={() => setDismissed(true)}
        >
          <X size={14} aria-hidden /> 닫기
        </button>
      </div>

      <p className="text-[0.7rem] leading-relaxed text-fg-2">{mission.goal}</p>
      <p className="text-[0.7rem] leading-relaxed text-fg-3">과제: {mission.task}</p>

      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">실습 단계 확인</legend>
        {mission.steps.map((step, index) => (
          <label
            key={`${mission.id}-step-${index}`}
            className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-[0.7rem] text-fg-2 hover:bg-raised"
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-accent"
              checked={savedChecks.includes(index)}
              onChange={() => toggleStep(index)}
            />
            <span className={savedChecks.includes(index) ? "text-fg-3 line-through" : undefined}>
              {step}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span aria-live="polite" className="text-[0.7rem] font-semibold text-fg-2">
          단계 {doneCount}/{mission.steps.length} 완료
        </span>
        {status === "ready" ? (
          <button
            type="button"
            className={buttonClass}
            onClick={() => practice.completeCurrentMission(mission, learning.progress)}
          >
            <Check size={14} aria-hidden /> 미션 완료로 기록
          </button>
        ) : null}
        {status === "completed" ? (
          <button
            type="button"
            className={buttonClass}
            onClick={() => practice.reopenCurrentMission(mission.lessonId)}
          >
            <RotateCcw size={14} aria-hidden /> 다시 실습하기
          </button>
        ) : null}
      </div>

      {practice.warning ? (
        <p role="alert" className="text-[0.7rem] text-danger">
          {practice.warning}
        </p>
      ) : null}
    </section>
  );
}
