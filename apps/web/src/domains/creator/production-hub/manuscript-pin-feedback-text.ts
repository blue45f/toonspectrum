/**
 * 원고 뷰어 핀 피드백 — 표시용 텍스트 헬퍼 (순수 함수, React 비의존).
 *
 * 팝오버·사이드바·메인 컴포넌트가 공유하는 상태 라벨과 시간 포맷.
 */

import type { ManuscriptPinStatus } from "./manuscript-pin-feedback-model";

/** useBilingual 반환 함수 형태 */
export type ManuscriptPinBilingualFn = (ko: string, en: string) => string;

/** 핀 상태 → 한/영 라벨 */
export function manuscriptPinStatusLabel(
  bt: ManuscriptPinBilingualFn,
  status: ManuscriptPinStatus,
): string {
  switch (status) {
    case "resolved":
      return bt("해결됨", "Resolved");
    case "urgent":
      return bt("긴급", "Urgent");
    case "open":
    default:
      return bt("미해결", "Open");
  }
}

/** ISO 시각 → "9월 30일 14:05" 형태의 짧은 표시 */
export function formatManuscriptPinTime(bt: ManuscriptPinBilingualFn, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(bt("ko-KR", "en-US"), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return iso;
  }
}
