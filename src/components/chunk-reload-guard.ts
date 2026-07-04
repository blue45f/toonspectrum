// 새 배포 후 오래된 페이지가 이미 삭제된 청크 파일명을 참조해 dynamic import가 실패하는
// 경우(Vite 콘텐츠 해시 파일명 특성상 흔함) — 컴포넌트 상태만 리셋하는 "다시 시도"로는
// 안 고쳐진다(같은 오래된 index.html 기반이라 또 같은 실패한 청크를 요청함). 실제로 필요한 건
// 브라우저가 최신 index.html/매니페스트를 다시 받아오는 전체 새로고침이다. 무한 새로고침
// 루프를 막기 위해 세션당 1회만 자동 시도한다 — error-boundary.tsx가 이 게이트를 쓴다.
export const CHUNK_RELOAD_FLAG = "toonspectrum:chunk-reload-attempted";

export function hasAttemptedChunkReload(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_FLAG) === "1";
  } catch {
    return false; // sessionStorage 접근 불가(프라이빗 모드 등) — 자동 재시도 없이 수동 UI로 폴백
  }
}

export function markChunkReloadAttempted(): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
  } catch {
    // 저장 실패해도 무시 — 최악의 경우 자동 재시도를 다시 하는 정도의 손해만 있다.
  }
}
