import { FolderOpen, HardDrive, Plus } from "lucide-react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";

import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import {
  StudioProjectLibraryCard,
  StudioProjectLibraryRecoveryRow,
} from "./StudioProjectLibraryManagementUi";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

export function StudioProjectLibraryManagementContent({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  const {
    authUserId, locale, view, library, profiles, query, selectedIds, setSelection,
    busyProjectId, setSaveTarget, setDeleteRequest,
    visibleProjects, temporaryProjects, savedProjects, archiveProjects,
    trashProjects, restoreProjects, duplicateProject, savePackage,
    projectOverviewHref, continueProjectHref,
  } = controller;

  const renderProjectCard = (project: StudioProjectLibraryEntry, temporary: boolean) => {
    const profile = profiles.profileFor(project.id);
    const checked = selectedIds.has(project.id);
    const localFileSaved = profile.bindings.some((binding) => (
      binding.provider === "local-file" && binding.syncState === "synced"
    ));
    return (
      <StudioProjectLibraryCard
        key={project.id}
        authUserId={authUserId}
        project={project}
        profile={profile}
        locale={locale}
        checked={checked}
        temporary={temporary}
        localFileSaved={localFileSaved}
        busy={busyProjectId !== null}
        continueHref={continueProjectHref(project)}
        overviewHref={projectOverviewHref(project)}
        storageHref={`/studio?view=storage&project=${encodeURIComponent(project.id)}`}
        onToggle={() => setSelection(project.id, !checked)}
        onTouch={() => { library.touch(project.id, project.lastOpenedDocumentId); }}
        onOpenSave={() => setSaveTarget(project)}
        onSavePackage={() => { void savePackage(project); }}
        onDuplicate={() => duplicateProject(project)}
        onArchive={() => archiveProjects([project.id])}
        onTrash={() => trashProjects([project.id])}
      />
    );
  };

  const renderRecoveryRow = (project: StudioProjectLibraryEntry) => {
    const checked = selectedIds.has(project.id);
    return (
      <StudioProjectLibraryRecoveryRow
        key={project.id}
        project={project}
        locale={locale}
        view={view}
        checked={checked}
        onToggle={() => setSelection(project.id, !checked)}
        onRestore={() => restoreProjects([project.id])}
        onTrash={() => trashProjects([project.id])}
        onDelete={() => setDeleteRequest({ ids: [project.id], source: "single" })}
      />
    );
  };

  return (
    <>
      {visibleProjects.length === 0 ? (
        <section className="mt-5 rounded-3xl border border-dashed border-line bg-card/60 px-5 py-14 text-center">
          <FolderOpen size={24} className="mx-auto text-fg-3" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black text-fg">
            {query
              ? locale === "ko" ? "검색 결과가 없습니다" : "No matching projects"
              : locale === "ko" ? "표시할 작업이 없습니다" : "No work to show"}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-3">
            {view === "active"
              ? locale === "ko" ? "새 작업은 그리는 즉시 임시 자동저장되며 이 화면에 나타납니다." : "New work is temporarily autosaved as soon as you draw and appears here."
              : view === "archived"
                ? locale === "ko" ? "보관한 프로젝트가 없습니다." : "There are no archived projects."
                : locale === "ko" ? "휴지통이 비어 있습니다." : "Trash is empty."}
          </p>
          {view === "active" && !query ? (
            <Link href="/studio/new" className={buttonClass({ className: "mt-5 gap-2" })}>
              <Plus size={16} aria-hidden="true" />
              {locale === "ko" ? "새 작업 시작" : "Start new work"}
            </Link>
          ) : null}
        </section>
      ) : view === "active" ? (
        <div className="mt-6 space-y-8">
          {temporaryProjects.length > 0 ? (
            <section aria-labelledby="temporary-work-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="temporary-work-title" className="text-xl font-black text-fg">
                    {locale === "ko" ? "임시 작업" : "Temporary work"}
                    <span className="ml-2 text-sm font-bold text-fg-3">{temporaryProjects.length}</span>
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-fg-3">
                    {locale === "ko"
                      ? "이 기기에 자동저장된 작업입니다. 정식 저장을 누르면 그때 저장 위치를 선택합니다."
                      : "Autosaved on this device. Choose a destination only when you explicitly save."}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft/20 px-3 py-1.5 text-[0.68rem] font-bold text-warning">
                  <HardDrive size={13} aria-hidden="true" />
                  {locale === "ko" ? "복구 가능" : "Recoverable"}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {temporaryProjects.map((project) => renderProjectCard(project, true))}
              </div>
            </section>
          ) : null}

          {savedProjects.length > 0 ? (
            <section aria-labelledby="saved-projects-title">
              <div>
                <h2 id="saved-projects-title" className="text-xl font-black text-fg">
                  {locale === "ko" ? "프로젝트" : "Projects"}
                  <span className="ml-2 text-sm font-bold text-fg-3">{savedProjects.length}</span>
                </h2>
                <p className="mt-1 text-xs leading-5 text-fg-3">
                  {locale === "ko" ? "파일 또는 개인 저장소와 연결한 정식 프로젝트입니다." : "Formally saved projects connected to a file or personal storage."}
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {savedProjects.map((project) => renderProjectCard(project, false))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <section className="mt-5 space-y-3">
          {visibleProjects.map(renderRecoveryRow)}
        </section>
      )}

      <footer className="mt-10 border-t border-line pt-5 text-xs leading-5 text-fg-3">
        {locale === "ko"
          ? "임시 자동저장, 정식 저장, 백업, 내보내기와 게시를 분리해 관리합니다. 휴지통의 완전 삭제만 되돌릴 수 없습니다."
          : "Temporary autosave, explicit save, backup, export and publishing are managed separately. Only permanent deletion from Trash cannot be undone."}
      </footer>
    </>
  );
}
