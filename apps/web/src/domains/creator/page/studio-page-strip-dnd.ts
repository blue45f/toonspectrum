import { useState, type DragEvent } from "react";

import {
  computeDropSlot,
  dropIndicatorFor,
  dropSlotToReorderTarget,
  isNoopDropSlot,
} from "../studio-page-dnd";

/**
 * 하단 페이지 스트립(가로 필름스트립)의 끌어서 순서 바꾸기.
 *
 * 세로 페이지 목록용 `useStudioPageDnd`와 같은 슬롯 계산(앞·뒤 절반, 제자리 드롭 무시)을 쓰되
 * 가로 배치라 포인터의 가로 위치로 슬롯을 정한다. 문서에는 손대지 않고 호출자가 넘긴
 * `onReorder(from, to)`만 부른다 — 저장·Undo 권위는 기존 페이지 관리 컨트롤러가 그대로 갖는다.
 */
const STRIP_PAGE_DND_MIME = "application/x-toonstudio-studio-page-strip";

export interface StudioPageStripDndItemProps {
  readonly draggable: boolean;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
}

export interface StudioPageStripDnd {
  /** 끌고 있는 페이지 index. 끌기가 없으면 null. */
  readonly dragIndex: number | null;
  /** 지금 가리키는 삽입 슬롯(페이지 사이 틈 0..count). */
  readonly dropSlot: number | null;
  readonly itemProps: (index: number) => StudioPageStripDndItemProps;
  /** index 카드의 앞(왼쪽)·뒤(오른쪽)에 그릴 삽입선. */
  readonly indicatorFor: (index: number) => "before" | "after" | null;
}

/** 읽는 방향이 오른쪽→왼쪽이면 카드 안의 앞·뒤 절반이 뒤집힌다. */
function isRightToLeft(element: HTMLElement): boolean {
  return typeof getComputedStyle === "function" && getComputedStyle(element).direction === "rtl";
}

/** 카드 안 가로 위치(0..1)로 삽입 슬롯을 정한다. */
export function stripDropSlotFromPointer(
  targetIndex: number,
  rect: Pick<DOMRect, "left" | "width">,
  clientX: number,
  rtl = false,
): number {
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  return computeDropSlot(targetIndex, rtl ? 1 - ratio : ratio);
}

export function useStudioPageStripDnd(
  count: number,
  onReorder: ((fromIndex: number, toIndex: number) => void) | undefined,
): StudioPageStripDnd {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const enabled = onReorder !== undefined;

  const reset = (): void => {
    setDragIndex(null);
    setDropSlot(null);
  };

  const slotFromEvent = (index: number, event: DragEvent<HTMLElement>): number =>
    stripDropSlotFromPointer(
      index,
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      isRightToLeft(event.currentTarget),
    );

  const itemProps = (index: number): StudioPageStripDndItemProps => ({
    draggable: enabled,
    onDragStart: (event) => {
      if (!onReorder) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(STRIP_PAGE_DND_MIME, String(index));
      // Firefox는 text 데이터가 없으면 끌기를 시작하지 않는다.
      event.dataTransfer.setData("text/plain", String(index));
      setDragIndex(index);
      setDropSlot(null);
    },
    onDragOver: (event) => {
      if (!onReorder || dragIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const slot = slotFromEvent(index, event);
      setDropSlot((previous) => (previous === slot ? previous : slot));
    },
    onDrop: (event) => {
      if (!onReorder || dragIndex === null) return;
      event.preventDefault();
      const slot = slotFromEvent(index, event);
      if (!isNoopDropSlot(dragIndex, slot)) {
        onReorder(dragIndex, dropSlotToReorderTarget(dragIndex, slot));
      }
      reset();
    },
    onDragEnd: reset,
  });

  return {
    dragIndex,
    dropSlot,
    itemProps,
    indicatorFor: (index) => dropIndicatorFor(index, count, dragIndex, dropSlot),
  };
}
