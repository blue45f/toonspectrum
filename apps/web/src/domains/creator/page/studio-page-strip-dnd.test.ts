// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { stripDropSlotFromPointer, useStudioPageStripDnd } from "./studio-page-strip-dnd";

const RECT = { left: 100, width: 100 } as const;

/** 실제 DOM 요소를 currentTarget 으로 쓴다(훅이 computed direction 을 읽는다). */
function dragEvent(clientX: number, rect: { left: number; width: number } = RECT): DragEvent<HTMLElement> {
  const target = document.createElement("li");
  target.getBoundingClientRect = () => ({ ...rect }) as DOMRect;
  return {
    clientX,
    currentTarget: target,
    dataTransfer: { effectAllowed: "none", dropEffect: "none", setData: vi.fn() },
    preventDefault: vi.fn(),
  } as unknown as DragEvent<HTMLElement>;
}

describe("stripDropSlotFromPointer", () => {
  it("카드의 왼쪽 절반은 앞, 오른쪽 절반은 뒤 슬롯이다", () => {
    expect(stripDropSlotFromPointer(2, RECT, 120)).toBe(2);
    expect(stripDropSlotFromPointer(2, RECT, 180)).toBe(3);
  });

  it("오른쪽→왼쪽 문서에서는 절반이 뒤집힌다", () => {
    expect(stripDropSlotFromPointer(2, RECT, 120, true)).toBe(3);
    expect(stripDropSlotFromPointer(2, RECT, 180, true)).toBe(2);
  });

  it("너비가 0인 카드는 앞 슬롯으로 처리한다", () => {
    expect(stripDropSlotFromPointer(1, { left: 0, width: 0 }, 50)).toBe(1);
  });
});

describe("useStudioPageStripDnd", () => {
  it("순서 바꾸기 핸들러가 없으면 끌 수 없다", () => {
    const { result } = renderHook(() => useStudioPageStripDnd(3, undefined));
    expect(result.current.itemProps(0).draggable).toBe(false);
    const event = dragEvent(120);
    act(() => result.current.itemProps(0).onDragStart(event));
    expect(result.current.dragIndex).toBeNull();
    expect(event.dataTransfer.setData).not.toHaveBeenCalled();
  });

  it("앞 페이지를 뒤 카드의 오른쪽 절반에 놓으면 제거 후 삽입 index로 옮긴다", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useStudioPageStripDnd(4, onReorder));

    act(() => result.current.itemProps(0).onDragStart(dragEvent(120)));
    expect(result.current.dragIndex).toBe(0);

    act(() => result.current.itemProps(2).onDragOver(dragEvent(180)));
    expect(result.current.dropSlot).toBe(3);
    // 카드 2의 오른쪽 절반은 "카드 3 앞" 슬롯이라 삽입선은 카드 3의 앞에 그린다.
    expect(result.current.indicatorFor(2)).toBeNull();
    expect(result.current.indicatorFor(3)).toBe("before");

    const drop = dragEvent(180);
    act(() => result.current.itemProps(2).onDrop(drop));
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(result.current.dragIndex).toBeNull();
    expect(result.current.dropSlot).toBeNull();
  });

  it("마지막 카드의 오른쪽 절반은 그 카드 뒤에 삽입선을 그리고 맨 뒤로 옮긴다", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useStudioPageStripDnd(3, onReorder));

    act(() => result.current.itemProps(0).onDragStart(dragEvent(120)));
    act(() => result.current.itemProps(2).onDragOver(dragEvent(180)));
    expect(result.current.dropSlot).toBe(3);
    expect(result.current.indicatorFor(2)).toBe("after");
    act(() => result.current.itemProps(2).onDrop(dragEvent(180)));
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("뒤 페이지를 앞 카드의 왼쪽 절반에 놓으면 그 카드 자리로 옮긴다", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useStudioPageStripDnd(4, onReorder));

    act(() => result.current.itemProps(3).onDragStart(dragEvent(120)));
    act(() => result.current.itemProps(1).onDragOver(dragEvent(120)));
    expect(result.current.indicatorFor(1)).toBe("before");
    act(() => result.current.itemProps(1).onDrop(dragEvent(120)));
    expect(onReorder).toHaveBeenCalledWith(3, 1);
  });

  it("제자리(자기 앞·뒤 슬롯)에 놓으면 아무것도 바꾸지 않고 삽입선도 그리지 않는다", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useStudioPageStripDnd(3, onReorder));

    act(() => result.current.itemProps(1).onDragStart(dragEvent(120)));
    act(() => result.current.itemProps(1).onDragOver(dragEvent(180)));
    expect(result.current.indicatorFor(1)).toBeNull();
    act(() => result.current.itemProps(1).onDrop(dragEvent(180)));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("끌기가 끝나면(취소 포함) 상태를 비운다", () => {
    const { result } = renderHook(() => useStudioPageStripDnd(3, vi.fn()));
    act(() => result.current.itemProps(0).onDragStart(dragEvent(120)));
    act(() => result.current.itemProps(2).onDragOver(dragEvent(180)));
    act(() => result.current.itemProps(0).onDragEnd());
    expect(result.current.dragIndex).toBeNull();
    expect(result.current.dropSlot).toBeNull();
  });

  it("다른 곳(파일 등)에서 온 끌기는 무시한다", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useStudioPageStripDnd(3, onReorder));
    const event = dragEvent(120);
    act(() => result.current.itemProps(1).onDragOver(event));
    expect(event.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.itemProps(1).onDrop(event));
    expect(onReorder).not.toHaveBeenCalled();
  });
});
