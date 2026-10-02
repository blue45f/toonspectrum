// 캐릭터 캐논 관리자 — 등록·목록·수정·삭제와 캐릭터별 생성 갤러리를 한 화면에 둔다.
// 게스트는 이 브라우저 localStorage에만 저장되고, 상단에 그 사실을 알린다.
import { useState } from "react";
import { ClipboardCopy, MessageCircle, Pencil, Plus, Trash2, UserRound, Users, X } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { buildCanonPromptBlock } from "./studio-character-canon-prompt";
import { StudioCharacterCanonEditor } from "./StudioCharacterCanonEditor";
import { StudioCharacterCanonGallery } from "./StudioCharacterCanonGallery";
import type { useStudioCharacterCanon } from "./useStudioCharacterCanon";
import type { CharacterCanonSheet } from "./studio-character-canon";

type CanonApi = ReturnType<typeof useStudioCharacterCanon>;

function SheetCard({
  sheet,
  usageCount,
  onEdit,
  onDelete,
  onCopy,
  copied,
}: {
  readonly sheet: CharacterCanonSheet;
  readonly usageCount: number;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onCopy: () => void;
  readonly copied: boolean;
}) {
  const bt = useBilingual("canon.manager");
  return (
    <li className="flex gap-3 rounded-xl border border-line bg-card p-3">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-raised">
        {sheet.referenceImage ? (
          <img src={sheet.referenceImage} alt={bt("캐릭터 레퍼런스", "Character reference")} className="size-full object-cover" />
        ) : (
          <UserRound size={22} className="text-fg-3" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm">{sheet.name}</strong>
        <p className="mt-0.5 line-clamp-2 text-[0.68rem] leading-relaxed text-fg-2">{sheet.appearance}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[0.62rem] text-fg-3">
          {sheet.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full border border-line bg-panel px-1.5 py-0.5">#{tag}</span>
          ))}
          {usageCount > 0 ? <span className="ml-1">{bt("패널", "Panels")} {usageCount}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" onClick={onEdit} aria-label={bt("캐릭터 수정", "Edit character") + `: ${sheet.name}`} className="grid size-11 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-fg">
          <Pencil size={14} aria-hidden />
        </button>
        <button type="button" onClick={onCopy} aria-label={bt("시트 텍스트 복사", "Copy sheet text") + `: ${sheet.name}`} title={copied ? bt("복사됨", "Copied") : undefined} className={cn("grid size-11 place-items-center rounded-lg border text-fg-3 hover:bg-raised hover:text-fg", copied ? "border-good/50 text-good" : "border-line")}>
          <ClipboardCopy size={14} aria-hidden />
        </button>
        <button type="button" onClick={onDelete} aria-label={bt("캐릭터 삭제", "Delete character") + `: ${sheet.name}`} className="grid size-11 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-bad">
          <Trash2 size={14} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function StudioCharacterCanonManager({
  canon,
  locale,
  onClose,
}: {
  readonly canon: CanonApi;
  readonly locale: string;
  readonly onClose?: () => void;
}) {
  const bt = useBilingual("canon.manager");
  const [view, setView] = useState<"library" | "gallery">("library");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CharacterCanonSheet | null>(null);
  const [galleryActiveId, setGalleryActiveId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (sheet: CharacterCanonSheet) => {
    setEditing(sheet);
    setEditorOpen(true);
  };

  const copySheet = async (sheet: CharacterCanonSheet) => {
    try {
      await navigator.clipboard.writeText(buildCanonPromptBlock(sheet));
      setCopiedId(sheet.id);
      window.setTimeout(() => setCopiedId((current) => (current === sheet.id ? null : current)), 1500);
    } catch {
      // 클립보드 권한이 없으면 조용히 넘어간다.
    }
  };

  return (
    <div className="flex max-h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-accent text-on-accent">
          <Users size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black">{bt("캐릭터 캐논", "Character canon")}</h3>
          <p className="truncate text-[0.65rem] text-fg-3">
            {bt(
              "매 패널마다 같은 얼굴·의상으로 그려지도록 캐릭터를 고정해요.",
              "Lock a character so every panel draws the same face and outfit.",
            )}
          </p>
        </div>
        <Link
          href="/character-chat/manage"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
        >
          <MessageCircle size={14} aria-hidden />
          {bt("캐릭터 챗 관리", "Character chats")}
        </Link>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent hover:bg-accent/90"
        >
          <Plus size={14} aria-hidden />
          {bt("새 캐릭터 등록", "Register character")}
        </button>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label={bt("닫기", "Close")} className="grid size-11 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-fg">
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      {canon.isGuest ? (
        <p className="rounded-lg border border-line bg-panel p-2 text-[0.65rem] leading-relaxed text-fg-3">
          {bt(
            "게스트로 쓰는 중이에요 — 캐논 시트는 이 브라우저에만 저장돼요. 로그인하면 서버에 보관되고 다른 기기에서도 쓸 수 있어요.",
            "You're browsing as a guest — canon sheets are stored in this browser only. Sign in to keep them on the server and use them on other devices.",
          )}
        </p>
      ) : null}

      <div className="flex gap-1" role="tablist" aria-label={bt("캐논 보기", "Canon views")}>
        {(
          [
            { id: "library", label: bt("캐릭터 목록", "Characters") },
            { id: "gallery", label: bt("생성 갤러리", "Gallery") },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              "min-h-11 flex-1 rounded-lg border px-3 text-xs font-semibold",
              view === tab.id ? "border-accent/50 bg-accent-soft text-fg" : "border-line bg-card text-fg-3 hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "library" ? (
          canon.sheets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-sm font-semibold">{bt("아직 등록된 캐릭터가 없어요.", "No characters registered yet.")}</p>
              <p className="mt-1 text-xs text-fg-3">
                {bt("이름·외모·의상을 한 번만 등록해 두면, AI가 매 컷마다 같은 캐릭터를 그려요.", "Register name, appearance, and outfit once, and the AI draws the same character in every panel.")}
              </p>
              <button type="button" onClick={openNew} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90">
                <Plus size={14} aria-hidden />
                {bt("첫 캐릭터 등록하기", "Register your first character")}
              </button>
            </div>
          ) : (
            <ul className="grid gap-2">
              {canon.sheets.map((sheet) => (
                <SheetCard
                  key={sheet.id}
                  sheet={sheet}
                  usageCount={canon.usageForCharacter(sheet.id).length}
                  onEdit={() => openEdit(sheet)}
                  onDelete={() => setConfirmDeleteId(sheet.id)}
                  onCopy={() => void copySheet(sheet)}
                  copied={copiedId === sheet.id}
                />
              ))}
            </ul>
          )
        ) : (
          <StudioCharacterCanonGallery
            sheets={canon.sheets}
            usageForCharacter={canon.usageForCharacter}
            activeId={galleryActiveId}
            onActiveChange={setGalleryActiveId}
            locale={locale}
          />
        )}
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[oklch(0.08_0.01_70/0.7)] p-3" role="dialog" aria-modal="true" aria-label={editing ? bt("캐릭터 캐논 수정", "Edit character canon") : bt("캐릭터 캐논 등록", "Register character canon")}>
          <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-canvas p-4 shadow-2xl">
            <StudioCharacterCanonEditor
              sheet={editing}
              onSubmit={(draft) => {
                const result = canon.saveSheet(draft, editing?.id ?? null);
                if (result.ok) {
                  setEditorOpen(false);
                  setEditing(null);
                  return [];
                }
                return result.errors;
              }}
              onCancel={() => {
                setEditorOpen(false);
                setEditing(null);
              }}
            />
          </div>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[oklch(0.08_0.01_70/0.7)] p-3" role="alertdialog" aria-modal="true" aria-label={bt("캐릭터 삭제 확인", "Confirm character deletion")}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-canvas p-4 shadow-2xl">
            <p className="text-sm font-bold">{bt("이 캐릭터 캐논을 삭제할까요?", "Delete this character canon?")}</p>
            <p className="mt-1 text-xs text-fg-3">{bt("시트와 이 캐릭터로 만든 패널 기록이 함께 지워져요.", "The sheet and its panel records will be removed together.")}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  canon.deleteSheet(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="min-h-11 flex-1 rounded-lg bg-bad px-3 text-sm font-bold text-white hover:opacity-90"
              >
                {bt("삭제", "Delete")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="min-h-11 flex-1 rounded-lg border border-line bg-card px-3 text-sm font-semibold hover:bg-raised"
              >
                {bt("취소", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
