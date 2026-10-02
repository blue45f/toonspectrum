/**
 * 연재 런치 위저드 모델 — 실제 웹툰 연재 과정을 단계별로 안내한다.
 *
 * 실제 연재 파이프라인(기획 → 시리즈 개설 → 회차 제작 → 발행 점검 → 연재 시작)을
 * 5단계 위저드로 구조화한다. 모든 함수는 순수 함수이며 UI 프레임워크에 의존하지 않는다.
 */
import type { SeriesInput } from "@/platform/creator-client";

/** 위저드 단계 ID. 실제 연재 과정의 순서와 일치한다. */
export type SeriesLaunchStepId = "plan" | "series" | "episode" | "review" | "launch";

export const SERIES_LAUNCH_STEPS: readonly SeriesLaunchStepId[] = [
  "plan",
  "series",
  "episode",
  "review",
  "launch",
];

/** 실제 웹툰 플랫폼에서 사용하는 대표 장르. */
export const SERIES_LAUNCH_GENRES = [
  "romance",
  "fantasy",
  "action",
  "drama",
  "thriller",
  "comedy",
  "daily",
  "school",
  "martial",
  "sf",
  "horror",
  "sports",
] as const;

export type SeriesLaunchGenre = (typeof SERIES_LAUNCH_GENRES)[number];

/** 선택 상자의 값을 장르로 좁힌다. 목록에 없는 값(빈 선택 포함)은 null. */
export function parseLaunchGenre(value: string): SeriesLaunchGenre | null {
  return SERIES_LAUNCH_GENRES.find((genre) => genre === value) ?? null;
}

/** 연재 요일 (0=일 … 6=토). */
export const SERIES_LAUNCH_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * 위저드 초안 — 각 단계에서 모은 입력.
 * plan: 기획 / series: 시리즈 개설 / episode: 첫 회차 준비 /
 * review: 발행 점검 / launch: 연재 시작.
 */
export interface SeriesLaunchDraft {
  /** 1단계: 장르 */
  readonly genre: SeriesLaunchGenre | null;
  /** 1단계: 한 줄 소개 (로그라인) */
  readonly logline: string;
  /** 1단계: 시놉시스 */
  readonly synopsis: string;
  /** 1단계: 타겟 독자 */
  readonly targetAudience: string;
  /** 1단계: 목표 연재 요일 */
  readonly cadenceWeekday: number | null;
  /** 2단계: 시리즈 제목 */
  readonly title: string;
  /** 2단계: 시리즈 소개 */
  readonly description: string;
  /** 2단계: 태그 */
  readonly tags: readonly string[];
  /** 2단계: 커버 이미지 URL (선택) */
  readonly cover: string;
  /** 3단계: 첫 회차 제목 */
  readonly episodeTitle: string;
  /** 3단계: 원고 업로드 완료 여부 (외부 업로드 플로우에서 설정) */
  readonly episodePagesReady: boolean;
  /** 3단계: 회차 썸네일 준비 여부 */
  readonly episodeThumbnailReady: boolean;
  /** 4단계: 발행 규격 점검 통과 여부 */
  readonly specCheckPassed: boolean;
  /** 4단계: 예약 발행 설정 여부 (즉시 발행이면 true로 간주) */
  readonly scheduleDecided: boolean;
}

