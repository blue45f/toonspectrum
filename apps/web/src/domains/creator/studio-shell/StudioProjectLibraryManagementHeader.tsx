import {

  translateCurrentStaticSourceText,
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision
} from "@/shared/lib/i18n-bilingual-copy";
import { Archive, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS,
  STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS,
  studioProjectLibraryManagementViewHref,
  type StudioProjectLibrarySortMode,
} from "./studio-project-library-management-model";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryManagementHeader", ko, en);

export function StudioProjectLibraryManagementHeader({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  useBilingualI18nRevision();
  const {
    locale: _locale, view, library, profiles, query, setQuery, sort, setSort,
    setSelectedIds, notice, setNotice, setDeleteRequest, listedProjects,
    viewCounts, visibleProjects, selectedProjects, allVisibleSelected,
    toggleVisibleSelection, archiveProjects, trashProjects, restoreProjects,
  } = controller;
  return (
    <>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioProjectLibraryManagementHeader", "en", "TOONSTUDIO")}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
            {bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[view]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[view]).en)}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
            {bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS[view]).en)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/studio/projects" className={buttonClass({ variant: "quiet" })}>
            {bi("제작 관리", "Production management")}
          </Link>
          <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
            {bi("파일 가져오기", "Import files")}
          </Link>
          <Link href="/studio/new" className={buttonClass({ className: "gap-2" })}>
            <Plus size={16} aria-hidden="true" />
            {bi("새 작업", "New work")}
          </Link>
        </div>
      </header>

      <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="overflow-x-auto" aria-label={bi("내 작업 보기", "My work views")}>
          <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-card p-1">
            {(["active", "archived", "trash"] as const).map((candidate) => (
              <Link
                key={candidate}
                href={studioProjectLibraryManagementViewHref(candidate)}
                aria-current={candidate === view ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioProjectLibraryManagementHeader", "en", "page") : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-bold",
                  candidate === view
                    ? "bg-accent text-on-accent"
                    : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {bi((STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[candidate]).ko, (STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS[candidate]).en)}
                <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[0.62rem]">
                  {viewCounts[candidate]}
                </span>
              </Link>
            ))}
          </div>
        </nav>
        <nav className="flex flex-wrap items-center gap-1" aria-label={bi("저장과 배포", "Storage and distribution")}>
          <Link href="/studio?view=storage" className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi("저장·백업", "Save & backup")}
          </Link>
          <Link href="/studio?view=exports" className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi("내보내기", "Export")}
          </Link>
          <Link href="/studio?view=publications" className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-semibold text-fg-3 hover:bg-card hover:text-fg">
            {bi("게시", "Publishing")}
          </Link>
        </nav>
      </div>

      {notice ? (
        <div role="status" aria-live="polite" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/20 px-3 py-2 text-sm font-semibold text-fg">
          <span>{notice.message}</span>
          <span className="flex items-center gap-3">
            {notice.action ? (
              <button type="button" onClick={notice.action} className="text-xs font-black text-accent underline underline-offset-4">
                {notice.actionLabel}
              </button>
            ) : null}
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline underline-offset-4">
              {bi("닫기", "Dismiss")}
            </button>
          </span>
        </div>
      ) : null}

      {library.error || profiles.error ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">
          {library.error ?? profiles.error}
        </p>
      ) : null}

      <section className="mt-7 rounded-2xl border border-line bg-card p-3 sm:p-4" aria-label={bi("프로젝트 찾기와 선택", "Find and select projects")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block min-w-0 flex-1 lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" size={16} aria-hidden="true" />
            <span className="sr-only">{bi("프로젝트 검색", "Search projects")}</span>
            <input
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              placeholder={bi("제목·종류·설명 검색", "Search title, type or description")}
              className="min-h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-3 text-sm text-fg outline-none focus:border-accent"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-fg-3">
              <span className="sr-only">{bi("정렬", "Sort")}</span>
              <select
                value={sort}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setSort(event.target.value as StudioProjectLibrarySortMode)}
                className="min-h-[44px] rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg outline-none focus:border-accent"
              >
                <option value="recent">{bi("최근 작업순", "Recently opened")}</option>
                <option value="name">{bi("이름순", "Name")}</option>
                <option value="created">{bi("최근 생성순", "Recently created")}</option>
              </select>
            </label>
            <button
              type="button"
              disabled={visibleProjects.length === 0}
              onClick={toggleVisibleSelection}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-[44px]" })}
            >
              {allVisibleSelected
                ? bi("선택 해제", "Clear selection")
                : formatI18nTemplate(String(bi("전체 선택 ({value0})", "Select all ({value0})")), { value0: visibleProjects.length })}
            </button>
          </div>
        </div>
      </section>

      {selectedProjects.length > 0 ? (
        <section className="sticky top-3 z-30 mt-3 rounded-2xl border border-accent/35 bg-card/95 p-3 shadow-lg backdrop-blur" aria-label={bi("선택 작업", "Selection actions")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-fg">
                {formatI18nTemplate(String(bi("{value0}개 선택", "{value0} selected")), { value0: selectedProjects.length })}
              </p>
              <p className="mt-0.5 text-[0.68rem] text-fg-3">
                {bi("검색 결과 전체 선택과 개별 선택을 함께 사용할 수 있습니다.", "Combine select-all results with individual selection.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {view === "active" ? (
                <>
                  <button type="button" onClick={() => archiveProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                    <Archive size={14} aria-hidden="true" />{bi("선택 보관", "Archive selected")}
                  </button>
                  <button type="button" onClick={() => trashProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5 text-danger" })}>
                    <Trash2 size={14} aria-hidden="true" />{bi("선택 삭제", "Trash selected")}
                  </button>
                </>
              ) : view === "archived" ? (
                <>
                  <button type="button" onClick={() => restoreProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                    <RotateCcw size={14} aria-hidden="true" />{bi("선택 복원", "Restore selected")}
                  </button>
                  <button type="button" onClick={() => trashProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5 text-danger" })}>
                    <Trash2 size={14} aria-hidden="true" />{bi("선택 삭제", "Trash selected")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => restoreProjects(selectedProjects.map((project) => project.id))} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                    <RotateCcw size={14} aria-hidden="true" />{bi("선택 복구", "Restore selected")}
                  </button>
                  <button type="button" onClick={() => setDeleteRequest({ ids: selectedProjects.map((project) => project.id), source: "selected" })} className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5 text-danger" })}>
                    <Trash2 size={14} aria-hidden="true" />{bi("선택 완전 삭제", "Delete selected")}
                  </button>
                </>
              )}
              <button type="button" onClick={() => setSelectedIds(new Set())} className={buttonClass({ variant: "quiet", size: "sm" })}>
                {bi("선택 해제", "Clear")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {view !== "active" && listedProjects.length > 0 ? (
        <section className="mt-3 flex flex-wrap justify-end gap-2" aria-label={bi("전체 작업", "All-project actions")}>
          <button
            type="button"
            onClick={() => restoreProjects(listedProjects.map((project) => project.id))}
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {view === "trash"
              ? bi("전체 복구", "Restore all")
              : bi("전체 복원", "Restore all")}
          </button>
          {view === "trash" ? (
            <button
              type="button"
              onClick={() => setDeleteRequest({ ids: listedProjects.map((project) => project.id), source: "all" })}
              className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5 text-danger" })}
            >
              <Trash2 size={14} aria-hidden="true" />
              {bi("휴지통 비우기", "Empty Trash")}
            </button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
