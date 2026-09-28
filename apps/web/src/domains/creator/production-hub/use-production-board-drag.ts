import { useCallback, useEffect, useRef, useState, type DragEvent, type HTMLAttributes, type RefObject } from "react";

interface Column { readonly id: string; readonly title: string }
interface DragState {
  readonly ids: readonly string[];
  readonly sourceId: string;
  readonly targetId: string | null;
  readonly kind: "native" | "keyboard" | "pointer";
  readonly contextKey: string;
}
interface Gesture {
  readonly pointerId: number;
  readonly contextKey: string;
  readonly x: number;
  readonly y: number;
  readonly ids: readonly string[];
  started: boolean;
}
export type ProductionMoveHandleProps = Pick<HTMLAttributes<HTMLButtonElement>,
  "onDragStart" | "onDragEnd" | "onKeyDown" | "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture">;

/** 핸들만 터치 제스처를 소유하고 카드 본문의 스크롤은 유지한다. */
export function useProductionBoardDrag({ root, enabled, contextKey, columns, idsFor, columnFor, onMove }: {
  readonly root: RefObject<HTMLDivElement | null>;
  readonly enabled: boolean;
  readonly contextKey: string;
  readonly columns: readonly Column[];
  readonly idsFor: (id: string) => readonly string[];
  readonly columnFor: (id: string) => string | null;
  readonly onMove: (ids: readonly string[], columnId: string) => void;
}) {
  const [state, setState] = useState<DragState | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const cancel = useCallback(() => { gesture.current = null; setState(null); }, []);
  const drag = enabled && state?.contextKey === contextKey ? state : null;
  useEffect(() => { cancel(); }, [contextKey, enabled, cancel]);
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", hide); };
  }, [cancel]);
  const pointTarget = (x: number, y: number): string | null => {
    const element = document.elementFromPoint?.(x, y)?.closest<HTMLElement>("[data-production-drop-column]");
    const id = element?.dataset.productionDropColumn;
    return element && root.current?.contains(element) && columns.some((column) => column.id === id) ? id ?? null : null;
  };
  const scrollToColumn = (id: string) => {
    const column = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-production-drop-column]") ?? [])
      .find((element) => element.dataset.productionDropColumn === id);
    column?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
  };
  const getHandleProps = (id: string): ProductionMoveHandleProps => ({
    onDragStart: (event) => {
      // 포인터 캡처와 브라우저 네이티브 드래그가 동시에 시작하지 않도록 한다.
      if (!enabled || gesture.current) { event.preventDefault(); return; }
      event.dataTransfer.setData("application/x-toonstudio-task", id);
      event.dataTransfer.effectAllowed = "move";
      setState({ ids: idsFor(id), sourceId: id, targetId: null, kind: "native", contextKey });
    },
    onDragEnd: cancel,
    onKeyDown: (event) => {
      if (!enabled || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!drag && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        setState({ ids: idsFor(id), sourceId: id, targetId: columnFor(id), kind: "keyboard", contextKey });
        return;
      }
      if (!drag || drag.sourceId !== id || drag.kind !== "keyboard") return;
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        cancel(); return;
      }
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const current = Math.max(0, columns.findIndex((column) => column.id === drag.targetId));
        const index = event.key === "Home" ? 0 : event.key === "End" ? columns.length - 1
          : Math.max(0, Math.min(columns.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
        const target = columns[index];
        if (target) { setState({ ...drag, targetId: target.id }); scrollToColumn(target.id); }
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); cancel();
        if (drag.targetId) onMove(drag.ids, drag.targetId);
      }
    },
    onPointerDown: (event) => {
      if (!enabled || !["mouse", "touch", "pen"].includes(event.pointerType) || event.isPrimary === false || event.button !== 0) return;
      gesture.current = { pointerId: event.pointerId, contextKey, x: event.clientX, y: event.clientY, ids: idsFor(id), started: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      const active = gesture.current;
      if (!enabled || !active || active.pointerId !== event.pointerId || active.contextKey !== contextKey) return;
      if (!active.started && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 8) return;
      active.started = true;
      event.preventDefault();
      const scroller = root.current?.querySelector<HTMLElement>('[data-testid="production-board-scroll-region"]');
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          if (event.clientX < rect.left + 36) scroller.scrollLeft -= 24;
          else if (event.clientX > rect.right - 36) scroller.scrollLeft += 24;
        }
      }
      setState({ ids: active.ids, sourceId: id, targetId: pointTarget(event.clientX, event.clientY), kind: "pointer", contextKey });
    },
    onPointerUp: (event) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const target = pointTarget(event.clientX, event.clientY);
      cancel();
      if (enabled && active.started && active.contextKey === contextKey && target) { scrollToColumn(target); onMove(active.ids, target); }
    },
    // 마우스 HTML 드래그 시작 시 발생하는 pointercancel은 네이티브 드래그를 취소하지 않는다.
    onPointerCancel: () => { if (gesture.current) cancel(); },
    onLostPointerCapture: () => { if (gesture.current) cancel(); },
  });
  return {
    drag, cancel, getHandleProps,
    onDragOverColumn: (event: DragEvent<HTMLElement>, id: string) => {
      if (!drag || drag.kind !== "native") return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
      if (drag.targetId !== id) setState({ ...drag, targetId: id });
    },
    onDropColumn: (event: DragEvent<HTMLElement>, id: string) => {
      if (!drag || drag.kind !== "native") return;
      event.preventDefault(); cancel(); onMove(drag.ids, id);
    },
  };
}