export function createEmptyLaunchDraft(): SeriesLaunchDraft {
  return {
    genre: null,
    logline: "",
    synopsis: "",
    targetAudience: "",
    cadenceWeekday: null,
    title: "",
    description: "",
    tags: [],
    cover: "",
    episodeTitle: "",
    episodePagesReady: false,
    episodeThumbnailReady: false,
    specCheckPassed: false,
    scheduleDecided: false,
  };
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * 단계별 완료 여부.
 * - plan: 장르 + 로그라인 + 시놉시스 입력
 * - series: 제목 입력 (2자 이상)
 * - episode: 첫 회차 제목 + 원고 준비
 * - review: 규격 점검 + 발행 일정 결정
 * - launch: 앞의 모든 단계 완료
 */
export function isLaunchStepComplete(
  draft: SeriesLaunchDraft,
  stepId: SeriesLaunchStepId
): boolean {
  switch (stepId) {
    case "plan":
      return draft.genre !== null && nonEmpty(draft.logline) && nonEmpty(draft.synopsis);
    case "series":
      return draft.title.trim().length >= 2;
    case "episode":
      return nonEmpty(draft.episodeTitle) && draft.episodePagesReady;
    case "review":
      return draft.specCheckPassed && draft.scheduleDecided;
    case "launch":
      return SERIES_LAUNCH_STEPS.filter((s) => s !== "launch").every((s) =>
        isLaunchStepComplete(draft, s)
      );
  }
}

export interface LaunchProgress {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
}

/** 전체 진행률 (launch 단계 제외 4단계 기준). */
export function getLaunchProgress(draft: SeriesLaunchDraft): LaunchProgress {
  const steps = SERIES_LAUNCH_STEPS.filter((s) => s !== "launch");
  const completed = steps.filter((s) => isLaunchStepComplete(draft, s)).length;
  return {
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
  };
}

/** 다음으로 할 일 — 아직 완료되지 않은 가장 앞 단계. */
export function getNextIncompleteStep(
  draft: SeriesLaunchDraft
): SeriesLaunchStepId | null {
  for (const stepId of SERIES_LAUNCH_STEPS) {
    if (!isLaunchStepComplete(draft, stepId)) return stepId;
  }
  return null;
}

/** 특정 단계로 이동 가능한지 (이전 단계가 모두 완료되어야 함). */
export function canNavigateToStep(
  draft: SeriesLaunchDraft,
  stepId: SeriesLaunchStepId
): boolean {
  const index = SERIES_LAUNCH_STEPS.indexOf(stepId);
  if (index <= 0) return true;
  return SERIES_LAUNCH_STEPS.slice(0, index).every((s) =>
    isLaunchStepComplete(draft, s)
  );
}

export interface LaunchIssue {
  readonly stepId: SeriesLaunchStepId;
  readonly field: string;
  readonly messageKey: string;
}

/** 발행 전 최종 점검 — 미비 항목 목록. */
export function validateLaunchDraft(draft: SeriesLaunchDraft): LaunchIssue[] {
  const issues: LaunchIssue[] = [];
  if (draft.genre === null) {
    issues.push({ stepId: "plan", field: "genre", messageKey: "studio.seriesLaunch.issue.genre" });
  }
  if (!nonEmpty(draft.logline)) {
    issues.push({ stepId: "plan", field: "logline", messageKey: "studio.seriesLaunch.issue.logline" });
  }
  if (!nonEmpty(draft.synopsis)) {
    issues.push({ stepId: "plan", field: "synopsis", messageKey: "studio.seriesLaunch.issue.synopsis" });
  }
  if (draft.title.trim().length < 2) {
    issues.push({ stepId: "series", field: "title", messageKey: "studio.seriesLaunch.issue.title" });
  }
  if (!nonEmpty(draft.episodeTitle)) {
    issues.push({ stepId: "episode", field: "episodeTitle", messageKey: "studio.seriesLaunch.issue.episodeTitle" });
  }
  if (!draft.episodePagesReady) {
    issues.push({ stepId: "episode", field: "pages", messageKey: "studio.seriesLaunch.issue.pages" });
  }
  if (!draft.specCheckPassed) {
    issues.push({ stepId: "review", field: "spec", messageKey: "studio.seriesLaunch.issue.spec" });
  }
  if (!draft.scheduleDecided) {
    issues.push({ stepId: "review", field: "schedule", messageKey: "studio.seriesLaunch.issue.schedule" });
  }
  return issues;
}

/** 위저드 초안을 시리즈 생성 입력으로 변환. */
export function toSeriesInput(draft: SeriesLaunchDraft): SeriesInput {
  const descriptionParts = [draft.description.trim()];
  if (nonEmpty(draft.logline)) {
    descriptionParts.unshift(draft.logline.trim());
  }
  return {
    title: draft.title.trim(),
    description: descriptionParts.filter(Boolean).join("\n\n"),
    cover: draft.cover.trim() || undefined,
    tags: draft.tags.length > 0 ? [...draft.tags] : undefined,
    status: "ongoing",
  };
}

/** 태그 문자열(쉼표 구분)을 배열로 파싱. 최대 8개. */
export function parseLaunchTags(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}
