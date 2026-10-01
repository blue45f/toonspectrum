/**
 * 하단 페이지 스트립(필름스트립)의 첫 표시 여부.
 *
 * 참고 보드의 캔버스 편집기처럼 넓은 데스크톱(1280px 이상)에서는 페이지 흐름이 항상 보이도록
 * 펼친 채로 시작한다. 그보다 좁은 화면과 터치 기기에서는 캔버스 높이를 지키려고 접어 둔다
 * (메뉴바 '페이지' 버튼·하단 편집 도크로 언제든 연다). 세션 동안만 쓰는 화면 상태라 저장하지 않는다.
 */
export const STUDIO_PAGE_SEQUENCE_DEFAULT_OPEN_QUERY = "(min-width: 80rem) and (pointer: fine)";

export function studioPageSequenceOpenByDefault(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(STUDIO_PAGE_SEQUENCE_DEFAULT_OPEN_QUERY).matches;
}
