import {
  Archive,
  Copy,
  FilePlus2,
  FolderOpen,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  markStudioProjectDocumentOpened,
  studioProjectDocumentHref,
  type StudioDocumentKind,
  type StudioDocumentStatus,
  type StudioDocumentWorkspace,
  type StudioProjectDocumentEntry,
} from "../studio-project-document-store";
import { markStudioProjectOpened } from "../studio-project-library-store";
import { useStudioProjectDocuments } from "./useStudioProjectDocuments";

type Locale = "ko" | "en";
type DocumentView = "active" | "archived" | "trash";

const VIEW_STATUS: Readonly<Record<DocumentView, StudioDocumentStatus>> = Object.freeze({
  active: "active",
  archived: "archived",
  trash: "trashed",
});

const DOCUMENT_KIND_OPTIONS: readonly Readonly<{
  id: StudioDocumentKind;
  labelKo: string;
  labelEn: string;
}>[] = Object.freeze([
  { id: "webtoon", labelKo: "웹툰 원고", labelEn: "Webtoon manuscript" },
  { id: "illustration", labelKo: "일러스트", labelEn: "Illustration" },
  { id: "image", labelKo: "이미지 편집", labelEn: "Image edit" },
  { id: "design", labelKo: "디자인", labelEn: "Design" },
  { id: "slides", labelKo: "발표 자료", labelEn: "Presentation" },
  { id: "storyboard", labelKo: "스토리보드", labelEn: "Storyboard" },
  { id: "whiteboard", labelKo: "화이트보드", labelEn: "Whiteboard" },
  { id: "three-d", labelKo: "3D 장면", labelEn: "3D scene" },
  { id: "animation", labelKo: "애니메이션", labelEn: "Animation" },
  { id: "motion", labelKo: "모션", labelEn: "Motion" },
  { id: "audio", labelKo: "오디오", labelEn: "Audio" },
  { id: "localization", labelKo: "현지화", labelEn: "Localization" },
]);

const WORKSPACE_LABELS: Readonly<Record<StudioDocumentWorkspace, Readonly<Record<Locale, string>>>> = Object.freeze({
  draw: { ko: "그리기", en: "Draw" },
  comic: { ko: "웹툰", en: "Comic" },
  image: { ko: "이미지", en: "Image" },
  design: { ko: "디자인", en: "Design" },
  slides: { ko: "슬라이드", en: "Slides" },
  storyboard: { ko: "콘티", en: "Storyboard" },
  whiteboard: { ko: "보드", en: "Whiteboard" },
  "3d": { ko: "3D", en: "3D" },
  animation: { ko: "애니메이션", en: "Animation" },
  motion: { ko: "모션", en: "Motion" },
  audio: { ko: "오디오", en: "Audio" },
  localization: { ko: "현지화", en: "Localization" },
  review: { ko: "검토", en: "Review" },
});

