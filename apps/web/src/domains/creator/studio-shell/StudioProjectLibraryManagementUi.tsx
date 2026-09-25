import { translateCurrentStaticSourceText, formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import {
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useId, useRef, type ReactNode } from "react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  studioSaveSafetySummary,
  type StudioSaveProfile,
} from "../save-first/studio-save-profile";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { StudioProjectCardThumbnail } from "./StudioProjectCardThumbnail";
import { useStudioModalSheet } from "../useStudioModalSheet";
import {
  studioProjectIsTemporaryWork,
  studioProjectLibraryTypeLabel,
  studioProjectLibraryDateLabel,
  type StudioProjectLibraryLocale,
  type StudioProjectLibraryManagementView,
} from "./studio-project-library-management-model";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryManagementUi", ko, en);

export function StudioProjectSaveBadge({
  profile,
  locale: _locale,
}: {
  readonly profile: StudioSaveProfile;
  readonly locale: StudioProjectLibraryLocale;
}) {
  useBilingualI18nRevision();
  if (studioProjectIsTemporaryWork(profile)) {
    return (
      <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-warning/35 bg-warning-soft/20 px-2.5 text-[0.68rem] font-bold text-warning">
        <HardDrive size={13} aria-hidden="true" />
        {bi("임시 자동저장", "Temporary autosave")}
      </span>
    );
  }
  const summary = studioSaveSafetySummary(profile);
  const Icon = summary.needsBackup ? CloudOff : CheckCircle2;
  return (
    <span className={cn(
      "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.68rem] font-bold",
      summary.needsBackup
        ? "border-warning/35 bg-warning-soft/20 text-warning"
        : "border-success/35 bg-success-soft/20 text-success",
    )}>
      <Icon size={13} aria-hidden="true" />
      {bi(summary.headline, summary.needsBackup ? "Backup needs attention" : "Backup ready")}
    </span>
  );
}

export function StudioProjectSelectionCheckbox({
  checked,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: () => void;
}) {
  useBilingualI18nRevision();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        checked
          ? "border-accent bg-accent text-on-accent"
          : "border-line bg-panel text-transparent hover:border-accent/55",
      )}
    >
      <Check size={16} aria-hidden="true" />
    </button>
  );
}

