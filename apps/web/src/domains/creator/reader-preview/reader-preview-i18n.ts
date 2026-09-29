/**
 * 모바일 독자 뷰(Reader Preview) i18n 키.
 *
 * `studio-app-settings-center-i18n.ts` 와 같은 도메인 등록 패턴을 따른다.
 * `apps/web/src/app/i18n-source-coverage.test.ts` 가 이 모듈을 직접 import 하므로
 * 여기서 쓰는 모든 `reader.preview.*` 키는 ko/en 두 벌이 보장된다.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

export type ReaderPreviewCopyKey =
  | "reader.preview.title"
  | "reader.preview.toggleLabel"
  | "reader.preview.toggleHint"
  | "reader.preview.close"
  | "reader.preview.totalPages"
  | "reader.preview.totalScreens"
  | "reader.preview.checklistTitle"
  | "reader.preview.noWarnings"
  | "reader.preview.cutLabel"
  | "reader.preview.gapLabel"
  | "reader.preview.safeAreaLabel"
  | "reader.preview.screenUnit"
  | "reader.preview.autoScroll"
  | "reader.preview.play"
  | "reader.preview.pause"
  | "reader.preview.speedLabel"
  | "reader.preview.speed.slow"
  | "reader.preview.speed.normal"
  | "reader.preview.speed.fast"
  | "reader.preview.scrollPosition"
  | "reader.preview.gotoCurrentPage";

/** `{name}` 플레이스홀더를 값으로 치환한다. */
export function formatReaderPreviewText(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

registerI18nLocaleEntries("ko", {
  "reader.preview.title": "독자 뷰",
  "reader.preview.toggleLabel": "독자 뷰",
  "reader.preview.toggleHint":
    "실제 모바일 폭(390px)으로 세로 스크롤 독자 화면을 미리 봅니다. 컷 간격·대사 가독성·안전영역을 검사합니다.",
  "reader.preview.close": "닫기",
  "reader.preview.totalPages": "총 {count}페이지",
  "reader.preview.totalScreens": "약 {count}화면 분량",
  "reader.preview.checklistTitle": "읽기 검사",
  "reader.preview.noWarnings": "현재 분석에서 읽기 문제를 찾지 못했습니다.",
  "reader.preview.cutLabel": "{index}번째 컷",
  "reader.preview.gapLabel": "컷 간격 {gap}px",
  "reader.preview.safeAreaLabel": "안전영역",
  "reader.preview.screenUnit": "{count}화면",
  "reader.preview.autoScroll": "자동 스크롤",
  "reader.preview.play": "재생",
  "reader.preview.pause": "일시정지",
  "reader.preview.speedLabel": "스크롤 속도",
  "reader.preview.speed.slow": "천천히",
  "reader.preview.speed.normal": "보통",
  "reader.preview.speed.fast": "빠르게",
  "reader.preview.scrollPosition": "{position}화면째 읽는 중",
  "reader.preview.gotoCurrentPage": "현재 페이지로",
});

registerI18nLocaleEntries("en", {
  "reader.preview.title": "Reader view",
  "reader.preview.toggleLabel": "Reader view",
  "reader.preview.toggleHint":
    "Preview the vertical-scroll reader experience at a real mobile width (390px). Checks cut spacing, dialogue legibility, and safe areas.",
  "reader.preview.close": "Close",
  "reader.preview.totalPages": "{count} pages total",
  "reader.preview.totalScreens": "About {count} screens",
  "reader.preview.checklistTitle": "Reading checks",
  "reader.preview.noWarnings": "No reading issues found in the current analysis.",
  "reader.preview.cutLabel": "Cut {index}",
  "reader.preview.gapLabel": "Cut gap {gap}px",
  "reader.preview.safeAreaLabel": "Safe area",
  "reader.preview.screenUnit": "{count} screens",
  "reader.preview.autoScroll": "Auto-scroll",
  "reader.preview.play": "Play",
  "reader.preview.pause": "Pause",
  "reader.preview.speedLabel": "Scroll speed",
  "reader.preview.speed.slow": "Slow",
  "reader.preview.speed.normal": "Normal",
  "reader.preview.speed.fast": "Fast",
  "reader.preview.scrollPosition": "Reading screen {position}",
  "reader.preview.gotoCurrentPage": "Go to current page",
});
