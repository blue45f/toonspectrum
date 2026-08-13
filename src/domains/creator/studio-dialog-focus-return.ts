/**
 * 다이얼로그 포커스 복귀 — 한 군데서.
 *
 * 브라우저 실측(2026-08-08, `dist` 프리뷰): 도움말 9개 표면 중 트리거로 포커스가
 * 돌아온 것은 `사용법 · 기능 튜토리얼`·`단축키 · 기본 조작` 둘뿐이고 나머지 일곱은
 * `document.body` 로 떨어졌다. 원인은 "복원 로직이 없다"가 아니라 **복원 계약이 손으로
 * 복제돼 있다**는 것이다 — `openerRef = document.activeElement` … `opener.focus()` 쌍이
 * `StudioShortcutsHelp`·`StudioFeatureTutorialHub`·`StudioQuickComicWizard`·
 * `StudioCheckpointPanel`·`StudioSceneSnapshotDialog` 다섯 파일에 각각 적혀 있고,
 * 나중에 들어온 도움말 센터와 통합 검색 다이얼로그가 그 복제를 빠뜨렸다.
 * 복제본을 하나 더 늘리면 다음 다이얼로그가 또 빠뜨린다.
 *
 * 그래서 이 모듈은 **다이얼로그마다 기억하게 하지 않는다.** 스튜디오 루트에서 한 번
 * 설치되어, `document.body` 로 포털된 `aria-modal="true"` 표면이 붙고 떨어지는 것을
 * 보고 있다가 **포커스가 실제로 바닥(body)으로 떨어졌을 때만** 열어 준 컨트롤로 되돌린다.
 *
 * 자기 복원을 이미 가진 다이얼로그와 싸우지 않는 이유가 그 "바닥일 때만" 조건이다.
 * 그런 다이얼로그는 언마운트 정리에서 스스로 트리거를 잡거나(이 관찰자보다 늦게 돌아도
 * 마지막 쓰기가 이긴다) 이미 잡아 두었으므로, 관찰자는 아무것도 하지 않거나 같은 곳을
 * 가리킨다. 즉 이 그물은 **떨어뜨렸을 때만** 받는다.
 *
 * 관찰 범위는 `body` 의 직계 자식(`subtree: false`)뿐이다. 포털 루트가 정확히 그 자리에
 * 붙기 때문에 캔버스·패널의 잦은 DOM 변경을 한 건도 보지 않는다(핫패스 비용 0).
 *
 * 판정을 **한 번이 아니라 세 시점에** 반복하는 이유는 `restoreWhenSettled` 주석에 있다 —
 * 요약하면 포털이 사라진 그 순간이 항상 "되돌리기 좋은 순간"은 아니기 때문이다. 반복되는
 * 것은 판정이지 복원이 아니다: 매번 "바닥일 때만" 조건을 다시 보므로, 이미 제자리면 전부
 * 무동작이고 다른 다이얼로그의 자기 복원을 덮어쓰지 않는 계약도 그대로다.
 */

const MODAL_SELECTOR = '[aria-modal="true"]';

/** 트리거를 잃어버린 다이얼로그가 착지할 마지막 앵커. 바닥보다는 메뉴바가 낫다. */
const FALLBACK_ANCHOR_SELECTOR = "[data-studio-main-menu-trigger]";

function asElement(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : null;
}

function modalWithin(root: Element): Element | null {
  if (root.matches(MODAL_SELECTOR)) return root;
  return root.querySelector(MODAL_SELECTOR);
}

function insideModal(element: Element): boolean {
  return element.closest(MODAL_SELECTOR) !== null;
}

/** 포커스를 돌려받을 수 있는 컨트롤인가. 사라졌거나 inert 가 된 트리거는 후보가 아니다. */
export function canReturnStudioDialogFocus(
  element: Element | null,
  ownerDocument: Document,
): element is HTMLElement {
  if (!element) return false;
  const candidate = element as HTMLElement;
  if (typeof candidate.focus !== "function") return false;
  if (!candidate.isConnected) return false;
  if (candidate === ownerDocument.body) return false;
  if (candidate === ownerDocument.documentElement) return false;
  if (candidate.closest("[inert], [hidden], [aria-hidden='true']")) return false;
  if ("disabled" in candidate && Boolean((candidate as HTMLButtonElement).disabled)) {
    return false;
  }
  return true;
}

/** 포커스가 "아무 데도 없는" 상태인가. 이때만 그물이 받는다. */
export function studioDialogFocusWasDropped(ownerDocument: Document): boolean {
  const active = ownerDocument.activeElement;
  return (
    active === null ||
    active === ownerDocument.body ||
    active === ownerDocument.documentElement
  );
}

/**
 * 다이얼로그를 연 컨트롤을 되찾는다.
 *
 * 우선순위: 지금 포커스를 쥔 모달 밖 컨트롤 → 모달이 뜨기 직전 마지막 모달 밖 포커스 →
 * 메뉴바 첫 트리거. 두 번째 후보가 필요한 이유는, 다이얼로그가 레이아웃 이펙트에서
 * 곧바로 자기 안쪽을 포커스하면 관찰 시점의 `activeElement` 가 이미 다이얼로그 안이기
 * 때문이다.
 */
export function resolveStudioDialogOpener(
  ownerDocument: Document,
  lastOutsideFocus: Element | null,
): HTMLElement | null {
  const active = ownerDocument.activeElement;
  if (
    active !== null &&
    !insideModal(active) &&
    canReturnStudioDialogFocus(active, ownerDocument)
  ) {
    return active;
  }
  if (canReturnStudioDialogFocus(lastOutsideFocus, ownerDocument)) {
    return lastOutsideFocus;
  }
  return null;
}