export function StudioProjectLibraryModal({
  title,
  description,
  children,
  closeLabel,
  onClose,
  danger = false,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly danger?: boolean;
}) {
  useBilingualI18nRevision();
  const instanceId = useId().replace(/:/gu, "");
  const titleId = `${instanceId}-title`;
  const descriptionId = `${instanceId}-description`;
  const dialogRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body,
  );
  useStudioModalSheet({
    activeKey: `project-library-modal:${instanceId}`,
    dialogRef,
    onDismiss: onClose,
    rootRef,
  });
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] grid place-items-center p-3"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-modal-backdrop="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
      />
      <section
        ref={dialogRef}
        role={danger ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioProjectLibraryManagementUi", "en", "alertdialog") : translateCurrentStaticSourceText("domains.creator.studio.shell.StudioProjectLibraryManagementUi", "en", "dialog")}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-line bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-black text-fg">{title}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-fg-2">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={buttonClass({ variant: "quiet", size: "icon" })}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}

export function StudioProjectLibraryCard({
  project,
  profile,
  locale,
  authUserId,
  checked,
  temporary,
  localFileSaved,
  busy,
  continueHref,
  resumeSummary,
  resumeExact,
  overviewHref,
  storageHref,
  onToggle,
  onTouch,
  onOpenSave,
  onSavePackage,
  onDuplicate,
  onArchive,
  onTrash,
}: {
  readonly project: StudioProjectLibraryEntry;
  readonly profile: StudioSaveProfile;
  readonly locale: StudioProjectLibraryLocale;
  readonly authUserId: string | null;
  readonly checked: boolean;
  readonly temporary: boolean;
  readonly localFileSaved: boolean;
  readonly busy: boolean;
  readonly continueHref: string;
  readonly resumeSummary: string | null;
  readonly resumeExact: boolean;
  readonly overviewHref: string;
  readonly storageHref: string;
  readonly onToggle: () => void;
  readonly onTouch: () => void;
  readonly onOpenSave: () => void;
  readonly onSavePackage: () => void;
  readonly onDuplicate: () => void;
  readonly onArchive: () => void;
  readonly onTrash: () => void;
}) {
  useBilingualI18nRevision();
  return (
    <article
      data-studio-project-card="true"
      data-selected={checked || undefined}
      className={cn(
        "overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-colors",
        checked ? "border-accent ring-2 ring-accent/15" : "border-line",
      )}
    >
      <StudioProjectCardThumbnail
        authUserId={authUserId}
        locale={locale}
        project={project}
      />
      <div className="mt-4 flex items-start gap-3">
        <StudioProjectSelectionCheckbox
          checked={checked}
          label={formatI18nTemplate(String(bi("{value0} 선택", "Select {value0}")), { value0: project.title })}
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-panel px-2.5 py-1 text-[0.66rem] font-bold text-fg-2">
              {studioProjectLibraryTypeLabel(project)}
            </span>
            <StudioProjectSaveBadge profile={profile} locale={locale} />
          </div>
          <h3 className="mt-3 truncate text-lg font-black text-fg">{project.title}</h3>
          <p className="mt-1 text-xs text-fg-3">
            {bi("마지막 작업", "Last opened")}{" "}
            {studioProjectLibraryDateLabel(project.lastOpenedAt, locale)}
          </p>
          {resumeSummary ? (
            <div className={cn(
              "mt-2 rounded-xl border px-3 py-2 text-[0.68rem] leading-5",
              resumeExact
                ? "border-accent/30 bg-accent-soft/20 text-fg-2"
                : "border-line bg-panel/55 text-fg-3",
            )}>
              <p className="font-black text-fg">
                {resumeExact
                  ? locale === "ko" ? "최근 위치 기억됨" : "Recent position remembered"
                  : locale === "ko" ? "최근 문서로 이동" : "Continue in recent document"}
              </p>
              <p className="mt-0.5 break-words">{resumeSummary}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-panel/60 p-3 text-[0.68rem]">
        <div>
          <p className="font-semibold text-fg-3">{bi("작업 상태", "Work status")}</p>
          <p className="mt-1 font-black text-fg">
            {temporary
              ? bi("이 기기 임시본", "Temporary on device")
              : bi("프로젝트", "Project")}
          </p>
        </div>
        <div>
          <p className="font-semibold text-fg-3">{bi("마지막 정식 저장", "Last explicit save")}</p>
          <p className="mt-1 font-black text-fg">
            {studioProjectLibraryDateLabel(profile.lastManualSaveAt, locale)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <Link
          href={continueHref}
          onClick={onTouch}
          className={buttonClass({ size: "sm", className: "min-w-32 flex-1 gap-1.5" })}
        >
          <FolderOpen size={15} aria-hidden="true" />
          {bi("이어서 작업", "Continue")}
        </Link>
        {temporary ? (
          <button
            type="button"
            onClick={onOpenSave}
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <Save size={15} aria-hidden="true" />
            {bi("정식 저장", "Save")}
          </button>
        ) : localFileSaved ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSavePackage}
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <Download size={15} aria-hidden="true" />
            {bi("파일 다시 저장", "Save file again")}
          </button>
        ) : (
          <Link
            href={storageHref}
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <Cloud size={15} aria-hidden="true" />
            {bi("저장·백업", "Save & backup")}
          </Link>
        )}
        <button
          type="button"
          onClick={onDuplicate}
          aria-label={formatI18nTemplate(String(bi("{value0} 복제", "Duplicate {value0}")), { value0: project.title })}
          className={buttonClass({ variant: "quiet", size: "icon" })}
        >
          <Copy size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-3">
        <Link href={overviewHref} className="text-[0.68rem] font-semibold text-accent hover:underline">
          {bi("프로젝트 관리", "Manage project")}
        </Link>
        <button type="button" onClick={onArchive} className="text-[0.68rem] font-semibold text-fg-3 hover:text-fg">
          {bi("보관", "Archive")}
        </button>
        <button type="button" onClick={onTrash} className="text-[0.68rem] font-semibold text-danger">
          {bi("휴지통", "Trash")}
        </button>
      </div>
    </article>
  );
}

export function StudioProjectLibraryRecoveryRow({
  project,
  locale,
  view,
  checked,
  onToggle,
  onRestore,
  onTrash,
  onDelete,
}: {
  readonly project: StudioProjectLibraryEntry;
  readonly locale: StudioProjectLibraryLocale;
  readonly view: StudioProjectLibraryManagementView;
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly onRestore: () => void;
  readonly onTrash: () => void;
  readonly onDelete: () => void;
}) {
  useBilingualI18nRevision();
  return (
    <article
      data-studio-project-card="true"
      data-selected={checked || undefined}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
        checked ? "border-accent ring-2 ring-accent/15" : "border-line",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <StudioProjectSelectionCheckbox
          checked={checked}
          label={formatI18nTemplate(String(bi("{value0} 선택", "Select {value0}")), { value0: project.title })}
          onChange={onToggle}
        />
        <div className="min-w-0">
          <h2 className="truncate font-black text-fg">{project.title}</h2>
          <p className="mt-1 text-xs text-fg-3">
            {studioProjectLibraryTypeLabel(project)} · {studioProjectLibraryDateLabel(project.updatedAt, locale)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onRestore}
          className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {bi("복원", "Restore")}
        </button>
        {view === "archived" ? (
          <button
            type="button"
            onClick={onTrash}
            className={buttonClass({ variant: "quiet", size: "sm", className: "text-danger" })}
          >
            <Trash2 size={14} aria-hidden="true" />
            {bi("휴지통", "Trash")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            className={buttonClass({ variant: "quiet", size: "sm", className: "text-danger" })}
          >
            <Trash2 size={14} aria-hidden="true" />
            {bi("완전 삭제", "Delete")}
          </button>
        )}
      </div>
    </article>
  );
}
