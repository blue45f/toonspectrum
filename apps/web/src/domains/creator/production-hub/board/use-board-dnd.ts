/**
 * 칸반 끌어 옮기기(새 라이브러리 없이 Pointer Events로 구현).
 *
 * - 마우스·펜: 카드 어디서든(버튼·입력 제외) 5px 넘게 끌면 시작한다.
 * - 터치: 카드 본문은 스크롤을 그대로 두고, 손잡이(touch-action: none)에서만 끌기를 시작한다.
 * - 키보드: 손잡이에서 Space로 집고 ←→ 열, ↑↓ 위치를 고른 뒤 Enter로 놓는다(Esc 취소).
 * - 끄는 동안 카드 복제본(고스트)이 포인터를 따라가고, 놓일 열·위치는 `drag.target`으로 알려 준다.
 * - 보드 가장자리나 화면 위아래 가까이에서는 자동으로 스크롤한다.
 *
 * 훅은 "어디에 놓았는지"(`onDrop`)만 알려 주고, 상태 전환·순서 저장은 보드가 맡는다.
 */
import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export interface BoardDropTarget {
  readonly columnId: string;
  readonly laneId: string | null;
  /** 이 카드 바로 앞에 놓는다. null이면 열 맨 아래. */
  readonly beforeId: string | null;
}

export interface BoardDragState {
  readonly ids: readonly string[];
  readonly sourceId: string;
  readonly kind: "pointer" | "keyboard";
  readonly target: BoardDropTarget | null;
}

export interface BoardCardLocation {
  readonly columnId: string;
  readonly laneId: string | null;
}

export interface UseBoardDndOptions {
  readonly root: RefObject<HTMLElement | null>;
  readonly enabled: boolean;
  /** 보기 조건(필터·데이터)이 바뀌면 진행 중인 끌기를 취소한다. */
  readonly contextKey: string;
  /** 놓을 수 있는 열(보관 열 제외), 화면 순서대로. */
  readonly columnIds: readonly string[];
  /** 끌기 시작 카드가 선택된 카드 중 하나면 선택 전체를 함께 옮긴다. */
  readonly idsFor: (taskId: string) => readonly string[];
  readonly locate: (taskId: string) => BoardCardLocation | null;
  /** 저장 중인 카드처럼 지금은 끌 수 없는 카드. */
  readonly locked?: (taskId: string) => boolean;
  readonly onDrop: (ids: readonly string[], target: BoardDropTarget) => void;
}

export type BoardCardDragProps = Pick<HTMLAttributes<HTMLElement>, "onPointerDown">;
export type BoardHandleDragProps = Pick<HTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onKeyDown" | "onBlur">;

const START_DISTANCE = 5;
const EDGE_ZONE_X = 56;
const EDGE_ZONE_Y = 80;
const MAX_SCROLL_STEP = 22;

interface Gesture {
  readonly pointerId: number;
  readonly taskId: string;
  readonly ids: readonly string[];
  readonly card: HTMLElement;
  readonly laneId: string | null;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly originX: number;
  readonly originY: number;
  x: number;
  y: number;
  started: boolean;
  ghost: HTMLElement | null;
  target: BoardDropTarget | null;
  raf: number;
}

function sameTarget(left: BoardDropTarget | null, right: BoardDropTarget | null): boolean {
  if (left === right) return true;
  return Boolean(left && right && left.columnId === right.columnId && left.laneId === right.laneId && left.beforeId === right.beforeId);
}

function edgeStep(position: number, min: number, max: number, zone: number): number {
  if (position < min + zone) return -Math.min(MAX_SCROLL_STEP, Math.ceil((MAX_SCROLL_STEP * (min + zone - position)) / zone));
  if (position > max - zone) return Math.min(MAX_SCROLL_STEP, Math.ceil((MAX_SCROLL_STEP * (position - (max - zone))) / zone));
  return 0;
}

function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let current = element?.parentElement ?? null; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current);
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) return current;
  }
  return null;
}

function createGhost(card: HTMLElement, count: number): HTMLElement | null {
  const clone = card.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  const rect = card.getBoundingClientRect();
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("data-board-ghost", "true");
  clone.removeAttribute("data-production-task");
  Object.assign(clone.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${rect.width}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "400",
    opacity: "0.94",
    boxShadow: "0 18px 40px color-mix(in oklch, var(--color-fg) 28%, transparent)",
    transition: "none",
    willChange: "transform",
  });
  if (count > 1) {
    const badge = document.createElement("span");
    badge.textContent = `×${count}`;
    Object.assign(badge.style, {
      position: "absolute",
      right: "-8px",
      top: "-8px",
      minWidth: "28px",
      padding: "2px 8px",
      borderRadius: "999px",
      background: "var(--color-accent)",
      color: "var(--color-on-accent)",
      font: "700 12px/20px inherit",
      textAlign: "center",
    });
    clone.append(badge);
  }
  return clone;
}

