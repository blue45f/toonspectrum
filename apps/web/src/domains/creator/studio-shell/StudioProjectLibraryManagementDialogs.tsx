import {
  formatI18nTemplate,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Cloud, FileArchive, Trash2 } from "lucide-react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";

import { StudioProjectLibraryModal } from "./StudioProjectLibraryManagementUi";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

export function StudioProjectLibraryManagementDialogs({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  const {
    locale, busyProjectId, saveTarget, setSaveTarget, deleteRequest,
    setDeleteRequest, listedProjects, savePackage, permanentlyDeleteProjects,
  } = controller;
  return (
    <>
      {saveTarget ? (
        <StudioProjectLibraryModal
          title={translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "어디에 정식 저장할까요?", "Where should this be formally saved?")}
          description={translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", `“${saveTarget.title}”의 임시 자동저장본은 그대로 유지됩니다. 파일 또는 개인 드라이브를 선택하세요.`, `The temporary autosave of “${saveTarget.title}” remains intact. Choose a file or personal drive.`)}
          closeLabel={translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "닫기", "Close")}
          onClose={() => setSaveTarget(null)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busyProjectId !== null}
              onClick={() => { void savePackage(saveTarget); }}
              className="rounded-2xl border border-accent/35 bg-accent-soft/20 p-4 text-left transition-colors hover:bg-accent-soft/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-card text-accent">
                <FileArchive size={18} aria-hidden="true" />
              </span>
              <b className="mt-3 block text-sm text-fg">{translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "파일·동기화 폴더", "File or synced folder")}</b>
              <span className="mt-1 block text-xs leading-5 text-fg-3">
                {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", ".toonstudio 원본을 컴퓨터나 동기화 폴더에 저장합니다.", "Save an editable .toonstudio original to your computer or synced folder.")}
              </span>
            </button>
            <Link
              href={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "en", "/studio?view=storage&project={v0}"), { v0: String(encodeURIComponent(saveTarget.id)) })}
              className="rounded-2xl border border-line bg-panel/50 p-4 text-left transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-card text-accent">
                <Cloud size={18} aria-hidden="true" />
              </span>
              <b className="mt-3 block text-sm text-fg">{translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "개인 드라이브", "Personal drive")}</b>
              <span className="mt-1 block text-xs leading-5 text-fg-3">
                {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "Google Drive, Dropbox 또는 OneDrive를 연결합니다.", "Connect Google Drive, Dropbox or OneDrive.")}
              </span>
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-panel/60 p-3">
            <p className="text-xs leading-5 text-fg-3">
              {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "지금 선택하지 않아도 임시 작업에서 계속 이어갈 수 있습니다.", "You can keep working from Temporary work without choosing now.")}
            </p>
            <button type="button" onClick={() => setSaveTarget(null)} className={buttonClass({ variant: "quiet", size: "sm" })}>
              {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "계속 임시 저장", "Keep temporary")}
            </button>
          </div>
        </StudioProjectLibraryModal>
      ) : null}

      {deleteRequest ? (
        <StudioProjectLibraryModal
          danger
          title={deleteRequest.source === "all"
            ? translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "휴지통을 비울까요?", "Empty Trash?")
            : translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "완전히 삭제할까요?", "Delete permanently?")}
          description={translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", `${deleteRequest.ids.length}개 프로젝트의 목록·저장 설정·문서 메타데이터를 삭제합니다. 이 작업은 실행 취소할 수 없습니다.`, `This removes the library entries, save settings and document metadata for ${deleteRequest.ids.length} project(s). This cannot be undone.`)}
          closeLabel={translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "닫기", "Close")}
          onClose={() => setDeleteRequest(null)}
        >
          <div className="rounded-2xl border border-danger/30 bg-danger-soft/15 p-4">
            <p className="text-sm font-black text-danger">
              {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "백업 파일이 필요한지 먼저 확인하세요.", "Confirm that you no longer need a backup file.")}
            </p>
            <ul className="mt-3 space-y-1 text-xs text-fg-2">
              {deleteRequest.ids.slice(0, 5).map((projectId) => {
                const project = listedProjects.find((candidate) => candidate.id === projectId);
                return <li key={projectId}>• {project?.title ?? projectId}</li>;
              })}
              {deleteRequest.ids.length > 5 ? (
                <li>• {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", `외 ${deleteRequest.ids.length - 5}개`, `and ${deleteRequest.ids.length - 5} more`)}</li>
              ) : null}
            </ul>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setDeleteRequest(null)} className={buttonClass({ variant: "outline" })}>
              {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "취소", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => permanentlyDeleteProjects(deleteRequest.ids)}
              className={buttonClass({ className: "bg-danger text-white hover:bg-danger/90" })}
            >
              <Trash2 size={15} aria-hidden="true" />
              {deleteRequest.source === "all"
                ? translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "휴지통 비우기", "Empty Trash")
                : translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioProjectLibraryManagementDialogs", "완전 삭제", "Delete permanently")}
            </button>
          </div>
        </StudioProjectLibraryModal>
      ) : null}
    </>
  );
}
