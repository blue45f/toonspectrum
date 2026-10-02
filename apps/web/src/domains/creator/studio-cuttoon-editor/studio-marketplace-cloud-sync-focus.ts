import { useEffect, useRef } from "react";

/**
 * 마켓플레이스 클라우드 동기화 상태 알림의 포커스 복원.
 *
 * 재시도 버튼을 눌렀을 때의 포커스 원점을 기억해 두었다가, 재시도 결과로
 * 상태 알림이나 재시도 버튼이 다시 그려지면 포커스가 본문으로 사라진 경우에
 * 한해 새 대상에 포커스를 돌려준다. StudioCuttoonEditorChrome에서 분리했다.
 */
export interface StudioMarketplaceCloudSyncFocusInput {
  readonly densityShowsStatusRail: boolean;
  readonly error: unknown;
  readonly retry: unknown;
  readonly retryPending: boolean;
  readonly statusNotice: unknown;
}

export function useStudioMarketplaceCloudSyncFocus(
  input: StudioMarketplaceCloudSyncFocusInput,
) {
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const focusRestoreRef = useRef<{ origin: HTMLElement } | null>(null);
  useEffect(() => {
    const request = focusRestoreRef.current;
    if (!request || input.retryPending) return;
    const target: HTMLElement | null = input.retry
      ? retryButtonRef.current
      : statusRef.current;
    if (!target?.isConnected) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    const active = document.activeElement;
    if (
      active !== target &&
      (active === null ||
        active === document.body ||
        active === document.documentElement ||
        active === request.origin)
    ) {
      target.focus();
    }
    focusRestoreRef.current = null;
  }, [
    input.densityShowsStatusRail,
    input.error,
    input.retry,
    input.retryPending,
    input.statusNotice,
  ]);
  return { retryButtonRef, statusRef, focusRestoreRef };
}
