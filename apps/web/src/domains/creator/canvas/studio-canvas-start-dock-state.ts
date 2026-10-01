import { useSyncExternalStore } from "react";

/**
 * 빈 캔버스 시작 도크가 지금 펼쳐져 있는지.
 *
 * 도크(캔버스), 첫 사용 코치(캔버스 HUD), 인스펙터 시작 카드는 서로 다른 렌더 가지에 있다.
 * 도크가 펼쳐진 동안에는 도크가 유일한 시작 안내가 되도록 나머지 둘이 이 값을 보고 물러난다.
 * 화면 표시 조정용 값이라 저장하지 않는다.
 */
let dockExpanded = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setStudioCanvasStartDockExpanded(next: boolean): void {
  if (dockExpanded === next) return;
  dockExpanded = next;
  for (const listener of listeners) listener();
}

export function useStudioCanvasStartDockExpanded(): boolean {
  return useSyncExternalStore(subscribe, () => dockExpanded, () => false);
}
