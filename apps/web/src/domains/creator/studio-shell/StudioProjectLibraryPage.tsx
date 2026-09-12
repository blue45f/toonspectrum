import {
  Archive,
  Box,
  Clapperboard,
  Clock3,
  Copy,
  FileImage,
  FolderOpen,
  Images,
  LayoutTemplate,
  MoreHorizontal,
  PanelsTopLeft,
  PenTool,
  Plus,
  Presentation,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ensureInitialStudioProjectDocument } from "../studio-project-document-store";
import type {
  StudioProjectKind,
  StudioProjectLibraryEntry,
  StudioProjectStatus,
} from "../studio-project-library-store";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";

type Locale = "ko" | "en";
type LibraryView = "active" | "archived" | "trash";

const VIEW_STATUS: Readonly<Record<LibraryView, StudioProjectStatus>> = Object.freeze({
  active: "active",
  archived: "archived",
  trash: "trashed",
});

const VIEW_LABELS: Readonly<Record<LibraryView, Readonly<Record<Locale, string>>>> = Object.freeze({
  active: { ko: "내 작업", en: "My work" },
  archived: { ko: "보관됨", en: "Archived" },
  trash: { ko: "휴지통", en: "Trash" },
});

const KIND_LABELS: Readonly<Record<StudioProjectKind, Readonly<Record<Locale, string>>>> = Object.freeze({
  webtoon: { ko: "웹툰", en: "Webtoon" },
  illustration: { ko: "일러스트", en: "Illustration" },
  image: { ko: "이미지 편집", en: "Image editing" },
  design: { ko: "디자인", en: "Design" },
  slides: { ko: "발표 자료", en: "Presentation" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  "three-d": { ko: "3D 장면", en: "3D scene" },
  animation: { ko: "애니메이션", en: "Animation" },
});

const KIND_ICONS = {
  webtoon: PanelsTopLeft,
  illustration: PenTool,
  image: FileImage,
  design: LayoutTemplate,
  slides: Presentation,
  storyboard: Clapperboard,
  "three-d": Box,
  animation: Images,
} as const;

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function resolveView(value: string | null, initialView?: LibraryView): LibraryView {
  if (value === "archived" || value === "trash" || value === "active") return value;
  return initialView ?? "active";
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function libraryHref(view: LibraryView): string {
  return view === "active" ? "/studio" : `/studio?view=${view}`;
}

function ProjectIcon({ kind }: { readonly kind: StudioProjectKind }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
      <Icon size={20} aria-hidden="true" />
    </span>
  );
}

function EmptyState({ view, locale }: { readonly view: LibraryView; readonly locale: Locale }) {
  const copy = view === "active"
    ? {
      titleKo: "첫 작업을 시작해 보세요",
      titleEn: "Start your first project",
      bodyKo: "웹툰, 일러스트, 디자인 또는 발표 자료를 고르면 필요한 문서와 작업공간을 자동으로 준비합니다.",
      bodyEn: "Choose webtoon, illustration, design or presentation and ToonStudio prepares the right document and workspace.",
    }
    : view === "archived"
      ? {
        titleKo: "보관된 프로젝트가 없습니다",
        titleEn: "No archived projects",
        bodyKo: "당장 쓰지 않는 프로젝트를 보관하면 내 작업은 깔끔하게 유지되고 언제든 복원할 수 있습니다.",
        bodyEn: "Archive inactive projects to keep My work clean and restore them at any time.",
      }
      : {
        titleKo: "휴지통이 비어 있습니다",
        titleEn: "Trash is empty",
        bodyKo: "휴지통으로 옮긴 프로젝트는 완전히 삭제하기 전까지 복원할 수 있습니다.",
        bodyEn: "Projects moved to Trash remain restorable until permanently deleted.",
      };
  const Icon = view === "active" ? FolderOpen : view === "archived" ? Archive : Trash2;
  return (
    <section className="rounded-3xl border border-dashed border-line bg-card/60 px-5 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-panel text-fg-3">
        <Icon size={21} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-xl font-black text-fg">
        {locale === "ko" ? copy.titleKo : copy.titleEn}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-2">
        {locale === "ko" ? copy.bodyKo : copy.bodyEn}
      </p>
      {view === "active" ? (
        <Link href="/studio/new" className={buttonClass({ className: "mt-5 gap-2" })}>
          <Plus size={16} aria-hidden="true" />
          {locale === "ko" ? "새로 만들기" : "Create project"}
        </Link>
      ) : null}
    </section>
  );
}

function ProjectCard({
  project,
  locale,
  view,
  editing,
  editTitle,
  deleting,
  onEdit,
  onEditTitle,
  onSaveTitle,
  onCancelEdit,
  onOpen,
  onDuplicate,
  onArchive,
  onActivate,
  onTrash,
  onRestore,
  onConfirmDelete,
  onDelete,
  onCancelDelete,
}: {
  readonly project: StudioProjectLibraryEntry;
  readonly locale: Locale;
  readonly view: LibraryView;
  readonly editing: boolean;
  readonly editTitle: string;
  readonly deleting: boolean;
  readonly onEdit: () => void;
  readonly onEditTitle: (value: string) => void;
  readonly onSaveTitle: () => void;
  readonly onCancelEdit: () => void;
  readonly onOpen: () => void;
  readonly onDuplicate: () => void;
  readonly onArchive: () => void;
  readonly onActivate: () => void;
  readonly onTrash: () => void;
  readonly onRestore: () => void;
  readonly onConfirmDelete: () => void;
  readonly onDelete: () => void;
  readonly onCancelDelete: () => void;
}) {
  const projectHref = `/studio/p/${encodeURIComponent(project.id)}/overview`;
  return (
    <article className="rounded-2xl border border-line bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <ProjectIcon kind={project.kind} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={editTitle}
                maxLength={120}
                onChange={(event) => onEditTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSaveTitle();
                  if (event.key === "Escape") onCancelEdit();
                }}
                className="min-h-10 min-w-0 flex-1 rounded-xl border border-accent bg-panel px-3 text-sm font-bold text-fg outline-none ring-2 ring-accent/15"
                aria-label={locale === "ko" ? "프로젝트 이름" : "Project title"}
              />
              <div className="flex gap-1">
                <button type="button" onClick={onSaveTitle} disabled={!editTitle.trim()} className={buttonClass({ size: "sm" })}>
                  {locale === "ko" ? "저장" : "Save"}
                </button>
                <button type="button" onClick={onCancelEdit} className={buttonClass({ variant: "quiet", size: "sm" })}>
                  {locale === "ko" ? "취소" : "Cancel"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black text-fg">{project.title}</h2>
                  <p className="mt-1 text-xs font-semibold text-accent">
                    {KIND_LABELS[project.kind][locale]}
                  </p>
                </div>
                <details className="relative shrink-0">
                  <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg [&::-webkit-details-marker]:hidden" aria-label={locale === "ko" ? "프로젝트 작업" : "Project actions"}>
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-card p-1 shadow-xl">
                    {view === "active" ? (
                      <>
                        <button type="button" onClick={onEdit} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg">
                          {locale === "ko" ? "이름 바꾸기" : "Rename"}
                        </button>
                        <button type="button" onClick={onDuplicate} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg">
                          {locale === "ko" ? "복제" : "Duplicate"}
                        </button>
                        <button type="button" onClick={onArchive} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg">
                          {locale === "ko" ? "보관" : "Archive"}
                        </button>
                        <button type="button" onClick={onTrash} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-danger hover:bg-danger-soft/20">
                          {locale === "ko" ? "휴지통으로" : "Move to Trash"}
                        </button>
                      </>
                    ) : view === "archived" ? (
                      <>
                        <button type="button" onClick={onActivate} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg">
                          {locale === "ko" ? "내 작업으로 복원" : "Restore to My work"}
                        </button>
                        <button type="button" onClick={onTrash} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-danger hover:bg-danger-soft/20">
                          {locale === "ko" ? "휴지통으로" : "Move to Trash"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={onRestore} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg">
                          {locale === "ko" ? "내 작업으로 복원" : "Restore to My work"}
                        </button>
                        <button type="button" onClick={onConfirmDelete} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-danger hover:bg-danger-soft/20">
                          {locale === "ko" ? "완전히 삭제" : "Delete permanently"}
                        </button>
                      </>
                    )}
                  </div>
                </details>
              </div>
              {project.description ? (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-fg-3">{project.description}</p>
              ) : null}
              <p className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-fg-3">
                <Clock3 size={13} aria-hidden="true" />
                {locale === "ko" ? "마지막 작업" : "Last opened"} {formatDate(project.lastOpenedAt, locale)}
              </p>
            </>
          )}
        </div>
      </div>

      {deleting ? (
        <div className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 p-3">
          <p className="text-xs font-bold text-danger">
            {locale === "ko"
              ? "이 프로젝트와 목록 정보를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다."
              : "Permanently delete this project and its list entry? This cannot be undone."}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onDelete} className={buttonClass({ variant: "outline", size: "sm", className: "border-danger/50 text-danger hover:border-danger hover:bg-danger-soft/25 hover:text-danger" })}>
              {locale === "ko" ? "완전히 삭제" : "Delete permanently"}
            </button>
            <button type="button" onClick={onCancelDelete} className={buttonClass({ variant: "quiet", size: "sm" })}>
              {locale === "ko" ? "취소" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}

      {!editing && !deleting ? (
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
          {view === "active" ? (
            <Link href={projectHref} onClick={onOpen} className={buttonClass({ size: "sm", className: "flex-1 gap-1.5" })}>
              <FolderOpen size={15} aria-hidden="true" />
              {locale === "ko" ? "이어서 작업" : "Continue"}
            </Link>
          ) : view === "archived" ? (
            <button type="button" onClick={onActivate} className={buttonClass({ variant: "outline", size: "sm", className: "flex-1 gap-1.5" })}>
              <RotateCcw size={15} aria-hidden="true" />
              {locale === "ko" ? "복원" : "Restore"}
            </button>
          ) : (
            <button type="button" onClick={onRestore} className={buttonClass({ variant: "outline", size: "sm", className: "flex-1 gap-1.5" })}>
              <RotateCcw size={15} aria-hidden="true" />
              {locale === "ko" ? "복원" : "Restore"}
            </button>
          )}
          {view === "active" ? (
            <button type="button" onClick={onDuplicate} aria-label={locale === "ko" ? "프로젝트 복제" : "Duplicate project"} className={buttonClass({ variant: "quiet", size: "icon" })}>
              <Copy size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function StudioProjectLibraryPage({
  initialView,
}: {
  readonly initialView?: LibraryView;
}) {
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const view = resolveView(searchParams.get("view"), initialView);
  const status = VIEW_STATUS[view];
  const library = useStudioProjectLibrary(locale, status);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const counts = useMemo(() => ({
    active: library.state?.projects.filter((project) => project.status === "active").length ?? 0,
    archived: library.state?.projects.filter((project) => project.status === "archived").length ?? 0,
    trash: library.state?.projects.filter((project) => project.status === "trashed").length ?? 0,
  }), [library.state]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return library.projects;
    return library.projects.filter((project) => (
      project.title.toLocaleLowerCase().includes(normalized)
      || project.description.toLocaleLowerCase().includes(normalized)
      || KIND_LABELS[project.kind][locale].toLocaleLowerCase().includes(normalized)
    ));
  }, [library.projects, locale, query]);

  const duplicate = (project: StudioProjectLibraryEntry) => {
    const next = library.duplicate(project.id);
    if (!next || typeof window === "undefined") return;
    ensureInitialStudioProjectDocument(window.localStorage, {
      projectId: next.id,
      projectTitle: next.title,
      projectKind: next.kind,
      target: window,
    });
    setMessage(locale === "ko" ? `“${project.title}” 복사본을 만들었습니다.` : `Created a copy of “${project.title}”.`);
  };

  const saveTitle = (projectId: string) => {
    if (!editTitle.trim()) return;
    const updated = library.rename(projectId, editTitle);
    if (!updated) return;
    setEditingId(null);
    setMessage(locale === "ko" ? "프로젝트 이름을 바꿨습니다." : "Project renamed.");
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-11">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">TOONSTUDIO</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
              {VIEW_LABELS[view][locale]}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
              {view === "active"
                ? locale === "ko"
                  ? "마지막 작업에서 바로 이어가거나 새 프로젝트를 시작하세요. 저장과 복구는 ToonStudio가 자동으로 관리합니다."
                  : "Continue from your latest work or start a new project. ToonStudio manages saving and recovery automatically."
                : view === "archived"
                  ? locale === "ko"
                    ? "보관한 프로젝트는 원본을 지우지 않고 목록에서만 잠시 치워 둡니다."
                    : "Archived projects remain intact and can be returned to My work at any time."
                  : locale === "ko"
                    ? "실수로 옮긴 프로젝트를 복원하거나 더 이상 필요 없는 항목을 완전히 삭제합니다."
                    : "Restore projects moved by mistake or permanently delete items no longer needed."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
              {locale === "ko" ? "파일 가져오기" : "Import"}
            </Link>
            <Link href="/studio/new" className={buttonClass({ className: "gap-2" })}>
              <Plus size={16} aria-hidden="true" />
              {locale === "ko" ? "새로 만들기" : "New project"}
            </Link>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label={locale === "ko" ? "프로젝트 목록" : "Project lists"} className="overflow-x-auto">
            <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-card p-1">
              {(["active", "archived", "trash"] as const).map((candidate) => (
                <Link
                  key={candidate}
                  href={libraryHref(candidate)}
                  aria-current={candidate === view ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors",
                    candidate === view
                      ? "bg-accent text-on-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {VIEW_LABELS[candidate][locale]}
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[0.62rem]",
                    candidate === view ? "bg-white/20" : "bg-panel text-fg-3",
                  )}>
                    {counts[candidate]}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
          <label className="relative block w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" size={16} aria-hidden="true" />
            <span className="sr-only">{locale === "ko" ? "프로젝트 검색" : "Search projects"}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={locale === "ko" ? "이름·종류로 검색" : "Search name or type"}
              className="min-h-11 w-full rounded-xl border border-line bg-card pl-10 pr-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>

        {library.error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">
            {library.error}
          </p>
        ) : null}
        {message ? (
          <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft/15 px-3 py-2 text-sm font-semibold text-success">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} className="text-xs underline underline-offset-2">
              {locale === "ko" ? "닫기" : "Dismiss"}
            </button>
          </div>
        ) : null}

        <div className="mt-6">
          {filtered.length === 0 && !query.trim() ? (
            <EmptyState view={view} locale={locale} />
          ) : filtered.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-line bg-card/60 px-5 py-12 text-center">
              <Search size={24} className="mx-auto text-fg-3" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-black text-fg">
                {locale === "ko" ? "일치하는 프로젝트가 없습니다" : "No matching projects"}
              </h2>
              <button type="button" onClick={() => setQuery("")} className={buttonClass({ variant: "quiet", size: "sm", className: "mt-3" })}>
                {locale === "ko" ? "검색 지우기" : "Clear search"}
              </button>
            </section>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  locale={locale}
                  view={view}
                  editing={editingId === project.id}
                  editTitle={editingId === project.id ? editTitle : project.title}
                  deleting={deletingId === project.id}
                  onEdit={() => {
                    setEditingId(project.id);
                    setEditTitle(project.title);
                    setDeletingId(null);
                  }}
                  onEditTitle={setEditTitle}
                  onSaveTitle={() => saveTitle(project.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onOpen={() => library.touch(project.id, project.lastOpenedDocumentId)}
                  onDuplicate={() => duplicate(project)}
                  onArchive={() => {
                    if (library.archive(project.id)) setMessage(locale === "ko" ? "프로젝트를 보관했습니다." : "Project archived.");
                  }}
                  onActivate={() => {
                    if (library.activate(project.id)) setMessage(locale === "ko" ? "프로젝트를 내 작업으로 복원했습니다." : "Project restored to My work.");
                  }}
                  onTrash={() => {
                    if (library.trash(project.id)) setMessage(locale === "ko" ? "프로젝트를 휴지통으로 옮겼습니다." : "Project moved to Trash.");
                  }}
                  onRestore={() => {
                    if (library.restore(project.id)) setMessage(locale === "ko" ? "프로젝트를 복원했습니다." : "Project restored.");
                  }}
                  onConfirmDelete={() => {
                    setDeletingId(project.id);
                    setEditingId(null);
                  }}
                  onDelete={() => {
                    if (library.removePermanently(project.id)) {
                      setDeletingId(null);
                      setMessage(locale === "ko" ? "프로젝트를 완전히 삭제했습니다." : "Project permanently deleted.");
                    }
                  }}
                  onCancelDelete={() => setDeletingId(null)}
                />
              ))}
            </div>
          )}
        </div>
      </Container>
    </main>
  );
}
