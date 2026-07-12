/**
 * 전용 컷툰 편집기는 자체 풀스크린 셸과 로딩 상태를 소유한다. 앱 인트로를 그 위에 다시
 * 올리면 첫 펜 입력을 최대 2.8초 막고, 선택된 인트로에 따라 Three.js까지 요청하므로 생략한다.
 * 게시용 upload 모드는 기존 사이트 흐름을 유지하므로 query까지 함께 판별한다.
 */
export function shouldRenderAppSplash(pathname: string, search = ""): boolean {
  if (pathname !== "/studio" && pathname !== "/studio/") return true;
  return new URLSearchParams(search).get("mode") === "upload";
}
