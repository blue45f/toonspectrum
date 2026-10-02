// AI 코믹 디렉터 생성 흐름에서 쓸 캐논 캐릭터 선택기.
// 체크한 캐릭터들이 선택 컷들의 그림 프롬프트에 일관되게 주입된다.
import { UserRound } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { CharacterCanonSheet } from "./studio-character-canon";

export function StudioCharacterCanonPicker({
  sheets,
  selectedIds,
  onToggle,
  disabled,
  compact,
}: {
  readonly sheets: readonly CharacterCanonSheet[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (sheetId: string) => void;
  readonly disabled?: boolean;
  readonly compact?: boolean;
}) {
  const bt = useBilingual("canon.picker");

  if (sheets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-fg-3">
        {bt(
          "등록된 캐논 캐릭터가 없어요. 아래에서 먼저 캐릭터를 등록하세요.",
          "No canon characters yet. Register a character below first.",
        )}
      </p>
    );
  }

  return (
    <ul className={cn("grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-3")} aria-label={bt("캐논 캐릭터 선택", "Choose canon characters")}>
      {sheets.map((sheet) => {
        const selected = selectedIds.includes(sheet.id);
        return (
          <li key={sheet.id}>
            <button
              type="button"
              onClick={() => onToggle(sheet.id)}
              aria-pressed={selected}
              disabled={disabled}
              className={cn(
                "flex min-h-14 w-full items-center gap-2 rounded-xl border p-2 text-left",
                selected
                  ? "border-accent/60 bg-accent-soft ring-1 ring-accent/40"
                  : "border-line bg-card hover:border-accent/40",
                disabled && "opacity-60",
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-raised">
                {sheet.referenceImage ? (
                  <img src={sheet.referenceImage} alt="" className="size-full object-cover" />
                ) : (
                  <UserRound size={18} className="text-fg-3" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-xs">{sheet.name}</strong>
                <span className="block truncate text-[0.62rem] text-fg-3">
                  {sheet.tags.slice(0, 3).join(" · ") || sheet.outfit || bt("시트 등록됨", "Sheet registered")}
                </span>
              </span>
              <input
                type="checkbox"
                checked={selected}
                tabIndex={-1}
                aria-hidden
                readOnly
                className="ml-auto size-4 shrink-0 accent-accent"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
