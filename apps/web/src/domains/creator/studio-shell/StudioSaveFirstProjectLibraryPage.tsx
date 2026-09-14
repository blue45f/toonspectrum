import {
  Archive,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  HardDrive,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { readStudioProjectDocuments } from "../studio-project-document-store";
import type {
  StudioProjectLibraryEntry,
  StudioProjectStatus,
} from "../studio-project-library-store";
import { buildStudioProjectPackage, saveStudioProjectPackage } from "../save-first/studio-project-package";
import { STUDIO_EXPORT_PRESETS } from "../save-first/studio-export-presets";
import {
  studioSaveSafetySummary,
  type StudioSaveProfile,
  type StudioStorageProvider,
} from "../save-first/studio-save-profile";
import {
  readStudioSubmissions,
  type StudioSubmission,
} from "../save-first/studio-submission-store";
import { StudioQuickStart } from "./StudioQuickStart";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";
import { useStudioSaveProfiles } from "./useStudioSaveProfiles";

type Locale = "ko" | "en";
type LibraryView = "active" | "storage" | "exports" | "publications" | "archived" | "trash";
type InitialLibraryView = "active" | "archived" | "trash";

const VIEW_LABELS: Readonly<Record<LibraryView, Readonly<Record<Locale, string>>>> = {
  active: { ko: "내 작업", en: "My work" },
  storage: { ko: "저장소", en: "Storage" },
  exports: { ko: "내보내기·제출", en: "Export and submit" },
  publications: { ko: "게시 관리", en: "Publishing" },
  archived: { ko: "보관됨", en: "Archived" },
  trash: { ko: "휴지통", en: "Trash" },
};

const PROVIDER_OPTIONS: readonly Readonly<{
  provider: StudioStorageProvider;
  label: string;
  detail: string;
}>[] = [
  { provider: "local-file", label: "파일·동기화 폴더", detail: "내 컴퓨터 또는 Drive 동기화 폴더에 .toonstudio 파일로 저장" },
  { provider: "google-drive", label: "Google Drive", detail: "직접 연결 후 기준 원본이나 자동 백업으로 사용" },
  { provider: "dropbox", label: "Dropbox", detail: "직접 연결 후 자동 백업으로 사용" },
  { provider: "onedrive", label: "OneDrive", detail: "직접 연결 후 자동 백업으로 사용" },
  { provider: "webdav", label: "WebDAV", detail: "Nextcloud 등 사용자 소유 저장소 연결" },
  { provider: "s3", label: "S3 호환 저장소", detail: "사용자 버킷을 백업 대상으로 연결" },
];

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function resolveView(value: string | null, initialView?: InitialLibraryView): LibraryView {
  if (value && Object.hasOwn(VIEW_LABELS, value)) return value as LibraryView;
  return initialView ?? "active";
}

function viewHref(view: LibraryView): string {
  return view === "active" ? "/studio" : `/studio?view=${view}`;
}

function formatDate(value: string | null, locale: Locale): string {
  if (!value) return locale === "ko" ? "아직 없음" : "Not yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() === 0) return locale === "ko" ? "아직 없음" : "Not yet";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function distributionLabel(profile: StudioSaveProfile, locale: Locale): string {
  const labels = {
    none: { ko: "미배포", en: "Not distributed" },
    exported: { ko: "내보냄", en: "Exported" },
    submitted: { ko: "외부 제출", en: "Submitted externally" },
    published: { ko: "게시됨", en: "Published" },
  } as const;
  return labels[profile.distributionState][locale];
}

function SafetyBadge({ profile, locale }: { profile: StudioSaveProfile; locale: Locale }) {
  const safety = studioSaveSafetySummary(profile);
  const Icon = safety.needsBackup ? CloudOff : CheckCircle2;
  return (
    <span className={cn(
      "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.68rem] font-bold",
      safety.needsBackup
        ? "border-warning/35 bg-warning-soft/20 text-warning"
        : "border-success/35 bg-success-soft/20 text-success",
    )}>
      <Icon size={13} aria-hidden="true" />
      {locale === "ko" ? safety.headline : safety.needsBackup ? "Backup needs attention" : "Backup ready"}
    </span>
  );
}

function StorageDetails({
  project,
  profile,
  locale,
  onAddProvider,
  onSavePackage,
}: {
  readonly project: StudioProjectLibraryEntry;
  readonly profile: StudioSaveProfile;
  readonly locale: Locale;
  readonly onAddProvider: (provider: StudioStorageProvider) => void;
  readonly onSavePackage: () => void;
}) {
  return (
    <details className="mt-3 rounded-xl border border-line bg-panel/55">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-black text-fg [&::-webkit-details-marker]:hidden">
        {locale === "ko" ? "저장 위치 관리" : "Manage storage locations"}
      </summary>
      <div className="border-t border-line p-3">
        <div className="space-y-2">
          {profile.bindings.map((binding) => (
            <div key={binding.id} className="flex items-start justify-between gap-3 rounded-xl bg-card px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-black text-fg">{binding.label}</p>
                <p className="mt-0.5 text-[0.68rem] text-fg-3">
                  {binding.connectionRequired
                    ? locale === "ko" ? "연결 필요 · 아직 백업되지 않음" : "Connection required · not backed up"
                    : binding.lastSyncedAt
                      ? `${locale === "ko" ? "마지막 저장" : "Last saved"} ${formatDate(binding.lastSyncedAt, locale)}`
                      : locale === "ko" ? "작업 사본" : "Working copy"}
                </p>
              </div>
              <span className={cn(
                "rounded-full px-2 py-1 text-[0.62rem] font-bold",
                binding.syncState === "synced"
                  ? "bg-success-soft/25 text-success"
                  : binding.syncState === "error" || binding.syncState === "conflict"
                    ? "bg-danger-soft/20 text-danger"
                    : "bg-warning-soft/20 text-warning",
              )}>
                {binding.syncState === "synced" ? "동기화됨" : binding.connectionRequired ? "연결 필요" : "로컬"}
              </span>
            </div>
          ))}
        </div>
        <button type="button" onClick={onSavePackage} className={buttonClass({ size: "sm", className: "mt-3 w-full gap-2" })}>
          <FileArchive size={15} aria-hidden="true" />
          {locale === "ko" ? ".toonstudio 파일로 저장" : "Save .toonstudio file"}
        </button>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PROVIDER_OPTIONS.filter((option) => option.provider !== "local-file").map((option) => (
            <button
              key={option.provider}
              type="button"
              onClick={() => onAddProvider(option.provider)}
              className="rounded-xl border border-line bg-card px-3 py-2.5 text-left hover:border-accent/45"
            >
              <span className="block text-xs font-black text-fg">{option.label}</span>
              <span className="mt-1 block text-[0.66rem] leading-4 text-fg-3">{option.detail}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[0.66rem] leading-5 text-fg-3">
          {locale === "ko"
            ? "원격 공급자를 선택해도 인증과 첫 동기화가 끝나기 전에는 백업 완료로 표시하지 않습니다."
            : "A remote provider is not marked as backed up until authentication and the first sync complete."}
        </p>
      </div>
    </details>
  );
}

function ActiveProjectCard({
  project,
  profile,
  locale,
  onOpen,
  onSavePackage,
  onAddProvider,
  onArchive,
  onTrash,
}: {
  readonly project: StudioProjectLibraryEntry;
  readonly profile: StudioSaveProfile;
  readonly locale: Locale;
  readonly onOpen: () => void;
  readonly onSavePackage: () => void;
  readonly onAddProvider: (provider: StudioStorageProvider) => void;
  readonly onArchive: () => void;
  readonly onTrash: () => void;
}) {
  return (
    <article className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[0.68rem] font-black text-accent">
              <ShieldCheck size={13} aria-hidden="true" />
              {locale === "ko" ? "나만 보기" : "Owner only"}
            </span>
            <SafetyBadge profile={profile} locale={locale} />
          </div>
          <h2 className="mt-3 truncate text-lg font-black text-fg">{project.title}</h2>
          <p className="mt-1 text-xs text-fg-3">
            {locale === "ko" ? "마지막 작업" : "Last opened"} {formatDate(project.lastOpenedAt, locale)}
          </p>
        </div>
        <details className="relative shrink-0">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-xl text-fg-3 hover:bg-raised [&::-webkit-details-marker]:hidden">
            <MoreHorizontal size={18} aria-hidden="true" />
            <span className="sr-only">{locale === "ko" ? "프로젝트 작업" : "Project actions"}</span>
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-line bg-card p-1 shadow-xl">
            <button type="button" onClick={onArchive} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised">
              {locale === "ko" ? "보관" : "Archive"}
            </button>
            <button type="button" onClick={onTrash} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-danger hover:bg-danger-soft/20">
              {locale === "ko" ? "휴지통으로" : "Move to Trash"}
            </button>
          </div>
        </details>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-panel/60 p-3 text-[0.68rem]">
        <div>
          <p className="font-semibold text-fg-3">{locale === "ko" ? "마지막 수동 저장" : "Last manual save"}</p>
          <p className="mt-1 font-black text-fg">{formatDate(profile.lastManualSaveAt, locale)}</p>
        </div>
        <div>
          <p className="font-semibold text-fg-3">{locale === "ko" ? "배포 상태" : "Distribution"}</p>
          <p className="mt-1 font-black text-fg">{distributionLabel(profile, locale)}</p>
        </div>
      </div>

      <StorageDetails
        project={project}
        profile={profile}
        locale={locale}
        onAddProvider={onAddProvider}
        onSavePackage={onSavePackage}
      />

      <div className="mt-4 flex gap-2 border-t border-line pt-3">
        <Link
          href={`/studio/p/${encodeURIComponent(project.id)}/overview`}
          onClick={onOpen}
          className={buttonClass({ size: "sm", className: "flex-1 gap-1.5" })}
        >
          <FolderOpen size={15} aria-hidden="true" />
          {locale === "ko" ? "이어서 작업" : "Continue"}
        </Link>
        <button type="button" onClick={onSavePackage} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
          <Download size={15} aria-hidden="true" />
          {locale === "ko" ? "저장" : "Save"}
        </button>
      </div>
    </article>
  );
}

function StorageOverview({
  projects,
  locale,
  profileFor,
  onSavePackage,
}: {
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly locale: Locale;
  readonly profileFor: (projectId: string) => StudioSaveProfile;
  readonly onSavePackage: (project: StudioProjectLibraryEntry) => void;
}) {
  const summaries = projects.map((project) => studioSaveSafetySummary(profileFor(project.id)));
  const safe = summaries.filter((summary) => !summary.needsBackup).length;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <section className="rounded-2xl border border-line bg-card p-4">
          <HardDrive size={18} className="text-accent" aria-hidden="true" />
          <p className="mt-3 text-2xl font-black text-fg">{projects.length}</p>
          <p className="text-xs font-semibold text-fg-3">{locale === "ko" ? "전체 비공개 작업" : "Private projects"}</p>
        </section>
        <section className="rounded-2xl border border-success/30 bg-success-soft/10 p-4">
          <Cloud size={18} className="text-success" aria-hidden="true" />
          <p className="mt-3 text-2xl font-black text-fg">{safe}</p>
          <p className="text-xs font-semibold text-fg-3">{locale === "ko" ? "별도 사본 있음" : "With another copy"}</p>
        </section>
        <section className="rounded-2xl border border-warning/30 bg-warning-soft/10 p-4">
          <CloudOff size={18} className="text-warning" aria-hidden="true" />
          <p className="mt-3 text-2xl font-black text-fg">{projects.length - safe}</p>
          <p className="text-xs font-semibold text-fg-3">{locale === "ko" ? "백업 필요" : "Need backup"}</p>
        </section>
      </div>
      <div className="mt-5 space-y-3">
        {projects.map((project) => {
          const profile = profileFor(project.id);
          const summary = studioSaveSafetySummary(profile);
          return (
            <section key={project.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black text-fg">{project.title}</h2>
                <p className={cn("mt-1 text-xs font-semibold", summary.needsBackup ? "text-warning" : "text-success")}>{summary.headline}</p>
              </div>
              <button type="button" onClick={() => onSavePackage(project)} className={buttonClass({ size: "sm", className: "gap-2" })}>
                <FileArchive size={15} aria-hidden="true" />
                {locale === "ko" ? "파일 백업" : "File backup"}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ExportOverview({
  projects,
  submissions,
  locale,
}: {
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly submissions: readonly StudioSubmission[];
  readonly locale: Locale;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-black text-fg">{locale === "ko" ? "플랫폼별 내보내기" : "Platform exports"}</h2>
        <p className="mt-2 text-sm leading-6 text-fg-2">
          {locale === "ko"
            ? "원본은 그대로 두고 선택한 플랫폼 규격으로 별도 제출 작업을 만듭니다."
            : "Keep the editable original intact and create a separate platform delivery."}
        </p>
        <div className="mt-4 space-y-3">
          {STUDIO_EXPORT_PRESETS.map((preset) => (
            <article key={preset.id} className="rounded-xl border border-line bg-panel/55 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-black text-fg">{preset.labelKo}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-3">
                    {preset.exactWidth ? `가로 ${preset.exactWidth}px` : `가로 최대 ${preset.maxWidth ?? "제한 없음"}px`}
                    {preset.maxFileBytes ? ` · 파일당 ${Math.round(preset.maxFileBytes / 1024 / 1024)}MB` : ""}
                    {` · ${preset.formats.map((format) => format.toUpperCase()).join("/")}`}
                  </p>
                </div>
                {projects[0] ? (
                  <Link href={`/studio/p/${encodeURIComponent(projects[0].id)}/export?preset=${encodeURIComponent(preset.id)}`} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                    <Upload size={14} aria-hidden="true" />
                    {locale === "ko" ? "내보내기 열기" : "Open export"}
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-black text-fg">{locale === "ko" ? "외부 제출 기록" : "External submissions"}</h2>
        {submissions.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-fg-3">
            {locale === "ko" ? "아직 제출 기록이 없습니다. 내보내기 작업에서 패키지를 만든 뒤 기록할 수 있습니다." : "No submissions yet. Create a package from an export workspace first."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {submissions.slice().reverse().map((submission) => (
              <article key={submission.id} className="rounded-xl bg-panel/60 p-3">
                <p className="text-xs font-black text-fg">{submission.platform}</p>
                <p className="mt-1 text-[0.68rem] text-fg-3">{submission.status} · revision {submission.sourceRevision}</p>
                {submission.externalUrl ? (
                  <a href={submission.externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent">
                    {locale === "ko" ? "외부 작품 열기" : "Open external work"} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PublicationOverview({
  projects,
  locale,
  profileFor,
}: {
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly locale: Locale;
  readonly profileFor: (projectId: string) => StudioSaveProfile;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-panel text-fg-2"><Send size={19} aria-hidden="true" /></span>
        <div>
          <h2 className="text-lg font-black text-fg">{locale === "ko" ? "게시는 선택 사항입니다" : "Publishing is optional"}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "저장된 원본과 게시물은 별개입니다. 게시를 중단하거나 삭제해도 비공개 원본은 유지됩니다."
              : "Saved originals and publications are separate. Unpublishing never removes the private original."}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {projects.map((project) => {
          const profile = profileFor(project.id);
          return (
            <section key={project.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-black text-fg">{project.title}</h3>
                <p className="mt-1 text-xs text-fg-3">{distributionLabel(profile, locale)} · {profile.accessMode === "public" ? "공개" : "나만 보기"}</p>
              </div>
              <Link href={`/studio/p/${encodeURIComponent(project.id)}/export?intent=publish`} className={buttonClass({ variant: "outline", size: "sm" })}>
                {locale === "ko" ? "배포 옵션 열기" : "Open distribution options"}
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function StudioSaveFirstProjectLibraryPage({
  initialView,
}: {
  readonly initialView?: InitialLibraryView;
}) {
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const view = resolveView(searchParams.get("view"), initialView);
  const status: StudioProjectStatus | undefined = view === "archived" ? "archived" : view === "trash" ? "trashed" : undefined;
  const library = useStudioProjectLibrary(locale, status);
  const profiles = useStudioSaveProfiles();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  const allProjects = library.state?.projects ?? [];
  const activeProjects = allProjects.filter((project) => project.status === "active");
  const projects = status ? library.projects : activeProjects;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? projects.filter((project) => project.title.toLocaleLowerCase().includes(normalized))
      : projects;
  }, [projects, query]);
  const submissions = typeof window === "undefined"
    ? []
    : readStudioSubmissions(window.localStorage).submissions;

  const savePackage = async (project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined" || busyProjectId) return;
    setBusyProjectId(project.id);
    try {
      const profile = profiles.ensure(project.id) ?? profiles.profileFor(project.id);
      const documents = readStudioProjectDocuments(window.localStorage, project.id).documents;
      const result = buildStudioProjectPackage({
        project,
        documents,
        profile,
        submissions: submissions.filter((submission) => submission.projectId === project.id),
      });
      const method = await saveStudioProjectPackage(result, window);
      profiles.addProvider(project.id, "local-file");
      profiles.markSynced(project.id, "local-file:backup", {
        remotePath: result.fileName,
        revision: profile.revision + 1,
      });
      profiles.recordSave(project.id);
      setMessage(method === "file-picker"
        ? locale === "ko" ? `“${project.title}”을 선택한 파일·동기화 폴더에 저장했습니다.` : `Saved “${project.title}” to the selected file or synced folder.`
        : locale === "ko" ? `“${project.title}” 프로젝트 파일을 다운로드했습니다.` : `Downloaded the “${project.title}” project file.`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setMessage(locale === "ko" ? "프로젝트 파일을 저장하지 못했습니다." : "The project file could not be saved.");
    } finally {
      setBusyProjectId(null);
    }
  };

  const navViews: readonly LibraryView[] = ["active", "storage", "exports", "publications", "archived", "trash"];

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-11">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">TOONSTUDIO SAVE-FIRST</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">{VIEW_LABELS[view][locale]}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
              {locale === "ko"
                ? "작품을 먼저 안전하게 저장하고 원하는 곳에 보관하세요. 내보내기와 공개는 필요할 때만 선택합니다."
                : "Save your work safely first and keep it where you choose. Exporting and publishing remain optional."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>{locale === "ko" ? "작품 가져오기" : "Import work"}</Link>
            <Link href="/studio/new" className={buttonClass({ className: "gap-2" })}>
              <Plus size={16} aria-hidden="true" /> {locale === "ko" ? "새 비공개 작업" : "New private project"}
            </Link>
          </div>
        </div>

        <nav className="mt-7 overflow-x-auto" aria-label={locale === "ko" ? "스튜디오 작업 관리" : "Studio work management"}>
          <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-card p-1">
            {navViews.map((candidate) => (
              <Link
                key={candidate}
                href={viewHref(candidate)}
                aria-current={candidate === view ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-bold",
                  candidate === view ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {VIEW_LABELS[candidate][locale]}
              </Link>
            ))}
          </div>
        </nav>

        {message ? (
          <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/20 px-3 py-2 text-sm font-semibold text-fg">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} className="text-xs underline">{locale === "ko" ? "닫기" : "Dismiss"}</button>
          </div>
        ) : null}
        {library.error || profiles.error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">{library.error ?? profiles.error}</p>
        ) : null}

        {view === "active" ? <StudioQuickStart locale={locale} /> : null}

        {(view === "active" || view === "archived" || view === "trash") ? (
          <div className="mt-7">
            <label className="relative block max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" size={16} aria-hidden="true" />
              <span className="sr-only">{locale === "ko" ? "프로젝트 검색" : "Search projects"}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={locale === "ko" ? "내 작업 검색" : "Search my work"}
                className="min-h-11 w-full rounded-xl border border-line bg-card pl-10 pr-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            {filtered.length === 0 ? (
              <section className="mt-5 rounded-3xl border border-dashed border-line bg-card/60 px-5 py-14 text-center">
                <FolderOpen size={24} className="mx-auto text-fg-3" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-black text-fg">{locale === "ko" ? "표시할 작업이 없습니다" : "No work to show"}</h2>
                {view === "active" ? <Link href="/studio/new" className={buttonClass({ className: "mt-4" })}>{locale === "ko" ? "첫 비공개 작업 만들기" : "Create a private project"}</Link> : null}
              </section>
            ) : view === "active" ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((project) => (
                  <ActiveProjectCard
                    key={project.id}
                    project={project}
                    profile={profiles.profileFor(project.id)}
                    locale={locale}
                    onOpen={() => library.touch(project.id, project.lastOpenedDocumentId)}
                    onSavePackage={() => { void savePackage(project); }}
                    onAddProvider={(provider) => {
                      profiles.ensure(project.id);
                      profiles.addProvider(project.id, provider);
                      setMessage(locale === "ko" ? `${PROVIDER_OPTIONS.find((option) => option.provider === provider)?.label ?? provider} 연결을 준비했습니다. 인증 후 첫 동기화가 필요합니다.` : "Storage connection added. Authentication and first sync are still required.");
                    }}
                    onArchive={() => { library.archive(project.id); }}
                    onTrash={() => { library.trash(project.id); }}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {filtered.map((project) => (
                  <section key={project.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 className="font-black text-fg">{project.title}</h2><p className="mt-1 text-xs text-fg-3">{formatDate(project.updatedAt, locale)}</p></div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => view === "archived" ? library.activate(project.id) : library.restore(project.id)} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                        <RotateCcw size={14} aria-hidden="true" /> {locale === "ko" ? "복원" : "Restore"}
                      </button>
                      {view === "trash" ? (
                        <button type="button" onClick={() => { if (library.removePermanently(project.id)) profiles.remove(project.id); }} className={buttonClass({ variant: "quiet", size: "sm", className: "text-danger" })}>
                          <Trash2 size={14} aria-hidden="true" /> {locale === "ko" ? "완전 삭제" : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {view === "storage" ? <div className="mt-7"><StorageOverview projects={activeProjects} locale={locale} profileFor={profiles.profileFor} onSavePackage={(project) => { void savePackage(project); }} /></div> : null}
        {view === "exports" ? <div className="mt-7"><ExportOverview projects={activeProjects} submissions={submissions} locale={locale} /></div> : null}
        {view === "publications" ? <div className="mt-7"><PublicationOverview projects={activeProjects} locale={locale} profileFor={profiles.profileFor} /></div> : null}

        <footer className="mt-10 border-t border-line pt-5 text-xs leading-5 text-fg-3">
          {locale === "ko"
            ? "저장, 백업, 내보내기, 외부 제출, ToonSpectrum 게시는 서로 독립적으로 관리됩니다."
            : "Saving, backup, export, external submission and ToonSpectrum publishing are managed independently."}
        </footer>
      </Container>
    </main>
  );
}
