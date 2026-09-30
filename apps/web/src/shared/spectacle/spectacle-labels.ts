/**
 * 스펙터클 연출 UI 문구 (한/영).
 */

export type SpectacleEmptyKind = "empty" | "error" | "search" | "offline" | "success";

export interface SpectacleLabels {
  emptyTitle(kind: SpectacleEmptyKind): string;
  emptyDescription(kind: SpectacleEmptyKind): string;
  readonly retry: string;
  readonly goHome: string;
  readonly loading: string;
  readonly celebrate: string;
  readonly skipAnimation: string;
}

const EMPTY_TITLES_KO: Record<SpectacleEmptyKind, string> = {
  empty: "아직 비어 있어요",
  error: "앗, 문제가 생겼어요",
  search: "검색 결과가 없어요",
  offline: "연결이 끊겼어요",
  success: "완료됐어요!",
};

const EMPTY_TITLES_EN: Record<SpectacleEmptyKind, string> = {
  empty: "Nothing here yet",
  error: "Oops, something went wrong",
  search: "No results found",
  offline: "You're offline",
  success: "All done!",
};

const EMPTY_DESCRIPTIONS_KO: Record<SpectacleEmptyKind, string> = {
  empty: "첫 번째 항목을 만들어 보세요. 멋진 시작이 될 거예요.",
  error: "잠시 후 다시 시도해 주세요. 계속되면 지원팀에 알려주세요.",
  search: "다른 키워드로 검색하거나 필터를 조정해 보세요.",
  offline: "인터넷 연결을 확인하고 다시 시도해 주세요.",
  success: "수고했어요! 다음 단계로 넘어가 보세요.",
};

const EMPTY_DESCRIPTIONS_EN: Record<SpectacleEmptyKind, string> = {
  empty: "Create your first item. It'll be a great start.",
  error: "Please try again in a moment. Let support know if it persists.",
  search: "Try a different keyword or adjust the filters.",
  offline: "Check your connection and try again.",
  success: "Nice work! Let's move on to the next step.",
};

function makeLabels(ko: boolean): SpectacleLabels {
  return {
    emptyTitle: (kind) => (ko ? EMPTY_TITLES_KO[kind] : EMPTY_TITLES_EN[kind]),
    emptyDescription: (kind) =>
      ko ? EMPTY_DESCRIPTIONS_KO[kind] : EMPTY_DESCRIPTIONS_EN[kind],
    retry: ko ? "다시 시도" : "Try again",
    goHome: ko ? "홈으로" : "Go home",
    loading: ko ? "불러오는 중" : "Loading",
    celebrate: ko ? "축하하기" : "Celebrate",
    skipAnimation: ko ? "애니메이션 건너뛰기" : "Skip animation",
  };
}

export const SPECTACLE_LABELS_KO = makeLabels(true);
export const SPECTACLE_LABELS_EN = makeLabels(false);

/** 현재 언어에 맞는 라벨을 반환한다. */
export function getSpectacleLabels(lang: string): SpectacleLabels {
  return lang.startsWith("ko") ? SPECTACLE_LABELS_KO : SPECTACLE_LABELS_EN;
}
