import {
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Hexagon,
  Layers3,
  Lock,
  PencilLine,
  Search,
  Trash2,
  Unlock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { cx } from "@/shared/lib/cx";

import type {
  StudioBg3dOutlinerItem,
  StudioBg3dSceneOutlinerController,
} from "./studio-bg3d-scene-outliner-controller";

interface StudioBg3dSceneOutlinerProps {
  readonly controller: StudioBg3dSceneOutlinerController;
  readonly variant?: "dock" | "panel";
  readonly className?: string;
}

interface VisibleOutlinerRow {
  readonly item: StudioBg3dOutlinerItem;
  readonly depth: number;
  readonly childIds: readonly string[];
}

function visibleOutlinerRows(
  controller: StudioBg3dSceneOutlinerController,
  collapsedIds: ReadonlySet<string>,
): readonly VisibleOutlinerRow[] {
  const filteredById = new Map(controller.filteredItems.map((item) => [item.id, item] as const));
  if (controller.query.trim()) {
    return controller.filteredItems.map((item) => ({ item, depth: 0, childIds: [] }));
  }

  const rows: VisibleOutlinerRow[] = [];
  const visit = (id: string, depth: number) => {
    const item = filteredById.get(id);
    if (!item) return;
    const childIds = (controller.hierarchy.childrenByParent.get(id) ?? [])
      .filter((childId) => filteredById.has(childId));
    rows.push({ item, depth, childIds });
    if (collapsedIds.has(id)) return;
    childIds.forEach((childId) => visit(childId, depth + 1));
  };
  controller.hierarchy.roots.forEach((id) => visit(id, 0));
  return rows;
}

function actionButtonClass(variant: "dock" | "panel"): string {
  return cx(
    "grid shrink-0 place-items-center rounded text-fg-3 transition-colors",
    "hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2",
    "focus-visible:outline-offset-1 focus-visible:outline-accent",
    variant === "dock" ? "size-7" : "size-11 sm:size-7",
  );
}

export function StudioBg3dSceneOutliner({
  controller,
  variant = "panel",
  className,
}: StudioBg3dSceneOutlinerProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const rowButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const rows = useMemo(
    () => visibleOutlinerRows(controller, collapsedIds),
    [collapsedIds, controller],
  );
  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.item.id, index] as const)),
    [rows],
  );
  const expandableIds = useMemo(
    () => new Set(controller.items.flatMap((item) =>
      (controller.hierarchy.childrenByParent.get(item.id)?.length ?? 0) > 0 ? [item.id] : [])),
    [controller.hierarchy.childrenByParent, controller.items],
  );

  useEffect(() => {
    const validIds = new Set(controller.items.map((item) => item.id));
    setCollapsedIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [controller.items]);

  const focusAndSelect = (index: number) => {
    const row = rows[index];
    if (!row) return;
    controller.select(row.item.id, "replace");
    requestAnimationFrame(() => rowButtonRefs.current.get(row.item.id)?.focus());
  };

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTreeKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    row: VisibleOutlinerRow,
  ) => {
    const index = rowIndexById.get(row.item.id) ?? -1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAndSelect(Math.min(rows.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAndSelect(Math.max(0, index - 1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusAndSelect(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusAndSelect(rows.length - 1);
      return;
    }
    if (event.key === "ArrowRight" && row.childIds.length > 0) {
      event.preventDefault();
      if (collapsedIds.has(row.item.id)) toggleCollapsed(row.item.id);
      else focusAndSelect(index + 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (row.childIds.length > 0 && !collapsedIds.has(row.item.id)) {
        toggleCollapsed(row.item.id);
        return;
      }
      const parentId = controller.hierarchy.parentById.get(row.item.id);
      if (parentId) {
        const parentIndex = rowIndexById.get(parentId);
        if (parentIndex !== undefined) focusAndSelect(parentIndex);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      controller.select(row.item.id, event.metaKey || event.ctrlKey || event.shiftKey
        ? "toggle"
        : "replace");
    }
  };

  const allExpandableCollapsed = expandableIds.size > 0
    && [...expandableIds].every((id) => collapsedIds.has(id));

  return (
    <section
      aria-label="3D 장면 계층"
      className={cx(
        "flex min-h-0 flex-col text-fg",
        variant === "dock" && "h-full bg-panel/65",
        className,
      )}
      data-studio-bg3d-outliner={variant}
    >
      <div className={cx(
        "flex shrink-0 items-center justify-between gap-2",
        variant === "dock" ? "border-b border-line px-3 py-3" : "mb-2",
      )}>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Layers3 size={15} className="text-accent" aria-hidden />
            장면 계층
          </h3>
          {variant === "dock" ? (
            <p className="mt-1 truncate text-[0.66rem] text-fg-3">선택 · 숨김 · 잠금 · 복제</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap text-[0.68rem] text-fg-3">
            {controller.filteredItems.length}/{controller.items.length}
          </span>
          {expandableIds.size > 0 && !controller.query.trim() ? (
            <button
              type="button"
              className={actionButtonClass("dock")}
              aria-label={allExpandableCollapsed ? "모든 계층 펼치기" : "모든 계층 접기"}
              title={allExpandableCollapsed ? "모두 펼치기" : "모두 접기"}
              onClick={() => setCollapsedIds(allExpandableCollapsed
                ? new Set()
                : new Set(expandableIds))}
            >
              <ChevronRight
                size={14}
                className={cx("transition-transform", !allExpandableCollapsed && "rotate-90")}
                aria-hidden
              />
            </button>
          ) : null}
        </div>
      </div>

      <label className={cx("relative block shrink-0", variant === "dock" ? "m-3 mb-2" : "mb-2")}>
        <span className="sr-only">장면 계층 검색</span>
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
          aria-hidden
        />
        <input
          type="search"
          value={controller.query}
          onChange={(event) => controller.setQuery(event.target.value)}
          placeholder="객체 이름 검색…"
          className={cx(
            "w-full rounded-lg border border-line bg-card pl-9 pr-3 text-xs font-medium text-fg",
            "focus-visible:border-accent focus-visible:outline focus-visible:outline-2",
            "focus-visible:outline-offset-2 focus-visible:outline-accent",
            variant === "dock" ? "min-h-9" : "min-h-11 sm:min-h-9",
          )}
        />
      </label>

      <div className={cx(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        variant === "dock" ? "px-2 pb-3" : "max-h-[24rem]",
      )}>
        {controller.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-xs leading-relaxed text-fg-3">
            아직 장면 객체가 없습니다. 도형·템플릿·에셋을 추가하면 이곳에서 계층으로 관리할 수 있어요.
          </p>
        ) : controller.filteredItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-xs leading-relaxed text-fg-3">
            검색 결과가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1" role="tree" aria-label="3D 장면 객체">
            {rows.map((row) => {
              const { item } = row;
              const selected = controller.selectedIds.has(item.id);
              const collapsed = collapsedIds.has(item.id);
              const hasChildren = row.childIds.length > 0;
              return (
                <li
                  key={item.id}
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-selected={selected}
                  aria-expanded={hasChildren ? !collapsed : undefined}
                >
                  <div
                    className={cx(
                      "group flex items-center gap-0.5 rounded-lg border px-1 py-1 text-xs transition-colors",
                      selected
                        ? "border-accent/55 bg-accent-soft text-accent"
                        : "border-line/80 bg-card text-fg-2 hover:bg-raised",
                      !item.visible && "opacity-60",
                    )}
                    style={{ marginLeft: `${Math.min(row.depth, 8) * 12}px` }}
                  >
                    {hasChildren && !controller.query.trim() ? (
                      <button
                        type="button"
                        className={actionButtonClass("dock")}
                        aria-label={`${item.label} ${collapsed ? "펼치기" : "접기"}`}
                        onClick={() => toggleCollapsed(item.id)}
                      >
                        <ChevronRight
                          size={13}
                          className={cx("transition-transform", !collapsed && "rotate-90")}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <span className="block size-7 shrink-0" aria-hidden />
                    )}
                    <button
                      ref={(node) => {
                        if (node) rowButtonRefs.current.set(item.id, node);
                        else rowButtonRefs.current.delete(item.id);
                      }}
                      type="button"
                      className={cx(
                        "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
                        "focus-visible:outline-accent",
                      )}
                      onClick={(event) => controller.select(
                        item.id,
                        event.shiftKey || event.metaKey || event.ctrlKey ? "toggle" : "replace",
                      )}
                      onKeyDown={(event) => handleTreeKeyDown(event, row)}
                    >
                      {item.color ? (
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-sm border border-black/10"
                          style={{ backgroundColor: item.color }}
                          aria-hidden
                        />
                      ) : (
                        <Hexagon size={13} className="shrink-0 text-fg-3" aria-hidden />
                      )}
                      <span className="truncate font-semibold">{item.label}</span>
                      {item.locked ? <Lock size={11} className="shrink-0 opacity-80" aria-hidden /> : null}
                    </button>
                    <div className={cx(
                      "flex shrink-0 items-center",
                      variant === "dock" && !selected && "xl:opacity-0 xl:group-hover:opacity-100 xl:group-focus-within:opacity-100",
                    )}>
                      <button
                        type="button"
                        aria-label={`${item.label} 이름 변경`}
                        title="이름 변경"
                        className={actionButtonClass(variant)}
                        onClick={() => controller.rename(item)}
                      >
                        <PencilLine size={12} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.label} ${item.visible ? "숨기기" : "보이기"}`}
                        title={item.visible ? "숨기기" : "보이기"}
                        className={actionButtonClass(variant)}
                        onClick={() => controller.toggleVisibility(item)}
                      >
                        {item.visible ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />}
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.label} ${item.locked ? "잠금 해제" : "잠금"}`}
                        title={item.locked ? "잠금 해제" : "잠금"}
                        className={actionButtonClass(variant)}
                        onClick={() => controller.toggleLock(item)}
                      >
                        {item.locked ? <Lock size={12} aria-hidden /> : <Unlock size={12} aria-hidden />}
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.label} 복제`}
                        title="복제"
                        className={actionButtonClass(variant)}
                        onClick={() => controller.duplicate(item)}
                      >
                        <Copy size={12} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.label} 삭제`}
                        title="삭제"
                        className={actionButtonClass(variant)}
                        onClick={() => controller.remove(item)}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
