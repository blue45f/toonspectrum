// AI 코믹 디렉터 "컷 연출" 단계에 들어가는 캐릭터 캐논 섹션.
// 캐논 캐릭터를 고르고 "선택 컷에 반영"을 누르면, 선택된 컷들의 그림 프롬프트에
// 캐릭터 시트(외모·의상·특징)가 멱등하게 주입된다. 실제 이미지 생성 API 호출은
// 하지 않는다 — 프롬프트 구성과 사용 기록(갤러리용)까지가 이 섹션의 범위.
import { useState } from "react";
import { BookUser, WandSparkles } from "lucide-react";

import { formatI18nTemplate, getActiveI18nLocale, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { StudioCharacterCanonManager } from "./StudioCharacterCanonManager";
import { StudioCharacterCanonPicker } from "./StudioCharacterCanonPicker";
import type { useStudioCharacterCanon } from "./useStudioCharacterCanon";
import type { CharacterCanonSheet } from "./studio-character-canon";

type CanonApi = ReturnType<typeof useStudioCharacterCanon>;

export function StudioCharacterCanonDirectorSection({
  canon,
  selectedPanelCount,
  onApplyCanon,
  disabled,
}: {
  readonly canon: CanonApi;
  /** 현재 선택된 컷 수 — 버튼 문구와 비활성화에 쓴다. */
  readonly selectedPanelCount: number;
  /** 선택된 캐릭터 시트들을 부모(디렉터 패널)가 선택 컷들에 주입한다. */
  readonly onApplyCanon: (sheets: readonly CharacterCanonSheet[]) => void;
  readonly disabled?: boolean;
}) {
  const bt = useBilingual("canon.director");
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (sheetId: string) => {
    setSelectedIds((current) =>
      current.includes(sheetId)
        ? current.filter((id) => id !== sheetId)
        : [...current, sheetId],
    );
  };

  const apply = () => {
    const sheets = canon.sheets.filter((sheet) => selectedIds.includes(sheet.id));
    if (sheets.length === 0 || selectedPanelCount === 0 || disabled) return;
    onApplyCanon(sheets);
    setNotice(
      formatI18nTemplate(
        bt("{v0}개 캐릭터를 {v1}개 컷의 프롬프트에 반영했어요.", "Applied {v0} character(s) to {v1} panel prompt(s)."),
        { v0: String(sheets.length), v1: String(selectedPanelCount) },
      ),
    );
  };

  return (
    <section aria-label={bt("캐릭터 캐논", "Character canon")} className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold">
          <BookUser size={14} className="text-accent" aria-hidden />
          {bt("캐릭터 캐논", "Character canon")}
        </h3>
        <p className="w-full text-[0.62rem] text-fg-3 sm:w-auto">
          {bt(
            "고른 캐릭터의 외모·의상·특징이 선택한 컷들의 프롬프트에 그대로 들어가요.",
            "The selected characters' appearance, outfit, and traits are injected into the selected panels' prompts.",
          )}
        </p>
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          disabled={disabled}
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised disabled:opacity-60"
        >
          {bt("캐릭터 등록·관리", "Register & manage")}
        </button>
      </div>

      <StudioCharacterCanonPicker
        sheets={canon.sheets}
        selectedIds={selectedIds}
        onToggle={toggle}
        disabled={disabled}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={disabled || selectedIds.length === 0 || selectedPanelCount === 0}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:opacity-45"
        >
          <WandSparkles size={14} aria-hidden />
          {formatI18nTemplate(
            bt("선택한 {v0}컷에 캐논 반영", "Apply canon to {v0} selected panel(s)"),
            { v0: String(selectedPanelCount) },
          )}
        </button>
        {notice ? (
          <p role="status" className="text-[0.65rem] text-good">{notice}</p>
        ) : null}
      </div>

      {managerOpen ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-[oklch(0.08_0.01_70/0.7)] p-3"
          role="dialog"
          aria-modal="true"
          aria-label={bt("캐릭터 캐논 관리", "Manage character canon")}
        >
          <div className={cn("flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-canvas p-4 shadow-2xl")}>
            <StudioCharacterCanonManager
              canon={canon}
              locale={getActiveI18nLocale()}
              onClose={() => setManagerOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
