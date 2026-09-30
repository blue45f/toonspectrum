/** motion-assets 공용 문구 (ko/en). */

export type MotionAssetLang = "ko" | "en";

export interface MotionAssetLabels {
  emptySearchTitle: string;
  emptySearchDescription: string;
  emptyDataTitle: string;
  emptyDataDescription: string;
  emptyErrorTitle: string;
  emptyErrorDescription: string;
  emptyLoadingTitle: string;
  emptyLoadingDescription: string;
  emptyActionFallback: string;
  stepOf: (current: number, total: number) => string;
  gaugeOf: (value: number, max: number) => string;
}

const KO: MotionAssetLabels = {
  emptySearchTitle: "검색 결과가 없어요",
  emptySearchDescription: "다른 키워드로 검색하거나 필터를 바꿔 보세요.",
  emptyDataTitle: "아직 데이터가 없어요",
  emptyDataDescription: "첫 번째 항목을 만들어 시작해 보세요.",
  emptyErrorTitle: "문제가 발생했어요",
  emptyErrorDescription: "잠시 후 다시 시도해 주세요. 계속되면 새로고침해 보세요.",
  emptyLoadingTitle: "불러오는 중이에요",
  emptyLoadingDescription: "잠시만 기다려 주세요.",
  emptyActionFallback: "다시 시도",
  stepOf: (current, total) => `${total}단계 중 ${current}단계`,
  gaugeOf: (value, max) => `${max} 중 ${value}`,
};

const EN: MotionAssetLabels = {
  emptySearchTitle: "No results found",
  emptySearchDescription: "Try a different keyword or adjust the filters.",
  emptyDataTitle: "Nothing here yet",
  emptyDataDescription: "Create your first item to get started.",
  emptyErrorTitle: "Something went wrong",
  emptyErrorDescription: "Please try again in a moment. Refresh if it keeps happening.",
  emptyLoadingTitle: "Loading",
  emptyLoadingDescription: "Please wait a moment.",
  emptyActionFallback: "Try again",
  stepOf: (current, total) => `Step ${current} of ${total}`,
  gaugeOf: (value, max) => `${value} of ${max}`,
};

export function getMotionAssetLabels(lang: MotionAssetLang): MotionAssetLabels {
  return lang === "en" ? EN : KO;
}

/** lang 문자열("ko-KR" 등)을 MotionAssetLang으로 정규화. */
export function normalizeMotionAssetLang(lang: string): MotionAssetLang {
  return lang.toLowerCase().startsWith("en") ? "en" : "ko";
}
