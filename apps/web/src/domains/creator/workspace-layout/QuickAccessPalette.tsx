/**
 * T9. 퀵 액세스 팔레트 — 자주 쓰는 도구/명령을 모아 두는 플로팅 팔레트.
 *
 * - 최대 12개 등록, 위/아래 이동 버튼으로 순서 변경, 제거
 * - 접기/펼치기, 고정 우하단 배치
 * - 데스크톱 우선: 모바일 이머시브 크롬과 충돌하지 않도록 lg 이상에서만 표시
 *   (StudioWorkspaceArrangementControls 와 같은 정책)
 */
import { ChevronDown, ChevronUp, ChevronsUpDown, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { cn } from "@/shared/lib/utils";

export interface QuickAccessCommand {
  id: string;
  label: string;
  hint?: string;
}

export interface QuickAccessPaletteProps {
  initialItems?: ReadonlyArray<QuickAccessCommand>;
  /** 등록 가능한 명령 카탈로그. 기본값은 내장 도구/명령 목록. */
  catalog?: ReadonlyArray<QuickAccessCommand>;
  maxItems?: number;
  onItemsChange?: (items: QuickAccessCommand[]) => void;
  onSelectCommand?: (command: QuickAccessCommand) => void;
}

/** 한국어 라벨 상수 (i18n 파일 직접 수정 금지 정책에 따라 컴포넌트 내 상수). */
const LABELS = {
  title: "퀵 액세스",
  collapse: "팔레트 접기",
  expand: "팔레트 펼치기",
  add: "추가",
  selectPlaceholder: "추가할 도구·명령 선택",
  moveUp: "위로 이동",
  moveDown: "아래로 이동",
  remove: "제거",
  maxReached: "퀵 액세스는 최대 12개까지 등록할 수 있어요.",
  duplicate: "이미 등록된 항목이에요.",
  added: "항목을 추가했어요.",
  removed: "항목을 제거했어요.",
  empty: "자주 쓰는 도구나 명령을 등록해 두세요.",
  count: "등록",
} as const;

const DEFAULT_CATALOG: ReadonlyArray<QuickAccessCommand> = [
  { id: "brush", label: "브러시", hint: "B" },
  { id: "eraser", label: "지우개", hint: "E" },
  { id: "fill", label: "채우기", hint: "G" },
  { id: "select", label: "선택", hint: "S" },
  { id: "move", label: "이동", hint: "V" },
  { id: "text", label: "텍스트", hint: "T" },
  { id: "undo", label: "되돌리기", hint: "Ctrl+Z" },
  { id: "redo", label: "다시 실행", hint: "Ctrl+Y" },
  { id: "zoom-in", label: "확대", hint: "Ctrl++" },
  { id: "zoom-out", label: "축소", hint: "Ctrl+-" },
  { id: "layers-panel", label: "레이어 패널" },
  { id: "color-panel", label: "색상 패널" },
];

export const QUICK_ACCESS_MAX_ITEMS = 12;

export function QuickAccessPalette({
  initialItems = [],
  catalog = DEFAULT_CATALOG,
  maxItems = QUICK_ACCESS_MAX_ITEMS,
  onItemsChange,
  onSelectCommand,
}: QuickAccessPaletteProps) {
  const [items, setItems] = useState<QuickAccessCommand[]>(() =>
    initialItems.slice(0, maxItems),
  );
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const selectId = useId();
  const listId = useId();

  function commit(next: QuickAccessCommand[]) {
    setItems(next);
    onItemsChange?.(next);
  }

  function addSelected() {
    if (!selectedId) return;
    const command = catalog.find((entry) => entry.id === selectedId);
    if (!command) return;
    if (items.some((item) => item.id === command.id)) {
      setNotice(LABELS.duplicate);
      return;
    }
    if (items.length >= maxItems) {
      setNotice(LABELS.maxReached);
      return;
    }
    commit([...items, command]);
    setSelectedId("");
    setNotice(LABELS.added);
  }

  function move(index: number, delta: -1 | 1) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    commit(next);
  }

  function remove(index: number) {
    const next = items.filter((_, i) => i !== index);
    commit(next);
    setNotice(LABELS.removed);
  }

  const available = catalog.filter((entry) => !items.some((item) => item.id === entry.id));

  return (
    <section
      aria-label={LABELS.title}
      data-workspace-layout-quick-access="true"
      // 데스크톱 우선: 모바일 이머시브 크롬(하단 고정 바)과 겹치지 않도록 lg 미만 숨김.
      // StudioWorkspaceArrangementControls(우하단, z-69)와 겹치지 않게 하단에서 띄운다.
      className="pointer-events-auto fixed bottom-20 right-3 z-[68] hidden w-60 lg:block"
    >
      <div className="overflow-hidden rounded-xl border border-line-strong bg-panel/95 shadow-xl backdrop-blur">
        <div className="flex items-center gap-1 border-b border-line/60 px-2.5 py-1.5">
          <ChevronsUpDown size={14} aria-hidden className="shrink-0 text-fg-3" />
          <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-fg-2">
            {LABELS.title}
            <span className="ml-1.5 font-normal text-fg-3">
              {LABELS.count} {items.length}/{maxItems}
            </span>
          </h2>
          <button
            type="button"
            aria-label={collapsed ? LABELS.expand : LABELS.collapse}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((prev) => !prev)}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-raised hover:text-fg",
              STUDIO_FOCUS_RING,
            )}
          >
            {collapsed ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
          </button>
        </div>

        {!collapsed ? (
          <div className="space-y-2 p-2.5">
            <div className="flex gap-1.5">
              <label htmlFor={selectId} className="sr-only">
                {LABELS.selectPlaceholder}
              </label>
              <select
                id={selectId}
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setNotice("");
                }}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-md border border-line bg-card px-2 text-xs text-fg-2",
                  STUDIO_FOCUS_RING,
                )}
              >
                <option value="">{LABELS.selectPlaceholder}</option>
                {available.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                    {entry.hint ? ` (${entry.hint})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addSelected}
                disabled={!selectedId}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-line bg-card px-2.5 text-xs font-semibold text-fg-2",
                  "hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45",
                  STUDIO_FOCUS_RING,
                )}
              >
                <Plus size={14} aria-hidden />
                {LABELS.add}
              </button>
            </div>

            {items.length === 0 ? (
              <p className="rounded-md bg-raised/60 px-2 py-3 text-center text-[0.7rem] text-fg-3">
                {LABELS.empty}
              </p>
            ) : (
              <ul id={listId} aria-label={LABELS.title} className="space-y-1">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-1 rounded-lg border border-line/60 bg-card px-1.5 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectCommand?.(item)}
                      title={item.hint}
                      aria-label={item.hint ? `${item.label} ${item.hint}` : item.label}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-md px-1.5 py-1.5 text-left text-xs font-medium text-fg-2",
                        "hover:bg-raised hover:text-fg",
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      {item.label}
                      {item.hint ? (
                        <span className="ml-1.5 text-[0.65rem] font-normal text-fg-3">
                          {item.hint}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      aria-label={`${item.label} ${LABELS.moveUp}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-30",
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      <ChevronUp size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`${item.label} ${LABELS.moveDown}`}
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-30",
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      <ChevronDown size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`${item.label} ${LABELS.remove}`}
                      onClick={() => remove(index)}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg",
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p role="status" aria-live="polite" className={cn("text-[0.68rem] text-fg-2", !notice && "sr-only")}>
              {notice}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default QuickAccessPalette;
