import { ArrowDown, ArrowUp, GripVertical, PanelsTopLeft } from "lucide-react";
import { useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { orderedProductionColumns, reorderProductionColumn, collapsedProductionColumns } from "./production-board-columns";

/** 툴바 한 줄에 놓이는 "열 맞춤 설정". 눌러야 펼쳐지는 작은 패널이라 평소에는 자리를 거의 차지하지 않는다. */
export function ProductionBoardColumnSettings({ order, collapsed, busy, onChange }: {
  readonly order: string | null;
  readonly collapsed: string | null;
  readonly busy: boolean;
  readonly onChange: (key: string, value: string) => void;
}) {
  const bt = useBilingual("ProductionBoardColumnSettings");
  const [dragId, setDragId] = useState<string | null>(null);
  const columns = orderedProductionColumns(order);
  const collapsedIds = collapsedProductionColumns(collapsed);
  const reorder = (id: string, to: number) => { if (!busy) onChange("boardColumns", reorderProductionColumn(order, id, to)); };
  return <details className="group/columns relative">
    <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-line px-3 text-xs font-semibold text-fg-2 outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent group-open/columns:border-accent group-open/columns:text-accent [&::-webkit-details-marker]:hidden">
      <PanelsTopLeft size={16} className="shrink-0" aria-hidden="true" />
      <span className="max-sm:sr-only">{bt("보드 열 맞춤 설정", "Customize board columns")}</span>
    </summary>
    <div className="fixed inset-x-3 z-30 mt-2 rounded-2xl border border-line bg-card p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:w-[40rem] sm:max-w-[calc(100vw-3rem)]">
      <p className="mb-3 text-xs leading-6 text-fg-2">
        {bt("열을 끌거나 화살표로 순서를 바꾸고 접을 수 있습니다. 상태와 승인 규칙은 유지되며, 팀 보기 저장에 함께 포함됩니다.", "Reorder and collapse columns. Status and approval rules stay unchanged. Team views include this layout.")}
      </p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {columns.map((column, index) => <li key={column.id}
          className="flex min-w-0 items-center gap-1 rounded-xl border border-line bg-canvas p-2"
          onDragOver={(event) => { if (dragId && !busy) event.preventDefault(); }}
          onDrop={(event) => { if (!dragId || busy) return; event.preventDefault(); reorder(dragId, index); setDragId(null); }}>
          <button type="button" draggable={!busy} disabled={busy}
            aria-label={`${bt(column.title, column.titleEn)} ${bt("열 드래그", "drag column")}`}
            onDragStart={(event) => {
              setDragId(column.id);
              event.dataTransfer.setData("application/x-toonstudio-column", column.id);
              event.dataTransfer.effectAllowed = "move";
            }} onDragEnd={() => setDragId(null)}
            className="min-h-11 min-w-11 cursor-grab rounded-lg focus-visible:ring-2 focus-visible:ring-accent">
            <GripVertical size={16} className="mx-auto" aria-hidden="true" />
          </button>
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-xs">
            <input type="checkbox" checked={!collapsedIds.includes(column.id)} disabled={busy}
              onChange={(event) => onChange("boardCollapsed", (event.target.checked
                ? collapsedIds.filter((id) => id !== column.id) : [...collapsedIds, column.id]).join(","))} />
            {bt(column.title, column.titleEn)}
          </label>
          <button type="button" disabled={busy || index === 0} onClick={() => reorder(column.id, index - 1)}
            aria-label={`${bt(column.title, column.titleEn)} ${bt("열 앞으로", "column earlier")}`}
            className="min-h-11 min-w-11 rounded-lg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30">
            <ArrowUp size={16} className="mx-auto" aria-hidden="true" />
          </button>
          <button type="button" disabled={busy || index === columns.length - 1} onClick={() => reorder(column.id, index + 1)}
            aria-label={`${bt(column.title, column.titleEn)} ${bt("열 뒤로", "column later")}`}
            className="min-h-11 min-w-11 rounded-lg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30">
            <ArrowDown size={16} className="mx-auto" aria-hidden="true" />
          </button>
        </li>)}
      </ol>
      <p className="mt-2 text-xs text-fg-3">
        {bt("체크를 해제하면 열이 접힙니다. 보관 열은 ‘보관 포함’ 필터에서 표시됩니다.", "Uncheck a column to collapse it. Archived columns appear with the archived filter.")}
      </p>
    </div>
  </details>;
}