/**
 * 트리거를 특정할 수 없을 때 착지할 곳. 스스로 뜨는 표면(빠른 시작 코치)은 애초에
 * "열어 준 컨트롤"이 없으므로 이 앵커가 유일한 정답이다 — 바닥으로 떨어뜨리면
 * 키보드 사용자는 문서 맨 앞부터 다시 Tab 해야 한다.
 */
export function studioDialogFocusAnchor(ownerDocument: Document): HTMLElement | null {
  const anchor = ownerDocument.querySelector<HTMLElement>(FALLBACK_ANCHOR_SELECTOR);
  return canReturnStudioDialogFocus(anchor, ownerDocument) ? anchor : null;
}

/** 실제로 포커스를 되돌린다. 되돌릴 곳이 없으면 아무것도 하지 않고 false. */
export function returnStudioDialogFocus(
  opener: Element | null,
  ownerDocument: Document,
): boolean {
  const target = canReturnStudioDialogFocus(opener, ownerDocument)
    ? opener
    : studioDialogFocusAnchor(ownerDocument);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

let installed: (() => void) | null = null;

/**
 * 스튜디오 루트에서 한 번 설치한다. 이미 설치돼 있으면 기존 해제자를 그대로 돌려준다 —
 * 호스트가 두 번 마운트돼도 관찰자가 겹치지 않는다(`installStudioErrorJournal` 과 같은 계약).
 */
export function installStudioDialogFocusReturn(
  ownerDocument: Document | null = typeof document === "undefined" ? null : document,
): () => void {
  if (installed) return installed;
  const view = ownerDocument?.defaultView ?? null;
  const Observer = view?.MutationObserver ?? null;
  const body = ownerDocument?.body ?? null;
  if (!ownerDocument || !body || !Observer || !view) return () => undefined;

  const openers = new Map<Element, HTMLElement | null>();
  let lastOutsideFocus: Element | null = null;
  // `view.setTimeout`/`requestAnimationFrame` 은 DOM 쪽 시그니처라 number 를 돌려준다
  // (@types/node 의 Timeout 이 아니다).
  let settleTimer: number | null = null;
  let settleFrame: number | null = null;

  const cancelSettle = () => {
    if (settleTimer !== null) view.clearTimeout(settleTimer);
    if (settleFrame !== null) view.cancelAnimationFrame(settleFrame);
    settleTimer = null;
    settleFrame = null;
  };

  /** "바닥일 때만" 조건을 지킨 채 한 번 되돌린다. */
  const restoreIfDropped = (opener: Element | null) => {
    if (!studioDialogFocusWasDropped(ownerDocument)) return;
    returnStudioDialogFocus(opener, ownerDocument);
  };

  /**
   * 세 시점에 같은 판정을 반복한다 — 지금, 다음 매크로태스크, 다음 프레임.
   * 매번 "바닥일 때만" 조건을 다시 보므로 이미 제자리면 전부 무동작이다.
   *
   * 왜 한 번으로 안 되는가(둘 다 브라우저 실측 2026-08-13):
   *  - 백드롭 클릭: 1차 복원 **직후** 같은 입력의 `mousedown` 기본 동작이 포커스를 다시
   *    body 로 떨어뜨린다. 늦은 확인이 그걸 주워야 한다.
   *  - 기능 튜토리얼: 이 다이얼로그는 열릴 때 `body` 의 다른 자식을 전부 `inert` 로 만들고
   *    **자기 정리(passive effect)에서** 되돌린다. 포털이 사라진 직후에는 메뉴바가 아직
   *    inert 라서 되돌릴 후보가 하나도 없다(`canReturnStudioDialogFocus` 가 전부 거른다).
   *    정리가 끝난 뒤 다시 봐야 트리거를 잡는다.
   */
  const restoreWhenSettled = (opener: Element | null) => {
    cancelSettle();
    restoreIfDropped(opener);
    settleTimer = view.setTimeout(() => {
      settleTimer = null;
      restoreIfDropped(opener);
    }, 0);
    settleFrame = view.requestAnimationFrame(() => {
      settleFrame = null;
      restoreIfDropped(opener);
    });
  };

  const onFocusIn = (event: Event) => {
    const target = asElement(event.target as Node);
    if (!target || insideModal(target)) return;
    if (target === ownerDocument.body) return;
    lastOutsideFocus = target;
  };

  const observer = new Observer((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        const element = asElement(node);
        if (!element || !modalWithin(element)) continue;
        openers.set(element, resolveStudioDialogOpener(ownerDocument, lastOutsideFocus));
      }
    }

    let pendingOpener: Element | null = null;
    let pendingRestore = false;
    for (const record of records) {
      for (const node of record.removedNodes) {
        const element = asElement(node);
        if (!element || !openers.has(element)) continue;
        // 가장 나중에 열린 표면의 트리거가 이긴다(중첩 모달이 한 커밋에서 함께 사라질 때).
        pendingOpener = openers.get(element) ?? null;
        pendingRestore = true;
        openers.delete(element);
      }
    }
    if (!pendingRestore) return;
    restoreWhenSettled(pendingOpener);
  });

  ownerDocument.addEventListener("focusin", onFocusIn, true);
  observer.observe(body, { childList: true });

  installed = () => {
    ownerDocument.removeEventListener("focusin", onFocusIn, true);
    observer.disconnect();
    cancelSettle();
    openers.clear();
    installed = null;
  };
  return installed;
}
