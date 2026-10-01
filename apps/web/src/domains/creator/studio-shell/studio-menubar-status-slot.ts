import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";

/**
 * 데스크톱 상단 바(메뉴바 동작 영역)에 저장·동기화 상태를 싣기 위한 자리.
 *
 * 저장 센터와 동기화 도우미는 메뉴바와 다른 렌더 가지(lazy 청크)에 있어 부모를 공유하지 않는다.
 * 메뉴바가 이 자리를 등록하면 두 상태 칩은 캔버스·인스펙터 위에 떠 있지 않고 상단 바 안에
 * 포털로 들어간다(Figma식 저장 상태). 메뉴바가 없는 화면(모바일·캔버스 전용·몰입)에서는
 * 자리가 없으므로 기존 부유 칩으로 남는다.
 */
export type StudioMenubarStatusSlotId = "sync" | "save";

const slots = new Map<StudioMenubarStatusSlotId, HTMLElement>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function registerSlot(id: StudioMenubarStatusSlotId, element: HTMLElement): () => void {
  slots.set(id, element);
  emit();
  return () => {
    // 같은 자리를 다른 메뉴바가 이미 넘겨받았다면 지우지 않는다.
    if (slots.get(id) !== element) return;
    slots.delete(id);
    emit();
  };
}

function createSlotRef(id: StudioMenubarStatusSlotId) {
  return (element: HTMLElement | null): (() => void) | undefined =>
    element ? registerSlot(id, element) : undefined;
}

/** 메뉴바가 자리 요소에 붙이는 ref. 모듈 수준 상수라 렌더마다 다시 등록되지 않는다. */
export const STUDIO_MENUBAR_STATUS_SLOT_REFS: Readonly<
  Record<StudioMenubarStatusSlotId, (element: HTMLElement | null) => (() => void) | undefined>
> = Object.freeze({
  sync: createSlotRef("sync"),
  save: createSlotRef("save"),
});

/** 등록된 상단 바 자리. 없으면 null(부유 칩으로 그린다). */
export function useStudioMenubarStatusSlot(id: StudioMenubarStatusSlotId): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => slots.get(id) ?? null,
    () => null,
  );
}

/** 상단 바 칩 아래로 여는 대화상자 여백(px). 칩과 붙어 보이되 겹치지 않는다. */
const POPOVER_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

export type StudioMenubarPopoverPosition = Pick<CSSProperties, "top" | "right">;

/** 칩 아래, 칩 오른쪽 끝에 맞춘 고정 좌표. 화면 오른쪽 여백은 최소 8px을 지킨다. */
export function studioMenubarPopoverPosition(
  anchor: DOMRect,
  viewportWidth: number,
): StudioMenubarPopoverPosition {
  return {
    top: Math.round(anchor.bottom + POPOVER_GAP_PX),
    right: Math.max(VIEWPORT_MARGIN_PX, Math.round(viewportWidth - anchor.right)),
  };
}

/**
 * 상단 바 칩의 대화상자는 메뉴바의 `overflow-hidden` 레인에 잘리지 않도록 body 로 포털하고,
 * 칩 아래 오른쪽 끝에 맞춰 고정 배치한다. 열려 있는 동안 창 크기 변화도 따라간다.
 * 좌표를 재기 전(null)에는 대화상자를 그리지 않아 엉뚱한 자리에서 깜박이지 않는다.
 */
export function useStudioMenubarPopoverPosition(
  anchorRef: RefObject<HTMLElement | null>,
  active: boolean,
): StudioMenubarPopoverPosition | null {
  const [position, setPosition] = useState<StudioMenubarPopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setPosition(null);
      return undefined;
    }
    const update = (): void => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setPosition(studioMenubarPopoverPosition(anchor.getBoundingClientRect(), window.innerWidth));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active, anchorRef]);

  return position;
}
