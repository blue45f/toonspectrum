import { lazy, type ComponentType } from "react";

// ── 청크 로드 재시도 ──
// 배포로 청크 해시가 바뀌면 이전 세션의 lazy import가 404로 실패한다. 그 경우 1회만
// 자동 새로고침해 새 해시를 받아오고, 새로고침 후에도 같은 청크가 또 실패하면(2차)
// 그대로 throw해 ErrorBoundary가 받게 한다. 가드는 sessionStorage 청크별 키로 추적한다.

function hasReloadGuard(key: string): boolean {
  try {
    return globalThis.sessionStorage.getItem(key) !== null;
  } catch {
    return true; // 저장소 차단 환경 — 추적이 불가하면 이미 리로드한 것으로 간주해 루프를 차단
  }
}

function armReloadGuard(key: string): boolean {
  try {
    globalThis.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false; // 가드를 세우지 못하면 리로드하지 않는다(무한 리로드 방지)
  }
}

function clearReloadGuard(key: string) {
  try {
    globalThis.sessionStorage.removeItem(key);
  } catch {
    // 저장소 차단 환경 — 세워둔 가드도 없으므로 무시
  }
}

/**
 * React.lazy + 배포 청크 실패 1회 자동복구. chunkId는 sessionStorage 키에 쓰이므로
 * 같은 페이지 안에서 다른 lazy 청크와 겹치지 않는 이름을 준다(보통 컴포넌트 이름).
 *
 * 제약을 ComponentType<any>로 두는 건 React 자체의 lazy() 시그니처와 동일한 선택이다 —
 * unknown으로 좁히면 함수 컴포넌트 Props의 반공변성 때문에 각 호출부의 구체적 Props 타입이
 * 제약을 만족하지 못해 T가 추론되지 않고 never로 무너진다(실사용 시 대량 타입 에러로 드러남).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, chunkId: string) {
  return lazy(async () => {
    const guardKey = `chunk-reload:${chunkId}`;
    try {
      const mod = await load();
      clearReloadGuard(guardKey); // 성공 시 해제 — 다음 배포 실패 때 다시 1회 재시도할 수 있다
      return mod;
    } catch (error) {
      // 이미 1회 리로드했거나 가드를 세울 수 없으면 그대로 던져 ErrorBoundary로 보낸다.
      if (hasReloadGuard(guardKey) || !armReloadGuard(guardKey)) throw error;
      globalThis.location.reload(); // 가드를 유지한 채 새로고침 — 같은 청크의 자동 리로드를 1회로 제한
      return await new Promise<never>(() => {}); // 리로드가 끝날 때까지 Suspense fallback 유지
    }
  });
}
