import { useLayoutEffect, type RefObject } from "react";

/**
 * 화면 아래에 고정된 알림(서비스 연결 칩·상태 배너·오프라인 알림)의 점유 높이를 :root 변수로 게시한다.
 * OST 알약·베타 안내·홍보 카드처럼 같은 하단 영역을 쓰는 요소는 이 값 위로 올라가
 * 알림의 문구와 조작부(다시 확인·상태 자세히)를 가리지 않는다.
 *
 * 알림이 둘 이상이면 가장 높은 값 하나만 게시하고, 알림이 모두 사라지면 처음 값으로 되돌린다.
 */
export const OVERLAY_CLEARANCE_PROPERTY = "--service-status-overlay-clearance";

/** 알림 윗변과 그 위에 올라가는 요소 사이의 간격. */
const CLEARANCE_GAP_PX = 12;

const claims = new Map<symbol, number>();
/** 첫 게시 직전 :root 에 인라인으로 있던 값(보통 비어 있다). */
let valueBeforeClaims = "";

function publishClearance(root: HTMLElement): void {
  if (claims.size === 0) {
    if (valueBeforeClaims) root.style.setProperty(OVERLAY_CLEARANCE_PROPERTY, valueBeforeClaims);
    else root.style.removeProperty(OVERLAY_CLEARANCE_PROPERTY);
    return;
  }
  root.style.setProperty(OVERLAY_CLEARANCE_PROPERTY, `${Math.max(0, ...claims.values())}px`);
}

/**
 * 고정 위치 요소가 화면 아래에서 차지하는 높이(윗변 위 12px 포함)를 게시한다.
 * 문서 흐름 안의 요소(position이 fixed가 아니거나 높이가 0)는 0으로 센다. 반환값으로 해제한다.
 */
export function claimOverlayClearance(element: HTMLElement): () => void {
  const root = element.ownerDocument.documentElement;
  const view = element.ownerDocument.defaultView ?? window;
  const id = Symbol("overlay-clearance");

  const measure = () => {
    const bounds = element.getBoundingClientRect();
    const fixed = view.getComputedStyle(element).position === "fixed" && bounds.height > 0;
    claims.set(id, fixed ? Math.max(0, Math.ceil(view.innerHeight - bounds.top + CLEARANCE_GAP_PX)) : 0);
    publishClearance(root);
  };

  if (claims.size === 0) valueBeforeClaims = root.style.getPropertyValue(OVERLAY_CLEARANCE_PROPERTY);
  measure();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  observer?.observe(element);
  view.addEventListener("resize", measure);

  return () => {
    observer?.disconnect();
    view.removeEventListener("resize", measure);
    claims.delete(id);
    publishClearance(root);
  };
}

/**
 * `enabled`인 동안 `ref` 요소의 점유 높이를 게시한다.
 * 요소의 크기는 그대로인데 위치만 바뀌는 경우(접힘·펼침)는 `remeasureKey`를 바꿔 다시 잰다.
 */
export function useOverlayClearance(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  remeasureKey?: unknown,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return undefined;
    return claimOverlayClearance(element);
  }, [ref, enabled, remeasureKey]);
}