function defaultTitle(kind: StudioDocumentKind, locale: Locale): string {
  const item = DOCUMENT_KIND_OPTIONS.find((option) => option.id === kind);
  const label = locale === "ko" ? item?.labelKo : item?.labelEn;
  return locale === "ko" ? `새 ${label ?? "문서"}` : `New ${label ?? "document"}`;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function documentKindLabel(kind: StudioDocumentKind, locale: Locale): string {
  const item = DOCUMENT_KIND_OPTIONS.find((option) => option.id === kind);
  return locale === "ko" ? item?.labelKo ?? kind : item?.labelEn ?? kind;
}

function DocumentRow({
  document,
  locale,
  view,
  onWorkspace,
  onOpen,
  onDuplicate,
  onArchive,
  onTrash,
  onRestore,
  onDelete,
}: {
  readonly document: StudioProjectDocumentEntry;
  readonly locale: Locale;
  readonly view: DocumentView;
  readonly onWorkspace: (workspace: StudioDocumentWorkspace) => void;
  readonly onOpen: () => void;
  readonly onDuplicate: () => void;
  readonly onArchive: () => void;
  readonly onTrash: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <article className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-black text-fg">{document.title}</h3>
            <span className="rounded-full bg-accent-soft px-2 py-1 text-[0.62rem] font-bold text-accent">
              {documentKindLabel(document.kind, locale)}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-3">
            {document.width && document.height ? `${document.width.toLocaleString()} × ${document.height.toLocaleString()} · ` : ""}
            {locale === "ko" ? `${document.pageCount}페이지` : `${document.pageCount} page${document.pageCount === 1 ? "" : "s"}`} · {formatDate(document.lastOpenedAt, locale)}
          </p>
        </div>

        {view === "active" ? (
          <label className="text-[0.65rem] font-bold text-fg-3">
            {locale === "ko" ? "기본 작업공간" : "Default workspace"}
            <select
              value={document.defaultWorkspace}
              onChange={(event) => onWorkspace(event.target.value as StudioDocumentWorkspace)}
              className="mt-1 min-h-10 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg"
            >
              {document.allowedWorkspaces.map((workspace) => (
                <option key={workspace} value={workspace}>{WORKSPACE_LABELS[workspace][locale]}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {view === "active" ? (
            <>
              <Link
                href={studioProjectDocumentHref(document)}
                onClick={onOpen}
                className={buttonClass({ size: "sm", className: "gap-1.5" })}
              >
                <FolderOpen size={15} aria-hidden="true" />
                {locale === "ko" ? "열기" : "Open"}
              </Link>
              <button type="button" onClick={onDuplicate} aria-label={locale === "ko" ? "문서 복제" : "Duplicate document"} className={buttonClass({ variant: "outline", size: "icon" })}>
                <Copy size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={onArchive} aria-label={locale === "ko" ? "문서 보관" : "Archive document"} className={buttonClass({ variant: "quiet", size: "icon" })}>
                <Archive size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={onTrash} aria-label={locale === "ko" ? "문서를 휴지통으로" : "Move document to Trash"} className={buttonClass({ variant: "quiet", size: "icon", className: "text-danger" })}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </>
          ) : view === "archived" ? (
            <>
              <button type="button" onClick={onRestore} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                <RotateCcw size={15} aria-hidden="true" />
                {locale === "ko" ? "복원" : "Restore"}
              </button>
              <button type="button" onClick={onTrash} className={buttonClass({ variant: "quiet", size: "icon", className: "text-danger" })} aria-label={locale === "ko" ? "문서를 휴지통으로" : "Move document to Trash"}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onRestore} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                <RotateCcw size={15} aria-hidden="true" />
                {locale === "ko" ? "복원" : "Restore"}
              </button>
              <button type="button" onClick={onDelete} className={buttonClass({ variant: "outline", size: "sm", className: "border-danger/50 text-danger hover:border-danger hover:bg-danger-soft/25 hover:text-danger" })}>
                {locale === "ko" ? "완전히 삭제" : "Delete permanently"}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/** Project-owned document list and creation flow. */
export function StudioProjectDocumentsPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  const [view, setView] = useState<DocumentView>("active");
  const documents = useStudioProjectDocuments(projectId, locale, VIEW_STATUS[view]);
  const [kind, setKind] = useState<StudioDocumentKind>("webtoon");
  const [title, setTitle] = useState(() => defaultTitle("webtoon", locale));
  const [width, setWidth] = useState<number | null>(1_080);
  const [height, setHeight] = useState<number | null>(8_000);
  const [pageCount, setPageCount] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    active: documents.state?.documents.filter((document) => document.status === "active").length ?? 0,
    archived: documents.state?.documents.filter((document) => document.status === "archived").length ?? 0,
    trash: documents.state?.documents.filter((document) => document.status === "trashed").length ?? 0,
  }), [documents.state]);

  const selectKind = (next: StudioDocumentKind) => {
    setKind(next);
    setTitle(defaultTitle(next, locale));
    if (next === "webtoon") {
      setWidth(1_080);
      setHeight(8_000);
    } else if (next === "slides") {
      setWidth(1_920);
      setHeight(1_080);
    } else if (next === "audio") {
      setWidth(null);
      setHeight(null);
    } else {
      setWidth(2_048);
      setHeight(2_048);
    }
  };

  const create = () => {
    const created = documents.create({ title, kind, width, height, pageCount });
    if (!created) return;
    setTitle(defaultTitle(kind, locale));
    setMessage(locale === "ko" ? `“${created.title}” 문서를 만들었습니다.` : `Created “${created.title}”.`);
  };

  const markOpened = (document: StudioProjectDocumentEntry) => {
    if (typeof window === "undefined") return;
    const now = new Date().toISOString();
    try {
      markStudioProjectDocumentOpened(
        window.localStorage,
        projectId,
        document.id,
        document.defaultWorkspace,
        { at: now, target: window },
      );
      markStudioProjectOpened(
        window.localStorage,
        projectId,
        document.id,
        { at: now, target: window },
      );
    } catch {
      // Opening the editor remains available even if recent-item metadata cannot be stored.
    }
  };

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="project-documents-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">PROJECT DOCUMENTS</p>
          <h2 id="project-documents-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {locale === "ko" ? "문서와 작업공간" : "Documents and workspaces"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "원고, 일러스트, 디자인, 슬라이드, 3D와 모션 문서를 한 프로젝트에서 관리합니다. 작업공간을 바꿔도 같은 문서의 선택·저장·작업 내역은 유지됩니다."
              : "Manage manuscripts, illustrations, design, slides, 3D and motion in one project. Switching workspace preserves the same document identity, selection, saving and history."}
          </p>
        </div>
        <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-panel p-1">
          {(["active", "archived", "trash"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === view}
              onClick={() => {
                setView(candidate);
                setConfirmDeleteId(null);
              }}
              className={cn(
                "min-h-10 rounded-xl px-3 text-xs font-bold",
                candidate === view ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              {candidate === "active"
                ? locale === "ko" ? "작업 문서" : "Active"
                : candidate === "archived"
                  ? locale === "ko" ? "보관됨" : "Archived"
                  : locale === "ko" ? "휴지통" : "Trash"}
              <span className="ml-1 opacity-75">{counts[candidate]}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "active" ? (
        <div className="mt-5 rounded-2xl border border-line bg-panel/55 p-4">
          <div className="grid gap-3 lg:grid-cols-[12rem_1fr_7rem_7rem_6rem_auto]">
            <label className="text-[0.65rem] font-bold text-fg-3">
              {locale === "ko" ? "문서 종류" : "Document type"}
              <select value={kind} onChange={(event) => selectKind(event.target.value as StudioDocumentKind)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg">
                {DOCUMENT_KIND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{locale === "ko" ? option.labelKo : option.labelEn}</option>
                ))}
              </select>
            </label>
            <label className="text-[0.65rem] font-bold text-fg-3">
              {locale === "ko" ? "문서 이름" : "Document name"}
              <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg" />
            </label>
            <label className="text-[0.65rem] font-bold text-fg-3">
              {locale === "ko" ? "가로" : "Width"}
              <input type="number" min={1} value={width ?? ""} disabled={kind === "audio"} onChange={(event) => setWidth(event.target.value ? Number(event.target.value) : null)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg disabled:opacity-50" />
            </label>
            <label className="text-[0.65rem] font-bold text-fg-3">
              {locale === "ko" ? "세로" : "Height"}
              <input type="number" min={1} value={height ?? ""} disabled={kind === "audio"} onChange={(event) => setHeight(event.target.value ? Number(event.target.value) : null)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg disabled:opacity-50" />
            </label>
            <label className="text-[0.65rem] font-bold text-fg-3">
              {locale === "ko" ? "페이지" : "Pages"}
              <input type="number" min={1} value={pageCount} onChange={(event) => setPageCount(Math.max(1, Number(event.target.value)))} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg" />
            </label>
            <button type="button" onClick={create} disabled={!title.trim()} className={buttonClass({ className: "mt-auto min-h-11 gap-1.5" })}>
              <FilePlus2 size={16} aria-hidden="true" />
              {locale === "ko" ? "문서 만들기" : "Create"}
            </button>
          </div>
        </div>
      ) : null}

      {documents.error ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">
          {documents.error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/15 px-3 py-2 text-sm font-semibold text-success">
          {message}
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {documents.documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-panel/30 px-5 py-9 text-center">
            <FilePlus2 size={22} className="mx-auto text-fg-3" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-fg">
              {view === "active"
                ? locale === "ko" ? "아직 문서가 없습니다" : "No documents yet"
                : locale === "ko" ? "이 목록은 비어 있습니다" : "This list is empty"}
            </p>
          </div>
        ) : documents.documents.map((document) => (
          <div key={document.id}>
            <DocumentRow
              document={document}
              locale={locale}
              view={view}
              onWorkspace={(workspace) => documents.setWorkspace(document.id, workspace)}
              onOpen={() => markOpened(document)}
              onDuplicate={() => {
                const copy = documents.duplicate(document.id);
                if (copy) setMessage(locale === "ko" ? "문서 복사본을 만들었습니다." : "Document copy created.");
              }}
              onArchive={() => documents.archive(document.id)}
              onTrash={() => documents.trash(document.id)}
              onRestore={() => documents.restore(document.id)}
              onDelete={() => setConfirmDeleteId(document.id)}
            />
            {confirmDeleteId === document.id ? (
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-danger/35 bg-danger-soft/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-bold text-danger">
                  {locale === "ko" ? "이 문서 목록을 완전히 삭제할까요?" : "Permanently delete this document entry?"}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => {
                    if (documents.removePermanently(document.id)) setConfirmDeleteId(null);
                  }} className={buttonClass({ variant: "outline", size: "sm", className: "border-danger/50 text-danger hover:border-danger hover:bg-danger-soft/25 hover:text-danger" })}>
                    {locale === "ko" ? "삭제" : "Delete"}
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)} className={buttonClass({ variant: "quiet", size: "sm" })}>
                    {locale === "ko" ? "취소" : "Cancel"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
