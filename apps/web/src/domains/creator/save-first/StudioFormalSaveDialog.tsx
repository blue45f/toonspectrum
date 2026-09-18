import {
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Cloud, FileArchive, LoaderCircle, X } from "lucide-react";
import { useId, useRef } from "react";
import { createPortal } from "react-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";

import { useStudioModalSheet } from "../useStudioModalSheet";

export interface StudioFormalSaveDialogProps {
  readonly open: boolean;
  readonly locale: string;
  readonly projectTitle: string;
  readonly firstSave: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSaveFile: () => void;
  readonly onOpenPersonalDrive: () => void;
}

export function StudioFormalSaveDialog({
  open,
  locale,
  projectTitle,
  firstSave,
  busy,
  error,
  onClose,
  onSaveFile,
  onOpenPersonalDrive,
}: StudioFormalSaveDialogProps) {  const instanceId = useId().replace(/:/gu, "");
  const dialogRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body,
  );
  const dismiss = () => {
    if (!busy) onClose();
  };

  useStudioModalSheet({
    activeKey: open ? `formal-project-save:${instanceId}` : null,
    dialogRef,
    onDismiss: dismiss,
    resolveInitialFocus: (dialog) => dialog.querySelector<HTMLElement>("[data-autofocus]"),
    rootRef,
  });

  if (!open || typeof document === "undefined") return null;
  const titleId = `${instanceId}-title`;
  const descriptionId = `${instanceId}-description`;
  const title = firstSave
    ? translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "어디에 정식 저장할까요?", "Where should this be formally saved?")
    : translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "프로젝트 원본을 저장할까요?", "Save the editable project original?");

  const content = (
    <div
      className="fixed inset-0 z-[170] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || undefined}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="w-full max-w-2xl rounded-3xl border border-line bg-card p-5 shadow-2xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
              {firstSave ? translateCurrentStaticSourceText("domains.creator.save.first.StudioFormalSaveDialog", "en", "FIRST SAVE") : translateCurrentStaticSourceText("domains.creator.save.first.StudioFormalSaveDialog", "en", "PROJECT SAVE")}
            </p>
            <h2 id={titleId} className="mt-1 text-xl font-black text-fg sm:text-2xl">
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-fg-3">
              {translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", `“${projectTitle}”의 임시 자동저장본은 그대로 유지됩니다. 편집 가능한 원본을 저장할 위치를 선택하세요.`, `The temporary autosave for “${projectTitle}” remains intact. Choose where to save the editable original.`)}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}            onClick={onClose}
            aria-label={translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "저장 창 닫기", "Close save dialog")}
            className={buttonClass({ variant: "quiet", size: "icon" })}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-autofocus="true"
            disabled={busy}
            onClick={onSaveFile}
            className="rounded-2xl border border-accent/35 bg-accent-soft/20 p-4 text-left transition-colors hover:bg-accent-soft/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-wait disabled:opacity-60"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-card text-accent">
              {busy
                ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <FileArchive size={18} aria-hidden="true" />}
            </span>
            <b className="mt-3 block text-sm text-fg">
              {translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "파일·동기화 폴더", "File or synced folder")}
            </b>
            <span className="mt-1 block text-xs leading-5 text-fg-3">
              {translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "현재 캔버스 원고와 프로젝트 문서를 포함한 .toonstudio 원본을 저장합니다.", "Save a .toonstudio original containing the current canvas and project documents.")}
            </span>
          </button>          <button
            type="button"
            disabled={busy}
            onClick={onOpenPersonalDrive}
            className="rounded-2xl border border-line bg-panel/50 p-4 text-left transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:opacity-60"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-card text-accent">
              <Cloud size={18} aria-hidden="true" />
            </span>
            <b className="mt-3 block text-sm text-fg">
              {translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "개인 드라이브", "Personal drive")}
            </b>
            <span className="mt-1 block text-xs leading-5 text-fg-3">
              {translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "Google Drive, Dropbox 또는 OneDrive 연결 화면으로 이동합니다.", "Open the connection flow for Google Drive, Dropbox or OneDrive.")}
            </span>
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-xs leading-5 text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-panel/60 p-3">
          <p className="text-xs leading-5 text-fg-3">            {translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "지금 닫아도 브라우저의 임시 자동저장본에서 계속 작업할 수 있습니다.", "Closing this dialog keeps the browser autosave available for continued work.")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className={buttonClass({ variant: "quiet", size: "sm" })}
          >
            {translateBilingualValueForLocale(locale, "domains.creator.save.first.StudioFormalSaveDialog", "계속 임시 저장", "Keep temporary")}
          </button>
        </div>
      </section>
    </div>
  );
  return createPortal(content, document.body);
}