/** 끌기를 끝낸 직후 같은 자리에 발생하는 click(제목 버튼 열기 등)을 한 번 막는다. */
function suppressNextClick(): void {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", stop, true);
  window.setTimeout(() => window.removeEventListener("click", stop, true), 0);
}

function columnCell(root: HTMLElement | null, columnId: string, laneId: string | null): HTMLElement | null {
  const cells = Array.from(root?.querySelectorAll<HTMLElement>("[data-production-drop-column]") ?? []);
  return cells.find((cell) => cell.dataset.productionDropColumn === columnId && (laneId === null || cell.dataset.productionLane === laneId)) ?? null;
}

function cardIdsIn(cell: HTMLElement | null, exclude: ReadonlySet<string>): readonly string[] {
  return Array.from(cell?.querySelectorAll<HTMLElement>("[data-production-task]") ?? [])
    .map((card) => card.dataset.productionTask ?? "")
    .filter((id) => id && !exclude.has(id));
}

export function useBoardDnd(options: UseBoardDndOptions) {
  const { enabled, contextKey } = options;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [drag, setDrag] = useState<BoardDragState | null>(null);
  const dragRef = useRef<BoardDragState | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const teardown = useRef<(() => void) | null>(null);

  const publish = useCallback((next: BoardDragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const cancel = useCallback(() => {
    teardown.current?.();
    teardown.current = null;
    gesture.current = null;
    if (dragRef.current) publish(null);
  }, [publish]);

  useEffect(() => {
    cancel();
  }, [contextKey, enabled, cancel]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hide);
      teardown.current?.();
    };
  }, [cancel]);

  const computeTarget = useCallback((g: Gesture): BoardDropTarget | null => {
    const { root, columnIds } = latest.current;
    const rootElement = root.current;
    if (!rootElement) return null;
    const ids = new Set(g.ids);
    const cells = Array.from(rootElement.querySelectorAll<HTMLElement>("[data-production-drop-column]")).filter(
      (cell) => columnIds.includes(cell.dataset.productionDropColumn ?? "") && (g.laneId === null || cell.dataset.productionLane === g.laneId),
    );
    let cell = document.elementFromPoint?.(g.x, g.y)?.closest<HTMLElement>("[data-production-drop-column]") ?? null;
    if (cell && !cells.includes(cell)) cell = null;
    if (!cell) {
      // 열 사이 틈이나 열 아래 빈 곳에서도 가장 가까운 열에 놓을 수 있게 한다.
      cell = cells.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return g.x >= rect.left && g.x <= rect.right;
      }) ?? null;
    }
    const columnId = cell?.dataset.productionDropColumn;
    if (!cell || !columnId) return null;
    let beforeId: string | null = null;
    for (const card of cell.querySelectorAll<HTMLElement>("[data-production-task]")) {
      const id = card.dataset.productionTask ?? "";
      if (!id || ids.has(id)) continue;
      const rect = card.getBoundingClientRect();
      if (g.y < rect.top + rect.height / 2) {
        beforeId = id;
        break;
      }
    }
    return { columnId, laneId: g.laneId === null ? null : (cell.dataset.productionLane ?? null), beforeId };
  }, []);

  const refreshTarget = useCallback(
    (g: Gesture) => {
      const next = computeTarget(g);
      if (sameTarget(g.target, next)) return;
      g.target = next;
      const current = dragRef.current;
      if (current) publish({ ...current, target: next });
    },
    [computeTarget, publish],
  );

  const autoScroll = useCallback(
    (g: Gesture) => {
      const tick = () => {
        g.raf = 0;
        if (gesture.current !== g || !g.started) return;
        const root = latest.current.root.current;
        const scroller = root?.querySelector<HTMLElement>('[data-testid="production-board-scroll-region"]') ?? null;
        let moved = false;
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          if (g.y >= Math.max(0, rect.top) && g.y <= Math.min(window.innerHeight, rect.bottom)) {
            const step = edgeStep(g.x, Math.max(0, rect.left), Math.min(window.innerWidth, rect.right), EDGE_ZONE_X);
            if (step !== 0) {
              scroller.scrollLeft += step;
              moved = true;
            }
          }
        }
        const parent = findScrollParent(root);
        const top = parent ? parent.getBoundingClientRect().top : 0;
        const bottom = parent ? parent.getBoundingClientRect().bottom : window.innerHeight;
        const stepY = edgeStep(g.y, top, bottom, EDGE_ZONE_Y);
        if (stepY !== 0) {
          if (parent) parent.scrollTop += stepY;
          else window.scrollBy(0, stepY);
          moved = true;
        }
        if (moved) {
          refreshTarget(g);
          g.raf = window.requestAnimationFrame(tick);
        }
      };
      if (g.raf === 0) g.raf = window.requestAnimationFrame(tick);
    },
    [refreshTarget],
  );

  const beginPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>, taskId: string) => {
      const o = latest.current;
      if (!o.enabled || o.locked?.(taskId) || gesture.current || dragRef.current) return;
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      const card = event.currentTarget.closest<HTMLElement>("[data-production-task]");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const g: Gesture = {
        pointerId: event.pointerId,
        taskId,
        ids: o.idsFor(taskId),
        card,
        laneId: o.locate(taskId)?.laneId ?? null,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        originX: event.clientX,
        originY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        started: false,
        ghost: null,
        target: null,
        raf: 0,
      };
      gesture.current = g;

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== g.pointerId) return;
        g.x = moveEvent.clientX;
        g.y = moveEvent.clientY;
        if (!g.started) {
          if (Math.hypot(g.x - g.originX, g.y - g.originY) < START_DISTANCE) return;
          g.started = true;
          g.ghost = createGhost(g.card, g.ids.length);
          if (g.ghost) document.body.append(g.ghost);
          document.body.setAttribute("data-board-dragging", "true");
          window.getSelection()?.removeAllRanges();
          publish({ ids: g.ids, sourceId: g.taskId, kind: "pointer", target: null });
        }
        if (g.ghost) g.ghost.style.transform = `translate3d(${g.x - g.offsetX}px, ${g.y - g.offsetY}px, 0) rotate(1.5deg)`;
        refreshTarget(g);
        autoScroll(g);
      };
      const finish = (commit: boolean) => {
        const { started, ids, target } = g;
        teardown.current?.();
        teardown.current = null;
        gesture.current = null;
        if (started) {
          publish(null);
          suppressNextClick();
          if (commit && target) latest.current.onDrop(ids, target);
        }
      };
      const up = (upEvent: PointerEvent) => {
        if (upEvent.pointerId === g.pointerId) finish(true);
      };
      const abort = (abortEvent: PointerEvent) => {
        if (abortEvent.pointerId === g.pointerId) finish(false);
      };
      const key = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        finish(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", abort);
      window.addEventListener("keydown", key, true);
      teardown.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", abort);
        window.removeEventListener("keydown", key, true);
        if (g.raf) window.cancelAnimationFrame(g.raf);
        g.raf = 0;
        g.ghost?.remove();
        document.body.removeAttribute("data-board-dragging");
      };
    },
    [autoScroll, publish, refreshTarget],
  );

  /** 마우스·펜 전용: 버튼·입력·링크 위에서 시작한 눌림은 끌기가 아니라 그 요소의 동작이다. */
  const getCardProps = (taskId: string): BoardCardDragProps => ({
    onPointerDown: (event) => {
      if (event.pointerType === "touch") return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea, a, button:not([data-board-open]), [data-board-no-drag]")) return;
      beginPointer(event, taskId);
    },
  });

  const keyboardSlot = (taskId: string, ids: readonly string[], target: BoardDropTarget): BoardDragState => ({
    ids,
    sourceId: taskId,
    kind: "keyboard",
    target,
  });

  const getHandleProps = (taskId: string): BoardHandleDragProps => ({
    onPointerDown: (event) => beginPointer(event, taskId),
    onBlur: () => {
      if (dragRef.current?.kind === "keyboard") cancel();
    },
    onKeyDown: (event) => {
      const o = latest.current;
      if (!o.enabled || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const current = dragRef.current;
      if (!current) {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (o.locked?.(taskId)) return;
        const location = o.locate(taskId);
        if (!location) return;
        const ids = o.idsFor(taskId);
        const cell = columnCell(o.root.current, location.columnId, location.laneId);
        const siblings = cardIdsIn(cell, new Set(ids));
        const all = cardIdsIn(cell, new Set());
        const index = all.indexOf(taskId);
        const beforeId = all.slice(index + 1).find((id) => siblings.includes(id)) ?? null;
        publish(keyboardSlot(taskId, ids, { columnId: location.columnId, laneId: location.laneId, beforeId }));
        return;
      }
      if (current.kind !== "keyboard" || current.sourceId !== taskId || !current.target) return;
      const target = current.target;
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        cancel();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const { ids } = current;
        publish(null);
        o.onDrop(ids, target);
        return;
      }
      const columns = o.columnIds;
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const at = Math.max(0, columns.indexOf(target.columnId));
        const index =
          event.key === "Home" ? 0 : event.key === "End" ? columns.length - 1 : Math.max(0, Math.min(columns.length - 1, at + (event.key === "ArrowRight" ? 1 : -1)));
        const columnId = columns[index];
        if (columnId === undefined) return;
        publish({ ...current, target: { columnId, laneId: target.laneId, beforeId: null } });
        columnCell(o.root.current, columnId, target.laneId)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const slots = cardIdsIn(columnCell(o.root.current, target.columnId, target.laneId), new Set(current.ids));
        const at = target.beforeId === null ? slots.length : Math.max(0, slots.indexOf(target.beforeId));
        const next = Math.max(0, Math.min(slots.length, at + (event.key === "ArrowDown" ? 1 : -1)));
        publish({ ...current, target: { ...target, beforeId: slots[next] ?? null } });
      }
    },
  });

  return { drag, cancel, getCardProps, getHandleProps };
}
