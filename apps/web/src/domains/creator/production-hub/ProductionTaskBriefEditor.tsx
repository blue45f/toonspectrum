import { productionText, useProductionCopy } from "./production-workboard-copy";
import { ArrowDown, ArrowUp, GripVertical, ListChecks, Pilcrow, Quote, Trash2, Type } from "lucide-react";
import { useState } from "react";
import type { ProductionTaskBriefBlock } from "@toonstudio/core/production";
import { moveProductionItem } from "./production-workboard-model";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly blocks: readonly ProductionTaskBriefBlock[];
  readonly onChange: (blocks: readonly ProductionTaskBriefBlock[]) => void;
  readonly disabled?: boolean;
}
const BLOCK_TYPES = [
  { kind: "paragraph", label: "본문", icon: Pilcrow },
  { kind: "heading", label: "제목", icon: Type },
  { kind: "checklist", label: "체크 항목", icon: ListChecks },
  { kind: "quote", label: "참고 메모", icon: Quote },
] as const;
export function ProductionTaskBriefEditor({ blocks, onChange, disabled = false }: Props) {
  useProductionCopy();
  const [dragId, setDragId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const patch = (id: string, changes: Partial<ProductionTaskBriefBlock>) =>
    onChange(blocks.map((block) => (block.id === id ? { ...block, ...changes } : block)));
  const move = (from: number, to: number) => {
    if (disabled) return;
    onChange(moveProductionItem(blocks, from, to));
    setNotice(`${from + 1}번째 블록을 ${to + 1}번째로 이동했습니다.`);
  };
  return (
    <section
      aria-label={productionText("작업 설명 블록 편집기")}
      className="min-w-0 rounded-2xl border border-line bg-canvas p-3"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {BLOCK_TYPES.map(({ kind, label, icon: Icon }) => (
          <button
            type="button"
            key={kind}
            disabled={disabled || blocks.length >= 40}
            className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11")}
            onClick={() =>
              onChange([
                ...blocks,
                {
                  id: crypto.randomUUID(),
                  kind,
                  text: "",
                  ...(kind === "checklist" ? { checked: false } : {}),
                },
              ])
            }
          >
            <Icon size={15} />
            {label} {productionText("추가")}
          </button>
        ))}
      </div>
      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-5 text-sm leading-6 text-fg-3">
          {productionText(
            "본문·제목·체크 항목을 추가해 작업 지시서를 만드세요. 체크리스트는 작업 메모이며 공식 승인을 대신하지 않습니다.",
          )}
        </p>
      ) : null}
      <div className="space-y-3">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className={cn(
              "min-w-0 rounded-xl border border-line bg-card p-3",
              block.kind === "quote" && "border-l-4 border-l-accent",
            )}
            onDragOver={(event) => {
              if (dragId && !disabled) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragId)
                move(
                  blocks.findIndex((entry) => entry.id === dragId),
                  index,
                );
              setDragId(null);
            }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-fg-3">
                {String(index + 1).padStart(2, "0")} ·{" "}
                {BLOCK_TYPES.find((entry) => entry.kind === block.kind)?.label}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  draggable={!disabled}
                  disabled={disabled}
                  aria-label={`${index + 1}번 블록 드래그`}
                  className={cn(
                    buttonClass({ variant: "ghost", size: "icon" }),
                    "min-h-11 min-w-11 cursor-grab",
                  )}
                  onDragStart={(event) => {
                    setDragId(block.id);
                    event.dataTransfer.setData("application/x-toonstudio-brief-block", block.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragId(null)}
                >
                  <GripVertical size={16} />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={`${index + 1}번 블록 위로`}
                  className={cn(buttonClass({ variant: "ghost", size: "icon" }), "min-h-11 min-w-11")}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === blocks.length - 1}
                  aria-label={`${index + 1}번 블록 아래로`}
                  className={cn(buttonClass({ variant: "ghost", size: "icon" }), "min-h-11 min-w-11")}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${index + 1}번 블록 삭제`}
                  className={cn(
                    buttonClass({ variant: "ghost", size: "icon" }),
                    "min-h-11 min-w-11 text-bad",
                  )}
                  onClick={() => onChange(blocks.filter((entry) => entry.id !== block.id))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-start gap-3">
              {block.kind === "checklist" ? (
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={block.checked ?? false}
                  onChange={(event) => patch(block.id, { checked: event.target.checked })}
                  aria-label={`${index + 1}번 체크 항목 완료`}
                  className="mt-3 size-5 shrink-0"
                />
              ) : null}
              <textarea
                aria-label={`${index + 1}번 ${
                  BLOCK_TYPES.find((entry) => entry.kind === block.kind)?.label ?? "본문"
                }`}
                disabled={disabled}
                value={block.text}
                maxLength={4000}
                rows={block.kind === "paragraph" || block.kind === "quote" ? 3 : 2}
                onChange={(event) => patch(block.id, { text: event.target.value })}
                className={cn(
                  "min-h-11 min-w-0 w-full resize-y rounded-lg border border-transparent bg-transparent p-2 leading-7 text-fg placeholder:text-fg-3 focus-visible:border-accent focus-visible:outline-none",
                  block.kind === "heading" ? "text-lg font-bold" : "text-sm",
                  block.checked && block.kind === "checklist" && "text-fg-3 line-through",
                )}
                placeholder={block.kind === "heading" ? "섹션 제목" : "내용을 입력하세요"}
              />
            </div>
          </div>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {notice}
      </p>
      <p className="mt-3 text-xs text-fg-3">
        {productionText("블록")}
        {blocks.length}
        {productionText("/40 · 드래그 또는 화살표로 순서 변경")}
      </p>
    </section>
  );
}
